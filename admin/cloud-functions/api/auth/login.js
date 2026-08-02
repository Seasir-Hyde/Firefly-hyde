/**
 * POST /api/auth/login（Cloud Functions，Node.js 20）
 *
 * 为什么登录放在 Cloud Functions 而非 Edge Functions：
 *   Edge Runtime 的 Web Crypto 不支持 PBKDF2（deriveBits 返回 "Param Invalid"，
 *   实测 2026-07）。密码 hash 校验必须用 PBKDF2，故放到 Node.js 20 的 Cloud Functions，
 *   用 node:crypto 的 pbkdf2Sync 完成。JWT 签发用 HMAC-SHA256（node:crypto 原生支持）。
 *
 * 鉴权：middleware.js 白名单放行 /api/auth/login，无需登录即可访问。
 *
 * 请求体：{ username, password }
 * 成功：200 + Set-Cookie（httpOnly JWT，7 天）
 * 失败：401
 */

import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual as nodeTimingSafeEqual } from "node:crypto";

const SESSION_COOKIE = "firefly_admin_token";
const DEFAULT_MAX_AGE = 60 * 60 * 24 * 7; // 7 天

// 常量时间比较
function timingSafeEqual(a, b) {
	if (a.length !== b.length) return false;
	return nodeTimingSafeEqual(a, b);
}

// 校验密码：兼容 4 段 pbkdf2$iter$salt$hash 和 5 段 pbkdf2$sha256$iter$salt$hash
function verifyPassword(password, stored) {
	const parts = stored.split("$");
	if (parts.length < 4 || parts[0] !== "pbkdf2") return false;

	let iterations;
	let saltB64;
	let hashB64;

	if (parts.length === 5 && parts[1] === "sha256") {
		iterations = Number.parseInt(parts[2], 10);
		saltB64 = parts[3];
		hashB64 = parts[4];
	} else if (parts.length === 4) {
		iterations = Number.parseInt(parts[1], 10);
		saltB64 = parts[2];
		hashB64 = parts[3];
	} else {
		return false;
	}

	if (!Number.isFinite(iterations) || iterations < 1000) return false;

	const salt = Buffer.from(saltB64, "base64");
	const expected = Buffer.from(hashB64, "base64");
	const actual = pbkdf2Sync(password, salt, iterations, expected.length, "sha256");
	return timingSafeEqual(actual, expected);
}

// base64url 编码（无填充）
function b64url(input) {
	return Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function b64urlStr(str) {
	return b64url(Buffer.from(str, "utf8"));
}

// HMAC-SHA256 签发 JWT（payload 只传业务字段，iat/exp 自动填充）
function signJwt(payload, secret, ttlSeconds = DEFAULT_MAX_AGE) {
	const now = Math.floor(Date.now() / 1000);
	const fullPayload = { ...payload, iat: now, exp: now + ttlSeconds };
	const header = b64urlStr(JSON.stringify({ alg: "HS256", typ: "JWT" }));
	const body = b64urlStr(JSON.stringify(fullPayload));
	const signingInput = `${header}.${body}`;
	const sig = createHmac("sha256", secret).update(signingInput).digest();
	return `${signingInput}.${b64url(sig)}`;
}

function buildSessionCookie(token) {
	return [
		`${SESSION_COOKIE}=${encodeURIComponent(token)}`,
		"Path=/",
		`Max-Age=${DEFAULT_MAX_AGE}`,
		"HttpOnly",
		"Secure",
		"SameSite=Strict",
	].join("; ");
}

function json(body, status = 200, extraHeaders = {}) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json; charset=utf-8", ...extraHeaders },
	});
}

export async function onRequest(context) {
	const { request, env } = context;
	if (request.method !== "POST") {
		return json({ error: "method_not_allowed" }, 405);
	}

	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: "请求体解析失败" }, 400);
	}

	const username = body?.username?.trim();
	const password = body?.password;
	if (!username || !password) {
		return json({ error: "用户名和密码必填" }, 400);
	}

	const expectedUsername = env.ADMIN_USERNAME;
	const passwordHash = env.ADMIN_PASSWORD_HASH;
	const jwtSecret = env.JWT_SECRET;

	if (!expectedUsername || !passwordHash || !jwtSecret) {
		return json({ error: "服务器缺少认证配置" }, 500);
	}

	const usernameOk = username === expectedUsername;
	const passwordOk = verifyPassword(password, passwordHash);

	if (!usernameOk || !passwordOk) {
		return json({ error: "用户名或密码错误" }, 401);
	}

	const token = signJwt({ sub: username }, jwtSecret);

	return json({ ok: true, username }, 200, { "Set-Cookie": buildSessionCookie(token) });
}
