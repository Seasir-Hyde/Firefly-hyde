/**
 * 受保护 Cloud Function 的鉴权辅助（Node.js 20）
 *
 * 与 edge-functions 版逻辑一致，区别：JWT 用 node:crypto（绕开 Edge Runtime Web Crypto）。
 * middleware.js 在请求进入前做 cookie 存在性检查；真正验签在这里完成（需 env.JWT_SECRET）。
 *
 * 用法：
 *   const auth = await requireAuth(context);
 *   if (auth instanceof Response) return auth;   // 401
 *   // auth = { username, payload }
 */
import { readSessionCookie } from "./cookie.js";
import { verifyJwt } from "./jwt.js";
import { unauthorized } from "./response.js";

/**
 * @param {{ request: Request, env: Record<string, string|undefined> }} context
 * @returns {Promise<Response | { username: string, payload: object }>}
 */
export async function requireAuth(context) {
	const secret = context.env?.JWT_SECRET;
	if (!secret) {
		return new Response(JSON.stringify({ error: "server_misconfigured" }), {
			status: 500,
			headers: { "content-type": "application/json; charset=utf-8" },
		});
	}

	const token = readSessionCookie(context.request.headers.get("cookie"));
	if (!token) {
		return unauthorized();
	}

	const payload = verifyJwt(token, secret);
	if (!payload) {
		return unauthorized();
	}
	return { username: payload.sub, payload };
}
