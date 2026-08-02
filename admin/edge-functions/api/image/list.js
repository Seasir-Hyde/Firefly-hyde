/**
 * /api/image/list  已上传图片列表（Edge Functions，Edge Runtime）
 *
 *   GET ?scope=prefix|all&marker=<游标> → { items: [{key,url,fsize,putTimeMs,mimeType}], marker, hasMore }
 *
 * 服务端代理七牛 list 接口（rsf.qiniuapi.com/list，QBox 管理凭证），AK/SK 不出后端。
 * 七牛按 key 字典序升序返回（本方案 key 带 yyyy/MM 日期前缀 → 顺序≈时间升序），
 * 分页靠 marker 游标（响应 marker 非空 = 还有下一页）。
 *
 * QBox 签名（docs/admin-image-hosting-plan.md 第三章）：
 *   signingStr = <path>?<query>\n   （GET 无 body；query 必须与实际请求逐字符一致）
 *   Authorization: QBox <AK>:<urlsafeB64(hmacSha1(SK, signingStr))>
 *
 * 单文件零本地 import（Edge 多模块 import 会 545，见 docs/admin-console-plan.md 十三章坑 12/15）。
 */

const SESSION_COOKIE = "firefly_admin_token";
const CONFIG_KEY = "image_hosting_config";
const PAGE_LIMIT = 50;

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
async function qboxAuthorization(ak, sk, pathWithQuery) {
	// QBox 签名串：path?query 后必须跟 \n（GET 无 body）
	const sign = await hmacSha1(sk, `${pathWithQuery}\n`);
	return `QBox ${ak}:${bytesToUrlsafeB64(sign)}`;
}

export async function onRequestGet(context) {
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

	const url = new URL(context.request.url);
	const scope = url.searchParams.get("scope") === "all" ? "all" : "prefix";
	const marker = url.searchParams.get("marker") || "";
	const prefix = scope === "prefix" && typeof config.prefix === "string" ? config.prefix : "";

	// query 手工拼接：签名串与实际请求必须逐字符一致
	const qs = new URLSearchParams();
	qs.set("bucket", config.bucket);
	qs.set("limit", String(PAGE_LIMIT));
	if (prefix) qs.set("prefix", prefix);
	if (marker) qs.set("marker", marker);
	const pathWithQuery = `/list?${qs.toString()}`;

	const authorization = await qboxAuthorization(ak, sk, pathWithQuery);
	const resp = await fetch(`https://rsf.qiniuapi.com${pathWithQuery}`, {
		method: "GET",
		headers: {
			Authorization: authorization,
			"Content-Type": "application/x-www-form-urlencoded",
		},
	});

	const text = await resp.text();
	let data;
	try {
		data = JSON.parse(text);
	} catch {
		data = null;
	}
	if (!resp.ok) {
		const msg = data?.error || `七牛 list 接口返回 ${resp.status}`;
		return json({ error: `拉取图片列表失败：${msg}` }, 502);
	}

	const domain = typeof config.domain === "string" ? config.domain : "";
	const items = Array.isArray(data?.items)
		? data.items.map((it) => ({
				key: it.key,
				url: domain ? `${domain}/${it.key}` : "",
				fsize: typeof it.fsize === "number" ? it.fsize : 0,
				// 七牛 putTime 是 100 纳秒单位，转毫秒供前端 new Date() 直用
				putTimeMs: typeof it.putTime === "number" ? Math.floor(it.putTime / 10000) : 0,
				mimeType: typeof it.mimeType === "string" ? it.mimeType : "",
			}))
		: [];
	const nextMarker = typeof data?.marker === "string" ? data.marker : "";

	return json({ items, marker: nextMarker, hasMore: nextMarker !== "" });
}
