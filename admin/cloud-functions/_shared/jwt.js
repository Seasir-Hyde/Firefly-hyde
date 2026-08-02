/**
 * JWT 签发与校验工具（HS256）—— Cloud Functions / Node.js 20 版
 *
 * 用 node:crypto 的 createHmac，绕开 Edge Runtime Web Crypto 的不可调试问题。
 * login.js 里的 signJwt 已验证此路径可靠；本文件抽出共享，供 me / requireAuth 复用。
 *
 * 注意：Cloud Functions 仅支持 .js（esbuild 打包不识别 .mjs），package.json 已 "type":"module"。
 */

import { createHmac, timingSafeEqual as nodeTimingSafeEqual } from "node:crypto";

const DEFAULT_TTL = 60 * 60 * 24 * 7; // 7 天

function b64url(buffer) {
	return Buffer.from(buffer).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function b64urlStr(str) {
	return b64url(Buffer.from(str, "utf8"));
}

// base64url 解码为 Buffer
function b64urlDecode(str) {
	const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
	return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

// 常量时间比较
function safeEqual(a, b) {
	if (a.length !== b.length) return false;
	return nodeTimingSafeEqual(a, b);
}

/**
 * 签发 JWT。payload 传业务字段（如 { sub }），iat/exp 自动填充。
 */
export function signJwt(payload, secret, ttlSeconds = DEFAULT_TTL) {
	const now = Math.floor(Date.now() / 1000);
	const fullPayload = { ...payload, iat: now, exp: now + ttlSeconds };
	const header = b64urlStr(JSON.stringify({ alg: "HS256", typ: "JWT" }));
	const body = b64urlStr(JSON.stringify(fullPayload));
	const signingInput = `${header}.${body}`;
	const sig = createHmac("sha256", secret).update(signingInput).digest();
	return `${signingInput}.${b64url(sig)}`;
}

/**
 * 校验 JWT 签名与过期时间，返回 payload 或 null。
 * 失败模式：结构/签名/过期一律返回 null（不抛），便于调用方统一处理。
 */
export function verifyJwt(token, secret) {
	const parts = token.split(".");
	if (parts.length !== 3) return null;
	const [header, body, sigB64] = parts;

	const signingInput = `${header}.${body}`;
	const expected = createHmac("sha256", secret).update(signingInput).digest();
	const actual = b64urlDecode(sigB64);
	if (!safeEqual(expected, actual)) return null;

	let payload;
	try {
		payload = JSON.parse(b64urlDecode(body).toString("utf8"));
	} catch {
		return null;
	}
	if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
	return payload;
}
