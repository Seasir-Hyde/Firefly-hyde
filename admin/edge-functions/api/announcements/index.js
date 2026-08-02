/**
 * /api/announcements  公告管理端 CRUD（Edge Functions，Edge Runtime）
 *
 *   GET    列表（读单 key announcements_all）
 *   POST   新建一条公告
 *   PUT    更新一条（body 带 id）
 *   DELETE 删除一条（query ?id= 带 id）
 *
 * 存储设计（plan 5.2）：公告数据量小，单 key `announcements_all` 存整个数组，
 * 不分片、不用 list。读「整体 get」、写「读出→改→整体 put」。
 *
 * 为什么放 Edge Functions + 单文件零本地 import：KV 只有 Edge 能访问，而 Edge 多模块
 * import 会 545 且无日志（见 docs/admin-console-plan.md 十三章坑 12/15）。同 moments/index.js，
 * JWT 验签（Web Crypto HMAC-SHA256）、KV 访问、响应封装全部内联。
 *
 * 数据模型（对齐博客 src/config/announcementConfig.ts）：
 *   { id, title, content, closable, link?: { enable, text, url, external }, createdAt, updatedAt }
 */

const SESSION_COOKIE = "firefly_admin_token";
const DATA_KEY = "announcements_all";

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

// ---------- 公告数据规整 ----------
// 只保留已知字段，防任意字段写入 KV。
function normalizeLink(input) {
	if (!input || typeof input !== "object") return undefined;
	if (typeof input.url !== "string" || !input.url.trim()) return undefined;
	return {
		enable: input.enable !== false,
		text: typeof input.text === "string" ? input.text : "",
		url: input.url,
		external: input.external === true,
	};
}
function normalizeAnnouncement(input, existing) {
	const now = new Date().toISOString();
	const a = existing ? { ...existing } : {};
	a.id = existing?.id || (input.id ? String(input.id) : crypto.randomUUID());
	a.title = typeof input.title === "string" ? input.title : a.title || "";
	a.content = typeof input.content === "string" ? input.content : a.content || "";
	a.closable = typeof input.closable === "boolean" ? input.closable : (a.closable ?? true);
	const link = normalizeLink(input.link);
	if (link) a.link = link;
	else if (input.link === null || (input.link && !normalizeLink(input.link))) a.link = undefined;
	a.createdAt = existing?.createdAt || now;
	a.updatedAt = now;
	for (const k of Object.keys(a)) if (a[k] === undefined) delete a[k];
	return a;
}

// ---------- 列表（GET） ----------
async function handleGet(_context, kv) {
	const items = await readAll(kv);
	return json({ announcements: items, total: items.length });
}

// ---------- 新建（POST） ----------
async function handlePost(context, kv) {
	let body;
	try {
		body = await context.request.json();
	} catch {
		return badRequest("请求体解析失败");
	}
	if (!body || typeof body.content !== "string" || body.content.trim() === "") {
		return badRequest("公告内容必填");
	}
	const item = normalizeAnnouncement(body, null);
	const arr = await readAll(kv);
	arr.push(item);
	await writeAll(kv, arr);
	return json({ ok: true, announcement: item }, 201);
}

// ---------- 更新（PUT） ----------
async function handlePut(context, kv) {
	let body;
	try {
		body = await context.request.json();
	} catch {
		return badRequest("请求体解析失败");
	}
	const id = body?.id ? String(body.id) : null;
	if (!id) return badRequest("缺少 id");

	const arr = await readAll(kv);
	const i = arr.findIndex((a) => a.id === id);
	if (i === -1) return json({ error: "未找到该公告" }, 404);

	arr[i] = normalizeAnnouncement({ ...body, id }, arr[i]);
	await writeAll(kv, arr);
	return json({ ok: true, announcement: arr[i] });
}

// ---------- 删除（DELETE） ----------
async function handleDelete(context, kv) {
	const url = new URL(context.request.url);
	const id = url.searchParams.get("id");
	if (!id) return badRequest("缺少 id");

	const arr = await readAll(kv);
	const i = arr.findIndex((a) => a.id === id);
	if (i === -1) return json({ error: "未找到该公告" }, 404);

	arr.splice(i, 1);
	await writeAll(kv, arr);
	return json({ ok: true, id });
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
	if (method === "POST") return handlePost(context, kv);
	if (method === "PUT") return handlePut(context, kv);
	if (method === "DELETE") return handleDelete(context, kv);
	return json({ error: "method_not_allowed" }, 405, { Allow: "GET, POST, PUT, DELETE" });
}
