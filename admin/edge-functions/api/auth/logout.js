/**
 * POST /api/auth/logout
 * 清除会话 Cookie。
 */
import { clearSessionCookie } from "../../_shared/cookie.js";
import { jsonResponse, methodNotAllowed } from "../../_shared/response.js";

export async function onRequestPost() {
	return jsonResponse(
		{ ok: true },
		{
			status: 200,
			headers: { "Set-Cookie": clearSessionCookie() },
		},
	);
}

export async function onRequest(context) {
	if (context.request.method !== "POST") {
		return methodNotAllowed(["POST"]);
	}
	return onRequestPost();
}
