/**
 * GET /api/auth/me（Cloud Functions，Node.js 20）
 *
 * 校验当前会话：读 Cookie 中的 JWT，验签后返回用户名。
 * 放在 Cloud Functions 而非 Edge Functions：Edge 的多模块 import 会触发不可调试的 545
 * （见 docs/admin-console-plan.md 十三章坑 12/15），Cloud 有日志、node:crypto 稳定。
 *
 * 鉴权：middleware.js 放行非 /api/* 与白名单；本路径受保护，由 requireAuth 验签。
 */

import { requireAuth } from "../../_shared/requireAuth.js";
import { jsonResponse, methodNotAllowed } from "../../_shared/response.js";

export async function onRequestGet(context) {
	const auth = await requireAuth(context);
	if (auth instanceof Response) return auth;

	return jsonResponse({
		username: auth.payload.sub,
		iat: auth.payload.iat,
		exp: auth.payload.exp,
	});
}

export async function onRequest(context) {
	if (context.request.method !== "GET") {
		return methodNotAllowed(["GET"]);
	}
	return onRequestGet(context);
}
