/**
 * /api/image/config  图床业务配置读写（Edge Functions，Edge Runtime）
 *
 *   GET  读业务配置（供配置页回显 + 上传组件取域名/前缀），KV 无数据时返回默认值
 *   PUT  存业务配置（字段白名单校验，非法值 400）
 *
 * 存储设计（docs/admin-image-hosting-plan.md 第五章，路径 A）：配置存 KV 单 key
 * `image_hosting_config`，不含任何密钥（AK/SK 只在环境变量，见 token 签发接口）。
 * 配置模型：{ bucket, domain, region, prefix, maxSizeMB, enabled }
 *
 * 为什么放 Edge Functions + 单文件零本地 import：KV 只有 Edge 能访问，而 Edge 多模块
 * import 会 545 且无日志（见 docs/admin-console-plan.md 十三章坑 12/15）。同 quotes/index.js，
 * JWT 验签（Web Crypto HMAC-SHA256）、KV 访问、响应封装全部内联。
 */

const SESSION_COOKIE = "firefly_admin_token";
const DATA_KEY = "image_hosting_config";

// 七牛存储区域白名单（上传/管理域名映射在 token 接口做，这里只存代号）
const REGIONS = ["z0", "z1", "z2", "na0", "as0"];

// 上传时转换的目标格式白名单（转码在浏览器本地做，这里只存偏好）
const CONVERT_FORMATS = ["webp", "avif"];

// 默认配置：未配置时 GET 返回它；enabled 默认 false，防止半配置状态上传失败
const DEFAULT_CONFIG = {
	bucket: "",
	domain: "",
	region: "z0",
	prefix: "blog-img/",
	maxSizeMB: 10,
	enabled: false,
	convertEnabled: false,
	convertFormat: "webp",
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

// ---------- 配置规整与校验 ----------
// 只接受白名单字段；返回 { config } 或 { error }
function normalizeConfig(input) {
	if (!input || typeof input !== "object") return { error: "请求体必须是配置对象" };

	const bucket = typeof input.bucket === "string" ? input.bucket.trim() : "";
	let domain = typeof input.domain === "string" ? input.domain.trim() : "";
	// 域名统一去掉尾部斜杠，拼 URL 时由后端补（避免 domain//key 双斜杠）
	domain = domain.replace(/\/+$/, "");
	if (domain !== "" && !/^https?:\/\//.test(domain)) {
		return { error: "访问域名必须以 http:// 或 https:// 开头" };
	}

	const region = typeof input.region === "string" ? input.region : "";
	if (!REGIONS.includes(region)) {
		return { error: `存储区域必须是 ${REGIONS.join(" / ")} 之一` };
	}

	let prefix = typeof input.prefix === "string" ? input.prefix.trim() : "";
	// 前缀不允许以 / 开头（七牛 key 无根斜杠概念，避免生成 //xxx key）
	prefix = prefix.replace(/^\/+/, "");

	const maxSizeMB = Number(input.maxSizeMB);
	if (!Number.isFinite(maxSizeMB) || maxSizeMB < 1 || maxSizeMB > 100) {
		return { error: "上传大小上限必须是 1~100 之间的数字（MB）" };
	}

	const enabled = input.enabled === true;
	// 启用时 bucket 与域名是硬前提（没它们上传成功也拼不出可访问 URL）
	if (enabled && (bucket === "" || domain === "")) {
		return { error: "启用图床前必须先填写空间名和访问域名" };
	}

	const convertEnabled = input.convertEnabled === true;
	// 开关关闭时前端字段会卸载不下发 convertFormat，此处兜底默认 webp
	const convertFormat = CONVERT_FORMATS.includes(input.convertFormat) ? input.convertFormat : "webp";

	return {
		config: { bucket, domain, region, prefix, maxSizeMB: Math.round(maxSizeMB), enabled, convertEnabled, convertFormat },
	};
}

// ---------- 读配置（GET） ----------
async function handleGet(_context, kv) {
	const stored = await kv.get(DATA_KEY, { type: "json" });
	// 与默认值合并：日后新增配置项时，旧 KV 数据也能补全字段
	const config = stored && typeof stored === "object" ? { ...DEFAULT_CONFIG, ...stored } : DEFAULT_CONFIG;
	return json(config);
}

// ---------- 存配置（PUT） ----------
async function handlePut(context, kv) {
	let body;
	try {
		body = await context.request.json();
	} catch {
		return badRequest("请求体解析失败");
	}
	const result = normalizeConfig(body);
	if (result.error) return badRequest(result.error);

	await kv.put(DATA_KEY, JSON.stringify(result.config));
	return json({ ok: true, config: result.config });
}

export async function onRequest(context) {
	const auth = await requireAuth(context);
	if (!auth.ok) return auth.response;

	const kv = getKV();
	if (!kv) {
		return json(
			{ error: "KV 未绑定：firefly_kv 全局变量不可用，请确认命名空间已绑定且已重新部署" },
			500,
		);
	}

	const method = context.request.method;
	if (method === "GET") return handleGet(context, kv);
	if (method === "PUT") return handlePut(context, kv);
	return json({ error: "method_not_allowed" }, 405, { Allow: "GET, PUT" });
}
