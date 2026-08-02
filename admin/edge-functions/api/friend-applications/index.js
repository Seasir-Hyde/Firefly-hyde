/**
 * /api/friend-applications  友链申请管理端（Edge Functions，Edge Runtime）
 *
 *   GET    列表（读 friend_applications_all；可选 ?status=pending|approved|rejected）
 *   POST   审核：{ action: "approve"|"reject", id, rejectReason? }
 *          approve → 追加 normalizeFriend 到 friends_all（幂等去重）并标 approved
 *   DELETE 删除历史 ?id=
 *
 * 存储：申请队列单 key `friend_applications_all`（有 id）；友链仍用 `friends_all` 整数组无 id。
 * 单文件、零本地 import（规避 Edge 545）。
 */

const SESSION_COOKIE = "firefly_admin_token";
const APPS_KEY = "friend_applications_all";
const FRIENDS_KEY = "friends_all";

// ---------- 响应封装（内联） ----------
function json(data, status = 200, extraHeaders = {}) {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			"content-type": "application/json; charset=utf-8",
			"cache-control": "no-store",
			...extraHeaders,
		},
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
	if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000))
		return null;
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
async function readJsonArray(kv, key) {
	const arr = await kv.get(key, { type: "json" });
	return Array.isArray(arr) ? arr : [];
}
async function writeJson(kv, key, value) {
	await kv.put(key, JSON.stringify(value));
}

// 与 public/friend-apply.js 一致的 siteurl 规范化键
function normalizeSiteurlKey(url) {
	try {
		const u = new URL(String(url).trim());
		const host = u.hostname.toLowerCase();
		const path = u.pathname.replace(/\/+$/, "") || "";
		const search = u.search || "";
		const hash = u.hash || "";
		return `${u.protocol}//${host}${path}${search}${hash}`;
	} catch {
		return String(url || "")
			.trim()
			.replace(/\/+$/, "")
			.toLowerCase();
	}
}

// 对齐 friends/index.js normalizeFriend
function normalizeFriend(input) {
	if (!input || typeof input !== "object") return null;
	const title = typeof input.title === "string" ? input.title.trim() : "";
	const siteurl = typeof input.siteurl === "string" ? input.siteurl.trim() : "";
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
	for (const k of Object.keys(f)) {
		const v = f[k];
		if (v === undefined || v === null) delete f[k];
		else if (typeof v === "string" && v.trim() === "") delete f[k];
		else if (Array.isArray(v) && v.length === 0) delete f[k];
	}
	return f;
}

// ---------- GET 列表 ----------
async function handleGet(context, kv) {
	const url = new URL(context.request.url);
	const status = url.searchParams.get("status");
	let items = await readJsonArray(kv, APPS_KEY);
	if (status === "pending" || status === "approved" || status === "rejected") {
		items = items.filter((a) => a && a.status === status);
	}
	items = items.slice().sort((a, b) => {
		const ta = a?.createdAt ? Date.parse(a.createdAt) : 0;
		const tb = b?.createdAt ? Date.parse(b.createdAt) : 0;
		return tb - ta;
	});
	return json({ applications: items, total: items.length });
}

// ---------- POST 审核 ----------
async function handlePost(context, kv) {
	let body;
	try {
		body = await context.request.json();
	} catch {
		return badRequest("请求体解析失败");
	}
	const action = body?.action ? String(body.action) : "";
	const id = body?.id ? String(body.id) : "";
	if (!id) return badRequest("缺少 id");
	if (action !== "approve" && action !== "reject") {
		return badRequest("action 须为 approve 或 reject");
	}

	const apps = await readJsonArray(kv, APPS_KEY);
	const i = apps.findIndex((a) => a && a.id === id);
	if (i === -1) return json({ error: "未找到该申请" }, 404);
	const app = apps[i];
	if (app.status !== "pending") {
		return badRequest("仅待审核申请可操作");
	}

	const now = new Date().toISOString();

	if (action === "reject") {
		const reason =
			typeof body.rejectReason === "string" ? body.rejectReason.trim().slice(0, 200) : "";
		apps[i] = {
			...app,
			status: "rejected",
			updatedAt: now,
			reviewedAt: now,
		};
		if (reason) apps[i].rejectReason = reason;
		else delete apps[i].rejectReason;
		await writeJson(kv, APPS_KEY, apps);
		return json({ ok: true, application: apps[i] });
	}

	// approve：写入 friends_all（siteurl 已存在则跳过追加，仍标 approved）
	const friends = await readJsonArray(kv, FRIENDS_KEY);
	const siteKey = normalizeSiteurlKey(app.siteurl);
	const exists = friends.some(
		(f) => f && normalizeSiteurlKey(f.siteurl) === siteKey,
	);
	let appended = false;
	if (!exists) {
		const friend = normalizeFriend({
			title: app.title,
			imgurl: app.imgurl,
			desc: app.desc,
			siteurl: app.siteurl,
			weight: 0,
			enabled: true,
		});
		if (!friend) return badRequest("申请字段无法规整为友链（title/siteurl）");
		friends.push(friend);
		await writeJson(kv, FRIENDS_KEY, friends);
		appended = true;
	}

	apps[i] = {
		...app,
		status: "approved",
		updatedAt: now,
		reviewedAt: now,
	};
	delete apps[i].rejectReason;
	await writeJson(kv, APPS_KEY, apps);

	return json({
		ok: true,
		application: apps[i],
		appended,
		friendsTotal: friends.length,
	});
}

// ---------- DELETE ----------
async function handleDelete(context, kv) {
	const url = new URL(context.request.url);
	const id = url.searchParams.get("id");
	if (!id) return badRequest("缺少 id");

	const apps = await readJsonArray(kv, APPS_KEY);
	const i = apps.findIndex((a) => a && a.id === id);
	if (i === -1) return json({ error: "未找到该申请" }, 404);
	apps.splice(i, 1);
	await writeJson(kv, APPS_KEY, apps);
	return json({ ok: true, id });
}

export async function onRequest(context) {
	const auth = await requireAuth(context);
	if (!auth.ok) return auth.response;

	const kv = getKV();
	if (!kv) {
		return json(
			{
				error:
					"KV 未绑定：firefly_kv 全局变量不可用，请确认命名空间已绑定且已重新部署",
			},
			500,
		);
	}

	const method = context.request.method;
	if (method === "GET") return handleGet(context, kv);
	if (method === "POST") return handlePost(context, kv);
	if (method === "DELETE") return handleDelete(context, kv);
	return json({ error: "method_not_allowed" }, 405, {
		Allow: "GET, POST, DELETE",
	});
}
