/**
 * POST /api/devices/seed  设备存量数据导入（Edge Functions，Edge Runtime）
 *
 * 同 announcements/seed.js 的理由：KV 只有 Edge 能访问，存量数据经受保护端点写入。
 * 幂等：默认已有数据（对象非空）则跳过；带 ?force=1 强制重种（覆盖）。
 *
 * 种子数据：转自博客 src/data/devices.json（3 类 9 条，2026-07-15 迁移时的快照）。
 *
 * 单文件、零本地 import（避免 545）。
 */

const SESSION_COOKIE = "firefly_admin_token";
const DATA_KEY = "devices_all";

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

function countDevices(map) {
	let n = 0;
	for (const list of Object.values(map)) {
		if (Array.isArray(list)) n += list.length;
	}
	return n;
}

// ---------- 种子数据（转自 src/data/devices.json，3 类 9 条） ----------
function seedDevices() {
	return {
		数码: [
			{
				name: "iPhone 17 Pro",
				image: "/images/device/iPhone 17 Pro.webp",
				specs: "深蓝色 / 12G + 256G",
				description: "创新设计，打造巅峰性能和超长续航",
				link: "https://www.apple.com.cn/iphone-17-pro/",
				price: "8999元",
			},
			{
				name: "Xiaomi 17 Ultra 徕卡版",
				image:
					"https://cdn.cnbj0.fds.api.mi-img.com/b2c-shopapi-pms/pms_1766544998.81921201.png",
				specs: "米白色/16G+1TB",
				description: "聚焦所见，忠于表达",
				link: "https://www.mi.com/shop/buy/detail?product_id=22423",
				price: "8999元",
			},
			{
				name: "XiaoMi 10 Pro",
				image: "/images/device/MI 10Pro.webp",
				specs: "珍珠白/12G+256G",
				description: "小米十周年梦幻之作",
				link: "https://www.mi.com/hk/buy/product/mi-10-pro?gid=4201400021",
				price: "4783元",
			},
			{
				name: "XiaoMi 6",
				image: "/images/device/XiaoMi 6.webp",
				specs: "黑色 / 6G + 64G",
				description: "变焦双摄，拍人更美",
				link: "https://www.mi.com/mi6",
				price: "2499元",
			},
			{
				name: "OPPO Enco Air4 Pro",
				image: "/images/device/OPPO Enco Air4 Pro.webp",
				specs: "晨曦白",
				description: "真无线降噪蓝牙耳机",
				link: "https://www.opposhop.cn/cn/web/products/27614.html",
				price: "219元",
			},
			{
				name: "小米AI音箱（第二代）",
				image: "/images/device/小米AI音箱（第二代）.webp",
				specs: "白色",
				description: "经典延续，体验升级",
				link: "https://www.mi.com/shop/buy/detail?product_id=13878",
				price: "179元",
			},
		],
		运动相机: [
			{
				name: "影石Insta360 Ace Pro 2",
				image: "/images/device/Insta360 Ace Pro 2.webp",
				specs: "极夜黑 / 街拍银灰",
				description: "AI双芯，旗舰影像",
				link: "https://store.insta360.com/cn/product/ace-pro-2?c=3611&from=nav_product",
				price: "2359元",
			},
			{
				name: "Osmo Pocket 4",
				image: "/images/device/Osmo Pocket 4.webp",
				specs: "标准套装",
				description: "一寸万象，光影随行",
				link: "https://www.dji.com/cn/osmo-pocket-4",
				price: "2999元",
			},
		],
		路由器: [
			{
				name: "RG-X30E",
				image: "/images/device/RG-X30E.webp",
				specs: "1000Mbps / 2.5G",
				description: "锐捷雪豹电竞WiFi 6 路由器",
				link: "https://item.jd.com/100084856711.html",
				price: "109元",
			},
		],
	};
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
	const existingMap =
		existing && typeof existing === "object" && !Array.isArray(existing)
			? existing
			: {};
	const existingCount = countDevices(existingMap);
	if (existingCount > 0 && !force) {
		return json({
			ok: true,
			skipped: true,
			reason: "已有数据，未导入（用 ?force=1 强制重种）",
			total: existingCount,
		});
	}

	const devices = seedDevices();
	await kv.put(DATA_KEY, JSON.stringify(devices));
	return json({
		ok: true,
		seeded: countDevices(devices),
		categories: Object.keys(devices).length,
	});
}
