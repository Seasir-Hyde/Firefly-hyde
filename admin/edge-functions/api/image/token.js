/**
 * /api/image/token  签发七牛上传凭证 uptoken（Edge Functions，Edge Runtime）
 *
 *   POST { filename } → { token, key, uploadHost, publicUrl }
 *
 * 上传走客户端直传（浏览器 FormData → 七牛上传域名，图片不经过 EdgeOne），
 * 本接口只负责签发短时效凭证（docs/admin-image-hosting-plan.md 第三/六章）。
 *
 * 安全设计：
 *   - AK/SK 只从环境变量读（QINIU_ACCESS_KEY / QINIU_SECRET_KEY），绝不落 KV/日志/响应
 *   - key 由后端生成（<prefix>yyyy/MM/<随机16hex>.<ext>），scope 锁定 bucket:key + insertOnly，
 *     前端无法指定路径 → 防越权覆盖
 *   - putPolicy 带 deadline 1h + mimeLimit image/* + fsizeLimit（来自 KV 配置 maxSizeMB）
 *
 * 单文件零本地 import（Edge 多模块 import 会 545，见 docs/admin-console-plan.md 十三章坑 12/15）。
 */

const SESSION_COOKIE = "firefly_admin_token";
const CONFIG_KEY = "image_hosting_config";

// 区域代号 → 上传域名（docs/admin-image-hosting-plan.md 第三章映射表）
const UPLOAD_HOSTS = {
	z0: "https://up.qiniup.com",
	z1: "https://up-z1.qiniup.com",
	z2: "https://up-z2.qiniup.com",
	na0: "https://up-na0.qiniup.com",
	as0: "https://up-as0.qiniup.com",
};

// ---------- 响应封装（内联） ----------
function json(data, status = 200, extraHeaders = {}) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extraHeaders },
	});
}
function unauthorized(message = "未登录或会话已过期") {
	return json({ error: message }, 401);
}
function badRequest(message) {
	return json({ error: message }, 400);
}

// ---------- Cookie（内联） ----------
function readCookie(cookieHeader, name) {
	if (!cookieHeader) return null;
	for (const seg of cookieHeader.split(";")) {
		const [k, ...v] = seg.trim().split("=");
		if (k === name) return decodeURIComponent(v.join("="));
	}
	return null;
}

// ---------- JWT 验签（内联，Web Crypto HMAC-SHA256） ----------
function b64urlToBytes(str) {
	const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
	const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
	const bin = atob(b64);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytes;
}
// 常量时间比较
function timingSafeEqual(a, b) {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
	return diff === 0;
}
async function verifyJwt(token, secret) {
	const parts = token.split(".");
	if (parts.length !== 3) return null;
	const [header, body, sigB64] = parts;
	const signingInput = `${header}.${body}`;
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const expected = new Uint8Array(
		await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput)),
	);
	// 畸形 token 的 base64url 解码会抛异常（atob 遇非法字符），捕获后按验签失败处理，避免 545
	let actual;
	try {
		actual = b64urlToBytes(sigB64);
	} catch {
		return null;
	}
	if (!timingSafeEqual(expected, actual)) return null;
	let payload;
	try {
		payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(body)));
	} catch {
		return null;
	}
	if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
	return payload;
}
async function requireAuth(context) {
	const secret = context.env?.JWT_SECRET;
	if (!secret) return { ok: false, response: json({ error: "server_misconfigured" }, 500) };
	const token = readCookie(context.request.headers.get("cookie"), SESSION_COOKIE);
	if (!token) return { ok: false, response: unauthorized() };
	const payload = await verifyJwt(token, secret);
	if (!payload) return { ok: false, response: unauthorized() };
	return { ok: true, payload };
}

// ---------- KV 辅助 ----------
function getKV() {
	// biome-ignore lint/correctness/noUndeclaredVariables: firefly_kv 是 EdgeOne KV 绑定的全局变量
	if (typeof firefly_kv === "undefined" || !firefly_kv) return null;
	// biome-ignore lint/correctness/noUndeclaredVariables: 同上
	return firefly_kv;
}

