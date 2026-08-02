/**
 * POST /api/quotes/seed  每日一言存量数据导入（Edge Functions，Edge Runtime）
 *
 * 种子数据转自 src/content/ziyuan/quote.md（约 35 条 { text, author }）。
 * 幂等：默认已有数据则跳过；?force=1 强制重种。单文件、零本地 import（同 moments/seed.js）。
 */

const SESSION_COOKIE = "firefly_admin_token";
const DATA_KEY = "quotes_all";

function json(data, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
	});
}
function unauthorized(message = "未登录或会话已过期") {
	return json({ error: message }, 401);
}
function readCookie(cookieHeader, name) {
	if (!cookieHeader) return null;
	for (const seg of cookieHeader.split(";")) {
		const [k, ...v] = seg.trim().split("=");
		if (k === name) return decodeURIComponent(v.join("="));
	}
	return null;
}
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
function getKV() {
	// biome-ignore lint/correctness/noUndeclaredVariables: firefly_kv 是 EdgeOne KV 绑定的全局变量
	if (typeof firefly_kv === "undefined" || !firefly_kv) return null;
	// biome-ignore lint/correctness/noUndeclaredVariables: 同上
	return firefly_kv;
}

// 种子数据（转自 src/content/ziyuan/quote.md）
function seedQuotes() {
	const now = new Date().toISOString();
	const raw = [
		{ text: "生活不是等待暴风雨过去，而是学会在雨中跳舞。", author: "塞维涅夫人" },
		{ text: "世界上只有一种英雄主义，就是在认清生活真相之后依然热爱生活。", author: "罗曼·罗兰" },
		{ text: "人生如逆旅，我亦是行人。", author: "苏轼" },
		{ text: "成功的秘诀在于对目标的执着追求。", author: "本杰明·迪斯雷利" },
		{ text: "每一天都是一个新的开始，深呼吸，重新开始。", author: "未知" },
		{ text: "不要等待机会，而要创造机会。", author: "林肯" },
		{ text: "人生最大的幸福，是发现自己爱的人正好也爱着自己。", author: "张爱玲" },
		{ text: "山重水复疑无路，柳暗花明又一村。", author: "陆游" },
		{ text: "世界上最重要的事，就是知道自己在做什么。", author: "海德格尔" },
		{ text: "路漫漫其修远兮，吾将上下而求索。", author: "屈原" },
		{ text: "人生如骑自行车，要保持平衡就必须不断前进。", author: "爱因斯坦" },
		{ text: "做你自己，别人已经有人做了。", author: "奥斯卡·王尔德" },
		{ text: "未经过审视的人生是不值得过的。", author: "苏格拉底" },
		{ text: "人生就像一杯茶，不会苦一辈子，但总会苦一阵子。", author: "中国谚语" },
		{ text: "只有不断找寻机会的人，才能把握机会。", author: "屠格涅夫" },
		{ text: "人生没有白走的路，每一步都算数。", author: "李宗盛" },
		{ text: "所有的伟大，都源于一个勇敢的开始。", author: "未知" },
		{ text: "心若向阳，无畏悲伤。", author: "中国古语" },
		{ text: "人生最重要的不是所处的位置，而是所朝的方向。", author: "塞缪尔·约翰逊" },
		{ text: "每一个不曾起舞的日子，都是对生命的辜负。", author: "尼采" },
		{ text: "黑夜无论怎样悠长，白昼总会到来。", author: "莎士比亚" },
		{ text: "人生如逆水行舟，不进则退。", author: "荀子" },
		{ text: "生命不止眼前的苟且，还有诗和远方的田野。", author: "高晓松" },
		{ text: "既然选择了远方，便只顾风雨兼程。", author: "汪国真" },
		{ text: "人生就像骑单车，想要保持平衡就得往前走。", author: "爱因斯坦" },
		{ text: "世界上最宽阔的是海洋，比海洋更宽阔的是天空，比天空更宽阔的是人的心灵。", author: "雨果" },
		{ text: "人生若只如初见，何事秋风悲画扇。", author: "纳兰性德" },
		{ text: "志存高远，脚踏实地。", author: "中国古语" },
		{ text: "人生就是不断地放下，但最遗憾的是我们来不及好好告别。", author: "未知" },
		{ text: "千里之行，始于足下。", author: "老子" },
		{ text: "人生如茶，静心以对。", author: "中国禅语" },
		{ text: "所有的相遇都是久别重逢。", author: "未知" },
		{ text: "人生没有彩排，每一天都是现场直播。", author: "未知" },
		{ text: "你羡慕的生活，就是你奋斗的目标。", author: "未知" },
		{ text: "人生最重要的两天，一是你来到世界的那天，二是你明白为什么来到这个世界的那天。", author: "马克·吐温" },
	];
	return raw.map((q) => ({ ...q, id: crypto.randomUUID(), createdAt: now, updatedAt: now }));
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
	const existingTotal = Array.isArray(existing) ? existing.length : 0;
	if (existingTotal > 0 && !force) {
		return json({ ok: true, skipped: true, reason: "已有数据，未导入（用 ?force=1 强制重种）", total: existingTotal });
	}

	const quotes = seedQuotes();
	await kv.put(DATA_KEY, JSON.stringify(quotes));
	return json({ ok: true, seeded: quotes.length });
}
