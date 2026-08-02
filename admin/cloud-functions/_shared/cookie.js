/**
 * 会话 Cookie 读写工具
 * 后台使用 httpOnly Cookie 存放 JWT，防 XSS。
 */

export const SESSION_COOKIE = "firefly_admin_token";
const DEFAULT_MAX_AGE = 60 * 60 * 24 * 7; // 7 天

export function getCookie(cookieHeader, name) {
	if (!cookieHeader) return null;
	for (const part of cookieHeader.split(";")) {
		const [rawKey, ...rest] = part.split("=");
		const key = rawKey?.trim();
		if (key === name) {
			return decodeURIComponent(rest.join("=").trim());
		}
	}
	return null;
}

export function readSessionCookie(cookieHeader) {
	return getCookie(cookieHeader, SESSION_COOKIE);
}

export function buildSessionCookie(token, maxAge = DEFAULT_MAX_AGE) {
	const parts = [
		`${SESSION_COOKIE}=${encodeURIComponent(token)}`,
		"Path=/",
		`Max-Age=${maxAge}`,
		"HttpOnly",
		"Secure",
		"SameSite=Strict",
	];
	return parts.join("; ");
}

export function clearSessionCookie() {
	return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}
