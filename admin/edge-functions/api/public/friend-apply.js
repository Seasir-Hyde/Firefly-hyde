/**
 * POST /api/public/friend-apply  友链公开申请（Edge Functions，Edge Runtime）
 *
 * 无鉴权：middleware.js 白名单已放行 /api/public/*。供博客前台表单跨域提交。
 * 流程：校验 → honeypot → IP 日限流 → siteurl 去重 → 写 friend_applications_all
 * → 异步企业微信 webhook（失败不影响 201）。
 *
 * 单文件、零本地 import（Edge 多模块 import 会 545，见 admin-console-plan 坑 12/15）。
 */

const APPS_KEY = "friend_applications_all";
const FRIENDS_KEY = "friends_all";
const RL_PREFIX = "friend_apply_rl_";
const RL_MAX = 3;
const RL_WINDOW_MS = 24 * 60 * 60 * 1000;

const LIMITS = {
	title: 80,
	desc: 200,
	url: 500,
	email: 120,
	message: 500,
};

function getKV() {
	// biome-ignore lint/correctness/noUndeclaredVariables: firefly_kv 是 EdgeOne KV 绑定的全局变量
	if (typeof firefly_kv === "undefined" || !firefly_kv) return null;
	// biome-ignore lint/correctness/noUndeclaredVariables: 同上
	return firefly_kv;
}

function corsHeaders(context) {
	const origin = context.env?.PUBLIC_ALLOWED_ORIGIN || "*";
	return {
		"Access-Control-Allow-Origin": origin,
		"Access-Control-Allow-Methods": "POST, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Accept",
		"Cache-Control": "no-store",
	};
}

function json(data, status, headers) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json; charset=utf-8", ...headers },
	});
}

function isHttpUrl(s) {
	if (typeof s !== "string") return false;
	try {
		const u = new URL(s);
		return u.protocol === "http:" || u.protocol === "https:";
	} catch {
		return false;
	}
}

// 去重用：trim、去尾斜杠、host 小写（存储仍用用户原始合法 URL）
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

function clip(s, max) {
	const t = typeof s === "string" ? s.trim() : "";
	return t.length > max ? t.slice(0, max) : t;
}

function getClientIp(context) {
	const req = context.request;
	const h = req.headers;
	const xff = h.get("x-forwarded-for") || h.get("X-Forwarded-For");
	if (xff) {
		const first = xff.split(",")[0].trim();
		if (first) return first;
	}
	if (context.clientIp) return String(context.clientIp);
	const real = h.get("x-real-ip") || h.get("cf-connecting-ip");
	if (real) return real.trim();
	return "unknown";
}

// 简单稳定 hash，避免把原始 IP 当 key 明文（仍可碰撞，仅用于限流分桶）
async function hashIp(ip) {
	const buf = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(ip || "unknown"),
	);
	const bytes = new Uint8Array(buf);
	let hex = "";
	for (let i = 0; i < 16; i++) hex += bytes[i].toString(16).padStart(2, "0");
	return hex;
}

// 读限流状态；窗口过期则视为 0（不在此写入）
async function readRateLimit(kv, ipHash) {
	const key = `${RL_PREFIX}${ipHash}`;
	const now = Date.now();
	const rec = await kv.get(key, { type: "json" });
	if (!rec || typeof rec !== "object") {
		return { key, now, count: 0, windowStart: now, over: false };
	}
	const start = Number(rec.windowStart) || now;
	let count = Number(rec.count) || 0;
	if (now - start >= RL_WINDOW_MS) {
		return { key, now, count: 0, windowStart: now, over: false };
	}
	return {
		key,
		now,
		count,
		windowStart: start,
		over: count >= RL_MAX,
	};
}

// 仅在成功写入申请后调用，占用一次配额
async function bumpRateLimit(kv, state) {
	const next = {
		count: (state.count || 0) + 1,
		windowStart: state.windowStart || state.now,
	};
	await kv.put(state.key, JSON.stringify(next));
}

// 读请求体为 UTF-8 文本再 JSON.parse。部分 Edge 运行时对 request.json()
// 的编码处理不稳定，中文可能在入库前就已损坏。
async function readJsonBody(request) {
	const buf = await request.arrayBuffer();
	const text = new TextDecoder("utf-8").decode(buf);
	if (!text || !text.trim()) return null;
	return JSON.parse(text);
}

