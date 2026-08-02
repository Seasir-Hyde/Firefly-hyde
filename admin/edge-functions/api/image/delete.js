/**
 * /api/image/delete  删除七牛空间里的图片（Edge Functions，Edge Runtime）
 *
 *   POST { key } → { ok: true, key }
 *
 * 服务端代理七牛 delete 接口（rs.qiniuapi.com/delete/<encodedEntry>，QBox 管理凭证）。
 * encodedEntry = urlsafeB64(bucket:key)。
 *
 * ⚠️ 删除不做全局引用检查（URL 可能已写进文章/说说/资料等处，删后引用处图裂）——
 * 前端 Popconfirm 强确认 + 警示文案兜底（docs/admin-image-hosting-plan.md 第九章风险 1，站长已知悉）。
 * 另：CDN 缓存可能让已删图片短时间仍可访问，非 bug。
 *
 * QBox 签名：signingStr = <path>\n（无 query 无 body）
 * 单文件零本地 import（Edge 多模块 import 会 545，见 docs/admin-console-plan.md 十三章坑 12/15）。
 */

const SESSION_COOKIE = "firefly_admin_token";
const CONFIG_KEY = "image_hosting_config";

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

// ---------- 七牛 QBox 管理凭证（Web Crypto HMAC-SHA1） ----------
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

export async function onRequestPost(context) {
	const auth = await requireAuth(context);
	if (!auth.ok) return auth.response;

	const ak = context.env?.QINIU_ACCESS_KEY;
	const sk = context.env?.QINIU_SECRET_KEY;
	if (!ak || !sk) {
		return json({ error: "七牛密钥未配置：请在 EdgeOne 控制台配置 QINIU_ACCESS_KEY / QINIU_SECRET_KEY 并重新部署" }, 500);
	}

	const kv = getKV();
	if (!kv) return json({ error: "KV 未绑定：firefly_kv 全局变量不可用" }, 500);
	const config = await kv.get(CONFIG_KEY, { type: "json" });
	if (!config || !config.bucket) {
		return badRequest("图床未配置：请先在系统设置 → 图床中填写空间名");
	}

	let body;
	try {
		body = await context.request.json();
	} catch {
		return badRequest("请求体解析失败");
	}
	const key = typeof body?.key === "string" ? body.key.trim() : "";
	if (!key) return badRequest("缺少要删除的图片 key");

	// encodedEntry = urlsafeB64(bucket:key)；签名串 = /delete/<encodedEntry>\n
	const encodedEntry = utf8ToUrlsafeB64(`${config.bucket}:${key}`);
	const path = `/delete/${encodedEntry}`;
	const sign = await hmacSha1(sk, `${path}\n`);
	const authorization = `QBox ${ak}:${bytesToUrlsafeB64(sign)}`;

	const resp = await fetch(`https://rs.qiniuapi.com${path}`, {
		method: "POST",
		headers: {
			Authorization: authorization,
			"Content-Type": "application/x-www-form-urlencoded",
		},
	});

	// 七牛 delete 成功返回 200 空 body；612 = 文件不存在（视为已删，幂等处理）
	if (resp.ok || resp.status === 612) {
		return json({ ok: true, key });
	}
	const text = await resp.text();
	let msg = `七牛 delete 接口返回 ${resp.status}`;
	try {
		msg = JSON.parse(text)?.error || msg;
	} catch {
		// 非 JSON 响应保留状态码提示
	}
	return json({ error: `删除失败：${msg}` }, 502);
}
