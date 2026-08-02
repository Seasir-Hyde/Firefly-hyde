/**
 * POST /api/moments/seed  说说存量数据导入（Edge Functions，Edge Runtime）
 *
 * 为什么用受保护端点导入而非本地脚本：KV 只有 Edge Functions 能访问（Cloud Functions
 * 和本地脚本都写不了 KV，见 docs/admin-console-plan.md 3.1），故存量数据只能经由一个
 * 运行在 Edge 的受保护端点写入。
 *
 * 幂等：默认 total>0 时跳过（避免重复导入）；带 ?force=1 时无视已有数据强制重新种子
 * （会清空后重写，仅联调用）。
 *
 * 种子数据：从 src/data/diary.ts 的示例说说转换而来（图片 URL 原样保留，走外部图床）。
 *
 * 单文件、零本地 import（同 index.js 的理由，规避 Edge 545）。
 */

const SESSION_COOKIE = "firefly_admin_token";
const IDX_KEY = "moments_idx";

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
function monthKey(month) {
	return `moments_${month}`;
}
function monthOf(dateStr) {
	const d = new Date(dateStr);
	if (Number.isNaN(d.getTime())) return null;
	return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ---------- 种子数据（转自 src/data/diary.ts） ----------
function seedMoments() {
	const now = new Date().toISOString();
	const raw = [
		{
			content: "📍𝘾𝙝𝙪𝙖𝙣𝙓𝙞丨川西\n勇敢的人先享受高反再享受世界🗺️✨🤣",
			date: "2026-05-01T10:30:00Z",
			location: "阿坝藏族羌族自治州·四姑娘山景区",
			locationUrl: "https://j.map.baidu.com/cf/2M",
			images: [
				"https://i.postimg.cc/Z54VY6DF/1040g2sg31fatmlv6me7g5ndqintg8sfbhhno2so-nd-dft-wlteh-webp-3.webp",
				"https://i.postimg.cc/52bn98k8/1040g2sg31fatmlv6me805ndqintg8sfbee0hv3o-nd-dft-wlteh-webp-3.webp",
				"https://i.postimg.cc/zG80DTPy/1040g2sg31fatmlv6me905ndqintg8sfbdnvlebo-nd-dft-wlteh-webp-3.webp",
				"https://i.postimg.cc/rwMQy5Yy/1040g2sg31fatmlv6me9g5ndqintg8sfbkfu6ja0-nd-dft-wlteh-webp-3.webp",
				"https://i.postimg.cc/3xYnr2bw/1040g2sg31fatmlv6meb05ndqintg8sfbe4ho350-nd-dft-wlteh-webp-3.webp",
				"https://i.postimg.cc/zG80DTPG/1040g3qg31vmkbstgjq0g4ark0mecm6c2ogerg5o-nd-dft-wlteh-webp-3.webp",
				"https://i.postimg.cc/kXxTdTwB/1040g3qg31vmkbstgjq6g4ark0mecm6c2hceerd8-nd-dft-wlteh-webp-3.webp",
				"https://i.postimg.cc/g2mNc3BL/1040g3qg31vmkgeuuia104ark0mecm6c2ensa8n8-nd-dft-wlteh-webp-3.webp",
				"https://i.postimg.cc/dt85K5ny/1040g3qg31vmkgeuuia304ark0mecm6c27chnl9g-nd-dft-wlteh-webp-3.webp",
			],
			tags: ["川西", "高反", "世界"],
			mood: "😊",
			imageDisplay: { type: "grid", autoPlay: true, interval: 4000, showIndicator: true, showControls: true },
		},
		{
			content: "轮播示例",
			date: "2026-05-01T10:30:00Z",
			locationUrl: "https://j.map.baidu.com/cf/2M",
			images: [
				"https://tc.alcy.cc/tc/20260429/91e113df15bffb3f8bdb26815a657eb2.webp",
				"https://tc.alcy.cc/tc/20260429/f24f72bb6ddd659014616eb988b17385.webp",
				"https://tc.alcy.cc/tc/20260429/64fd71741c204cf10b3f39c6a2c22216.webp",
				"https://tc.alcy.cc/tc/20260429/3203d4425f7c3c8704ecc63d59fad1be.webp",
			],
			tags: ["轮播示例"],
			mood: "😊",
			imageDisplay: { type: "carousel", autoPlay: true, interval: 4000, showIndicator: true, showControls: true },
		},
		{
			content: "YouTube",
			date: "2026-05-01T10:30:00Z",
			images: [],
			video: "https://www.youtube.com/embed/5gIf0_xpFPI?si=N1WTorLKL0uwLsU_",
			tags: ["YouTube"],
			mood: "😊",
		},
		{
			content: "Bilibili",
			date: "2026-05-01T10:30:00Z",
			locationUrl: "https://j.map.baidu.com/cf/2M",
			images: [],
			video: "https://www.bilibili.com/video/BV1uzRjBAEjL?t=3.6",
			tags: ["Bilibili"],
			mood: "😊",
		},
	];
	return raw.map((r) => ({ ...r, id: crypto.randomUUID(), createdAt: now, updatedAt: now }));
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

	// 幂等：已有数据且非强制 → 跳过
	const existingIdx = await kv.get(IDX_KEY, { type: "json" });
	const existingTotal = existingIdx && typeof existingIdx.total === "number" ? existingIdx.total : 0;
	if (existingTotal > 0 && !force) {
		return json({ ok: true, skipped: true, reason: "已有数据，未导入（用 ?force=1 强制重种）", total: existingTotal });
	}

	// force 时先清空旧分片
	if (force && existingIdx && Array.isArray(existingIdx.months)) {
		for (const month of existingIdx.months) {
			await kv.put(monthKey(month), JSON.stringify([]));
		}
	}

	// 按月分组写入
	const moments = seedMoments();
	const byMonth = new Map();
	for (const m of moments) {
		const month = monthOf(m.date);
		if (!month) continue;
		if (!byMonth.has(month)) byMonth.set(month, []);
		byMonth.get(month).push(m);
	}
	for (const [month, arr] of byMonth) {
		await kv.put(monthKey(month), JSON.stringify(arr));
	}

	const months = Array.from(byMonth.keys()).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
	await kv.put(IDX_KEY, JSON.stringify({ months, total: moments.length }));

	return json({ ok: true, seeded: moments.length, months });
}
