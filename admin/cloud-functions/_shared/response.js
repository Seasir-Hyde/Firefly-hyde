/**
 * 统一 JSON 响应与错误封装
 * Edge Functions 侧手写薄封装保持接口一致。
 */

export function jsonResponse(data, init = {}) {
	const headers = new Headers(init.headers);
	headers.set("Content-Type", "application/json; charset=utf-8");
	if (init.cache === "public" && typeof init.maxAge === "number") {
		headers.set("Cache-Control", `public, max-age=${init.maxAge}, s-maxage=${init.maxAge}`);
	} else if (init.cache === "no-store") {
		headers.set("Cache-Control", "no-store");
	}
	return new Response(JSON.stringify(data), {
		status: init.status ?? 200,
		headers,
	});
}

export function errorResponse(status, message) {
	return jsonResponse({ error: message }, { status, cache: "no-store" });
}

export function badRequest(message) {
	return errorResponse(400, message);
}

export function unauthorized(message = "未登录或会话已过期") {
	return errorResponse(401, message);
}

export function serverError(message = "服务器内部错误") {
	return errorResponse(500, message);
}

export function methodNotAllowed(allowed) {
	const headers = new Headers({ Allow: allowed.join(", ") });
	return jsonResponse({ error: "method_not_allowed" }, { status: 405, headers });
}