async function sendWecomNotify(context, app) {
	const webhook =
		context.env?.FRIEND_APPLY_WEBHOOK || context.env?.WECHAT_WORK_WEBHOOK;
	if (!webhook) {
		console.log("未配置 FRIEND_APPLY_WEBHOOK / WECHAT_WORK_WEBHOOK，跳过友链申请通知");
		return;
	}
	// 不用 emoji 标题，减少部分客户端/链路异常；中文全角冒号与 CNB 构建通知一致
	const content = [
		"## 新的友链申请",
		`> **站点：** ${app.title || "—"}`,
		`> **描述：** ${app.desc || "—"}`,
		`> **链接：** [${app.siteurl}](${app.siteurl})`,
		`> **头像：** ${app.imgurl || "—"}`,
		`> **邮箱：** ${app.email || "—"}`,
		`> **留言：** ${app.message || "—"}`,
		`> **时间：** ${app.createdAt || "—"}`,
		"> **处理：** [打开后台](https://astro-admin.cchaoka.cn/#/data)",
	].join("\n");
	// Edge 出站 fetch：用 TextEncoder 得到明确 UTF-8 字节，避免字符串 body 被错误重编码
	const payload = JSON.stringify({
		msgtype: "markdown",
		markdown: { content },
	});
	const utf8Body = new TextEncoder().encode(payload);
	try {
		const response = await fetch(webhook, {
			method: "POST",
			headers: { "Content-Type": "application/json; charset=utf-8" },
			body: utf8Body,
		});
		const body = await response.text();
		if (!response.ok) {
			console.error(`企业微信通知失败：${response.status} ${body}`);
		}
	} catch (err) {
		console.error("企业微信通知异常：", err);
	}
}

export async function onRequest(context) {
	const cors = corsHeaders(context);

	if (context.request.method === "OPTIONS") {
		return new Response(null, { status: 204, headers: cors });
	}
	if (context.request.method !== "POST") {
		return json(
			{ error: "method_not_allowed" },
			405,
			{ ...cors, Allow: "POST, OPTIONS" },
		);
	}

	const kv = getKV();
	if (!kv) {
		return json(
			{ error: "service_unavailable" },
			503,
			cors,
		);
	}

	let body;
	try {
		body = await readJsonBody(context.request);
	} catch {
		return json({ error: "invalid_json" }, 400, cors);
	}
	if (!body || typeof body !== "object") {
		return json({ error: "invalid_body" }, 400, cors);
	}

	// honeypot：字段 website 有值 → 假成功，不写库不通知
	if (typeof body.website === "string" && body.website.trim() !== "") {
		return json({ ok: true }, 201, cors);
	}

	const title = clip(body.title, LIMITS.title);
	const desc = clip(body.desc, LIMITS.desc);
	const siteurl = clip(body.siteurl, LIMITS.url);
	const imgurl = clip(body.imgurl, LIMITS.url);
	const email = clip(body.email, LIMITS.email);
	const message = clip(body.message, LIMITS.message);

	if (!title || !siteurl) {
		return json({ error: "title_and_siteurl_required" }, 400, cors);
	}
	if (!isHttpUrl(siteurl)) {
		return json({ error: "invalid_siteurl" }, 400, cors);
	}
	if (imgurl && !isHttpUrl(imgurl)) {
		return json({ error: "invalid_imgurl" }, 400, cors);
	}
	if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		return json({ error: "invalid_email" }, 400, cors);
	}

	const ip = getClientIp(context);
	const ipHash = await hashIp(ip);
	const rlState = await readRateLimit(kv, ipHash);
	if (rlState.over) {
		return json({ error: "rate_limited" }, 429, cors);
	}

	const siteKey = normalizeSiteurlKey(siteurl);

	const friendsRaw = await kv.get(FRIENDS_KEY, { type: "json" });
	const friends = Array.isArray(friendsRaw) ? friendsRaw : [];
	for (const f of friends) {
		if (f && normalizeSiteurlKey(f.siteurl) === siteKey) {
			return json({ error: "duplicate" }, 409, cors);
		}
	}

	const appsRaw = await kv.get(APPS_KEY, { type: "json" });
	const apps = Array.isArray(appsRaw) ? appsRaw : [];
	for (const a of apps) {
		if (
			a &&
			a.status === "pending" &&
			normalizeSiteurlKey(a.siteurl) === siteKey
		) {
			return json({ error: "duplicate" }, 409, cors);
		}
	}

	const now = new Date().toISOString();
	const app = {
		id: crypto.randomUUID(),
		title,
		imgurl: imgurl || "",
		desc: desc || "",
		siteurl,
		status: "pending",
		createdAt: now,
		updatedAt: now,
		applicantIp: ip,
	};
	if (email) app.email = email;
	if (message) app.message = message;
	// 剔除空字符串
	for (const k of Object.keys(app)) {
		if (app[k] === "") delete app[k];
	}

	apps.push(app);
	await kv.put(APPS_KEY, JSON.stringify(apps));
	// 写库成功后再占限流配额（去重/校验失败不计数）
	await bumpRateLimit(kv, rlState);

	// 通知失败不影响申请成功
	try {
		await sendWecomNotify(context, app);
	} catch (err) {
		console.error("notify wrapper:", err);
	}

	return json({ ok: true, id: app.id }, 201, cors);
}
