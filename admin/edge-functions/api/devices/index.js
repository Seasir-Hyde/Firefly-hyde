/**
 * /api/devices  设备管理端读写（Edge Functions，Edge Runtime）
 *
 *   GET  列表（读单 key devices_all）
 *   PUT  整体覆盖（body: { devices: Record<类别, Device[]> }）—— 与 DataPage「本地暂存 + 整体保存」交互对齐
 *
 * 存储设计：设备是嵌套结构 Record<类别, Device[]>，单 key `devices_all` 存整个对象。
 * 不做单条增删改（DataPage 侧拍平编辑、保存时按类别重组），故无需给每条补 id。
 *
 * 为什么放 Edge Functions + 单文件零本地 import：KV 只有 Edge 能访问，而 Edge 多模块
 * import 会 545 且无日志（见 docs/admin-console-plan.md 十三章坑 12/15）。同 friends/index.js，
 * JWT 验签（Web Crypto HMAC-SHA256）、KV 访问、响应封装全部内联。
 *
 * 数据模型（对齐博客 src/data/devices.json / src/data/devices.ts Device）：
 *   { name, image, specs, description, link, price? }
 * KV 存裸对象；API 响应用 { devices, total } 包一层（total = 所有类别设备数之和）。
 */

const SESSION_COOKIE = "firefly_admin_token";
const DATA_KEY = "devices_all";

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
	const obj = await kv.get(DATA_KEY, { type: "json" });
	// 必须是非 null 对象且非数组
	if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
	return obj;
}
async function writeAll(kv, obj) {
	await kv.put(DATA_KEY, JSON.stringify(obj));
}

// 统计嵌套对象里的设备总数
function countDevices(map) {
	let n = 0;
	for (const list of Object.values(map)) {
		if (Array.isArray(list)) n += list.length;
	}
	return n;
}

// ---------- 设备数据规整 ----------
// 只保留已知字段，防任意字段写入 KV；空值键剔除，贴近手写 JSON 风格。
function normalizeDevice(input) {
	if (!input || typeof input !== "object") return null;
	const name = typeof input.name === "string" ? input.name.trim() : "";
	// 名称是必填
	if (!name) return null;
	const d = {
		name,
		image: typeof input.image === "string" ? input.image.trim() : "",
		specs: typeof input.specs === "string" ? input.specs : "",
		description: typeof input.description === "string" ? input.description : "",
		link: typeof input.link === "string" ? input.link.trim() : "",
		price: typeof input.price === "string" ? input.price.trim() : undefined,
	};
	// 剔除空字符串 / undefined
	for (const k of Object.keys(d)) {
		const v = d[k];
		if (v === undefined || v === null) delete d[k];
		else if (typeof v === "string" && v.trim() === "") delete d[k];
	}
	return d;
}

// 把 body.devices 规整为 Record<类别, Device[]>
function normalizeDevicesMap(input) {
	if (!input || typeof input !== "object" || Array.isArray(input)) return null;
	const out = {};
	for (const [rawKey, list] of Object.entries(input)) {
		const category = typeof rawKey === "string" ? rawKey.trim() : "";
		if (!category) continue;
		if (!Array.isArray(list)) continue;
		const devices = list.map(normalizeDevice).filter(Boolean);
		// 空类别（规整后无设备）跳过
		if (devices.length === 0) continue;
		out[category] = devices;
	}
	return out;
}

// ---------- 列表（GET） ----------
async function handleGet(_context, kv) {
	const devices = await readAll(kv);
	return json({ devices, total: countDevices(devices) });
}

// ---------- 整体覆盖（PUT） ----------
async function handlePut(context, kv) {
	let body;
	try {
		body = await context.request.json();
	} catch {
		return badRequest("请求体解析失败");
	}
	const raw = body?.devices;
	const normalized = normalizeDevicesMap(raw);
	if (normalized === null) return badRequest("缺少 devices 对象（Record<类别, Device[]>）");
	await writeAll(kv, normalized);
	return json({ ok: true, devices: normalized, total: countDevices(normalized) });
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
