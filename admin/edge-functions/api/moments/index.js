/**
 * /api/moments  说说管理端 CRUD（Edge Functions，Edge Runtime）
 *
 *   GET    列表（读 moments_idx → 遍历月份分片合并 → 按 date 倒序）
 *   POST   新建一条说说
 *   PUT    更新一条（body 带 id）
 *   DELETE 删除一条（query ?id= 带 id）
 *
 * 为什么放 Edge Functions：KV 只有 Edge Functions 能访问（Cloud Functions 访问不到，
 * 见 docs/admin-console-plan.md 3.1 / 十三章）。而 Edge 多模块 import 会触发不可调试的
 * 545（坑 12/15），故本文件**单文件、零本地 import**：JWT 验签（Web Crypto HMAC-SHA256）、
 * KV 访问、响应封装全部内联。接受代码重复，换取彻底排除 545 黑盒。
 *
 * KV 存储设计（plan 5.2，单 key 存数组 + 按月分片，全程不用 list）：
 *   moments_idx           → { months: ["202607", ...], total: number }
 *   moments_<yyyymm>      → 当月说说数组（如 moments_202607）
 * key 仅数字/字母/下划线（KV 限制），故月份 key 用下划线拼接。
 *
 * 鉴权：middleware 只查 cookie 存在性（Edge 层不保证有 env，不验签）；本函数内联
 * verifyJwt 用 env.JWT_SECRET 真正验签。JWT 由 Cloud Functions 的 login（node:crypto
 * createHmac HS256）签发——两边同算法（HS256 / base64url / 同 secret），签名字节一致，
 * Edge 的 Web Crypto 可验 Cloud 签的 token（本文件核心待验点之一）。
 */

const SESSION_COOKIE = "firefly_admin_token";
const IDX_KEY = "moments_idx";

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
// 常量时间比较（长度先判等再逐字节，避免早退时序泄漏）
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
// 绑定变量名 firefly_kv（控制台绑定，全局可见）。读不到时给出明确错误便于定位。
function getKV() {
	// biome-ignore lint/correctness/noUndeclaredVariables: firefly_kv 是 EdgeOne KV 绑定的全局变量
	if (typeof firefly_kv === "undefined" || !firefly_kv) return null;
	// biome-ignore lint/correctness/noUndeclaredVariables: 同上
	return firefly_kv;
}
async function readIdx(kv) {
	const idx = await kv.get(IDX_KEY, { type: "json" });
	if (!idx || !Array.isArray(idx.months)) return { months: [], total: 0 };
	return { months: idx.months, total: typeof idx.total === "number" ? idx.total : 0 };
}
async function readMonth(kv, month) {
	const arr = await kv.get(monthKey(month), { type: "json" });
	return Array.isArray(arr) ? arr : [];
}
function monthKey(month) {
	return `moments_${month}`;
}
// 从 ISO 日期串取 yyyymm（用于分片）
function monthOf(dateStr) {
	const d = new Date(dateStr);
	if (Number.isNaN(d.getTime())) return null;
	const y = d.getUTCFullYear();
	const m = String(d.getUTCMonth() + 1).padStart(2, "0");
	return `${y}${m}`;
}

// ---------- 说说数据规整 ----------
// 只保留已知字段，防止任意字段写入 KV。images/tags 归一为数组。
function normalizeMoment(input, existing) {
	const now = new Date().toISOString();
	const m = existing ? { ...existing } : {};
	m.id = existing?.id || (input.id ? String(input.id) : crypto.randomUUID());
	m.content = typeof input.content === "string" ? input.content : m.content || "";
	m.date = typeof input.date === "string" && input.date ? input.date : m.date || now;
	m.images = Array.isArray(input.images) ? input.images.filter((s) => typeof s === "string") : m.images || [];
	m.tags = Array.isArray(input.tags) ? input.tags.filter((s) => typeof s === "string") : m.tags || [];
	if (typeof input.video === "string") m.video = input.video;
	else if (input.video === null) m.video = undefined;
	if (typeof input.location === "string") m.location = input.location;
	if (typeof input.locationUrl === "string") m.locationUrl = input.locationUrl;
	if (typeof input.mood === "string") m.mood = input.mood;
	if (typeof input.avatar === "string") m.avatar = input.avatar;
	if (input.imageDisplay && typeof input.imageDisplay === "object") m.imageDisplay = input.imageDisplay;
	m.createdAt = existing?.createdAt || now;
	m.updatedAt = now;
	// 去掉值为 undefined 的键，避免 JSON 里出现 "video": null 语义混乱
	for (const k of Object.keys(m)) if (m[k] === undefined) delete m[k];
	return m;
}