// ---------- 七牛 uptoken 签名（Web Crypto HMAC-SHA1，阶段0 已真机验证支持） ----------
// 七牛的 urlsafe_base64：标准 base64 后把 + / 替换为 - _，**保留 padding =**
function bytesToUrlsafeB64(bytes) {
	let bin = "";
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_");
}
function utf8ToUrlsafeB64(str) {
	return bytesToUrlsafeB64(new TextEncoder().encode(str));
}
async function hmacSha1(secret, message) {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-1" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
	return new Uint8Array(sig);
}

// ---------- key 生成 ----------
// <prefix>yyyy/MM/<随机16hex>.<ext>：日期前缀让 list 的 key 字典序近似时间序，随机段防重名/防猜测
function buildKey(prefix, filename) {
	// 扩展名白名单化：取最后一个 . 后的部分，只留字母数字、长度 1~8，取不到默认 png
	let ext = "png";
	if (typeof filename === "string") {
		const m = filename.toLowerCase().match(/\.([a-z0-9]{1,8})$/);
		if (m) ext = m[1];
	}
	// 用 UTC+8 计算年月（站长在东八区，归档目录按本地直觉）
	const now = new Date(Date.now() + 8 * 3600 * 1000);
	const yyyy = now.getUTCFullYear();
	const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
	const rand = crypto.getRandomValues(new Uint8Array(8));
	const hex = [...rand].map((b) => b.toString(16).padStart(2, "0")).join("");
	return `${prefix}${yyyy}/${mm}/${hex}.${ext}`;
}

export async function onRequestPost(context) {
	const auth = await requireAuth(context);
	if (!auth.ok) return auth.response;

	const ak = context.env?.QINIU_ACCESS_KEY;
	const sk = context.env?.QINIU_SECRET_KEY;
	if (!ak || !sk) {
		return json({ error: "七牛密钥未配置：请在 EdgeOne 控制台配置 QINIU_ACCESS_KEY / QINIU_SECRET_KEY 并重新部署" }, 500);
	}

	const kv = getKV();
	if (!kv) {
		return json({ error: "KV 未绑定：firefly_kv 全局变量不可用" }, 500);
	}
	const config = await kv.get(CONFIG_KEY, { type: "json" });
	if (!config || config.enabled !== true) {
		return badRequest("图床未启用：请先在系统设置 → 图床中完成配置并启用");
	}
	if (!config.bucket || !config.domain) {
		return badRequest("图床配置不完整：缺少空间名或访问域名");
	}
	const uploadHost = UPLOAD_HOSTS[config.region];
	if (!uploadHost) {
		return badRequest("图床配置不完整：存储区域无效");
	}

	let body;
	try {
		body = await context.request.json();
	} catch {
		return badRequest("请求体解析失败");
	}
	const filename = typeof body?.filename === "string" ? body.filename : "";

	const prefix = typeof config.prefix === "string" ? config.prefix : "";
	const key = buildKey(prefix, filename);
	const maxSizeMB = Number(config.maxSizeMB) >= 1 ? Math.round(Number(config.maxSizeMB)) : 10;

	// putPolicy：scope 锁定到具体 key + insertOnly 禁覆盖，deadline 1 小时
	const putPolicy = {
		scope: `${config.bucket}:${key}`,
		deadline: Math.floor(Date.now() / 1000) + 3600,
		insertOnly: 1,
		fsizeLimit: maxSizeMB * 1024 * 1024,
		mimeLimit: "image/*",
	};

	// uptoken = AK : urlsafeB64(hmacSha1(SK, encodedPolicy)) : encodedPolicy
	const encodedPolicy = utf8ToUrlsafeB64(JSON.stringify(putPolicy));
	const sign = await hmacSha1(sk, encodedPolicy);
	const token = `${ak}:${bytesToUrlsafeB64(sign)}:${encodedPolicy}`;

	return json({
		token,
		key,
		uploadHost,
		// 访问 URL 由后端权威拼接（domain 存 KV 时已去尾斜杠）
		publicUrl: `${config.domain}/${key}`,
	});
}
