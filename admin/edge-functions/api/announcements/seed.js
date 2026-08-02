/**
 * POST /api/announcements/seed  公告存量数据导入（Edge Functions，Edge Runtime）
 *
 * 同 moments/seed.js 的理由：KV 只有 Edge 能访问，存量数据经受保护端点写入。
 * 幂等：默认已有数据（数组非空）则跳过；带 ?force=1 强制重种（清空后重写）。
 *
 * 种子数据：转自博客 src/config/announcementConfig.ts 的单条公告。
 *
 * 单文件、零本地 import（避免 545）。
 */

const SESSION_COOKIE = "firefly_admin_token";
const DATA_KEY = "announcements_all";

// ---------- 响应封装（内联） ----------
function json(data, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
	});
}
function unauthorized(message = "未登录或会话已过期") {
	return json({ error: message }, 401);
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

// ---------- 种子数据（转自 src/config/announcementConfig.ts） ----------
function seedAnnouncements() {
	const now = new Date().toISOString();
	return [
		{
			id: crypto.randomUUID(),
			title: "📢 欢迎来访者",
			content: "👋🏻 Hi，我是像风，欢迎您！",
			closable: false,
			link: { enable: true, text: "了解更多", url: "/about/", external: false },
			createdAt: now,
			updatedAt: now,
		},
	];
}

export async function onRequest(context) {
	if (context.request.method !== "POST") {
		return json({ error: "method_not_allowed" }, 405);
	}
	const auth = await requireAuth(context);
	if (!auth.ok) return auth.response;

	const kv = getKV();
	if (!kv) {
		return json(
			{ error: "KV 未绑定：firefly_kv 全局变量不可用，请确认命名空间已绑定且已重新部署" },
			500,
		);
	}

	const url = new URL(context.request.url);
	const force = url.searchParams.get("force") === "1";

	const existing = await kv.get(DATA_KEY, { type: "json" });
	const existingCount = Array.isArray(existing) ? existing.length : 0;
	if (existingCount > 0 && !force) {
		return json({ ok: true, skipped: true, reason: "已有数据，未导入（用 ?force=1 强制重种）", total: existingCount });
	}

	const items = seedAnnouncements();
	await kv.put(DATA_KEY, JSON.stringify(items));
	return json({ ok: true, seeded: items.length });
}