// ---------- 分片写回 + 索引维护 ----------
async function putMonth(kv, month, arr) {
	await kv.put(monthKey(month), JSON.stringify(arr));
}
async function writeIdx(kv, months, total) {
	// months 去重后按降序（新月在前），便于列表默认取最近
	const uniq = Array.from(new Set(months)).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
	await kv.put(IDX_KEY, JSON.stringify({ months: uniq, total }));
}

// ---------- 列表（GET） ----------
async function handleGet(context, kv) {
	const url = new URL(context.request.url);
	const monthParam = url.searchParams.get("month");
	const idx = await readIdx(kv);

	let items = [];
	if (monthParam) {
		items = await readMonth(kv, monthParam);
	} else {
		// 无 month：合并所有月份分片（管理端数据量可控，全量读回）
		for (const month of idx.months) {
			const arr = await readMonth(kv, month);
			items = items.concat(arr);
		}
	}
	// 按 date 倒序
	items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
	return json({ moments: items, total: idx.total, months: idx.months });
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
		return badRequest("说说内容必填");
	}
	const moment = normalizeMoment(body, null);
	const month = monthOf(moment.date);
	if (!month) return badRequest("日期无效");

	const arr = await readMonth(kv, month);
	arr.push(moment);
	await putMonth(kv, month, arr);

	const idx = await readIdx(kv);
	await writeIdx(kv, [...idx.months, month], idx.total + 1);

	return json({ ok: true, moment }, 201);
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

	const idx = await readIdx(kv);
	// 找到该 id 所在的月份分片
	for (const month of idx.months) {
		const arr = await readMonth(kv, month);
		const i = arr.findIndex((m) => m.id === id);
		if (i === -1) continue;

		const updated = normalizeMoment({ ...body, id }, arr[i]);
		const newMonth = monthOf(updated.date);
		if (!newMonth) return badRequest("日期无效");

		if (newMonth === month) {
			// 月份没变：原地更新
			arr[i] = updated;
			await putMonth(kv, month, arr);
			return json({ ok: true, moment: updated });
		}
		// 月份变了：从旧分片移除，加入新分片，可能新增月份
		arr.splice(i, 1);
		await putMonth(kv, month, arr);
		const target = await readMonth(kv, newMonth);
		target.push(updated);
		await putMonth(kv, newMonth, target);
		await writeIdx(kv, [...idx.months, newMonth], idx.total);
		return json({ ok: true, moment: updated });
	}
	return json({ error: "未找到该说说" }, 404);
}

// ---------- 删除（DELETE） ----------
async function handleDelete(context, kv) {
	const url = new URL(context.request.url);
	const id = url.searchParams.get("id");
	if (!id) return badRequest("缺少 id");

	const idx = await readIdx(kv);
	for (const month of idx.months) {
		const arr = await readMonth(kv, month);
		const i = arr.findIndex((m) => m.id === id);
		if (i === -1) continue;

		arr.splice(i, 1);
		await putMonth(kv, month, arr);
		// total 减 1；月份即使空了也保留在 months（下次写回自然覆盖，不做清理避免额外读）
		await writeIdx(kv, idx.months, Math.max(0, idx.total - 1));
		return json({ ok: true, id });
	}
	return json({ error: "未找到该说说" }, 404);
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
