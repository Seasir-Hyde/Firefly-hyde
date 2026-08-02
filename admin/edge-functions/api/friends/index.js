/**
 * /api/friends  友链管理端读写（Edge Functions，Edge Runtime）
 *
 *   GET  列表（读单 key friends_all）
 *   PUT  整体覆盖（body: { friends: [...] }）—— 与 DataPage「本地暂存 + 整体保存」交互对齐
 *
 * 存储设计：友链数据量小，单 key `friends_all` 存整个数组，读「整体 get」、写「整体 put」。
 * 不做单条增删改（DataPage 侧本地维护行数据，保存时整体写回），故无需给每条补 id。
 *
 * 为什么放 Edge Functions + 单文件零本地 import：KV 只有 Edge 能访问，而 Edge 多模块
 * import 会 545 且无日志（见 docs/admin-console-plan.md 十三章坑 12/15）。同 announcements/index.js，
 * JWT 验签（Web Crypto HMAC-SHA256）、KV 访问、响应封装全部内联。
 *
 * 数据模型（对齐博客 src/data/friends.json / src/types/config.ts FriendLink）：
 *   { title, imgurl, desc, siteurl, tags?, weight, enabled }
 */

const SESSION_COOKIE = "firefly_admin_token";
const DATA_KEY = "friends_all";

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
async function readAll(kv) {
	const arr = await kv.get(DATA_KEY, { type: "json" });
	return Array.isArray(arr) ? arr : [];
}
async function writeAll(kv, arr) {
	await kv.put(DATA_KEY, JSON.stringify(arr));
}

// ---------- 友链数据规整 ----------
// 只保留已知字段，防任意字段写入 KV；空值键剔除，贴近手写 JSON 风格。
function normalizeFriend(input) {
	if (!input || typeof input !== "object") return null;
	const title = typeof input.title === "string" ? input.title.trim() : "";
	const siteurl = typeof input.siteurl === "string" ? input.siteurl.trim() : "";
	// 标题与站点地址是必填，缺一则丢弃该条
	if (!title || !siteurl) return null;
	const f = {
		title,
		imgurl: typeof input.imgurl === "string" ? input.imgurl.trim() : "",
		desc: typeof input.desc === "string" ? input.desc : "",
		siteurl,
		tags: Array.isArray(input.tags)
			? input.tags.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim())
			: [],
		weight: Number.isFinite(input.weight) ? input.weight : Number(input.weight) || 0,
		enabled: input.enabled !== false,
	};
	// 剔除空字符串 / 空数组，贴近手写风格
	for (const k of Object.keys(f)) {
		const v = f[k];
		if (v === undefined || v === null) delete f[k];
		else if (typeof v === "string" && v.trim() === "") delete f[k];
		else if (Array.isArray(v) && v.length === 0) delete f[k];
	}
	return f;
}

// ---------- 列表（GET） ----------
async function handleGet(_context, kv) {
	const items = await readAll(kv);
	return json({ friends: items, total: items.length });
}

// ---------- 整体覆盖（PUT） ----------
async function handlePut(context, kv) {
	let body;
	try {
		body = await context.request.json();
	} catch {
		return badRequest("请求体解析失败");
	}
	const list = body?.friends;
	if (!Array.isArray(list)) return badRequest("缺少 friends 数组");
	const normalized = list.map(normalizeFriend).filter(Boolean);
	await writeAll(kv, normalized);
	return json({ ok: true, friends: normalized, total: normalized.length });
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
