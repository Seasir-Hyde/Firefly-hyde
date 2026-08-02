/**
 * GET /api/public/announcements  公告公开只读 API（Edge Functions，Edge Runtime）
 *
 * 无鉴权：middleware.js 白名单已放行 /api/public/*。供博客前台运行时 fetch（阶段 4）。
 * 响应头：CORS（PUBLIC_ALLOWED_ORIGIN）+ Cache-Control 60s（同 public/moments.js）。
 *
 * 单文件、零本地 import。只读，不含 JWT/写逻辑。
 */

const DATA_KEY = "announcements_all";

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
		"Access-Control-Allow-Methods": "GET, OPTIONS",
		"Cache-Control": "public, max-age=60, s-maxage=60",
	};
}

function json(data, status, headers) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json; charset=utf-8", ...headers },
	});
}

export async function onRequest(context) {
	const cors = corsHeaders(context);

	if (context.request.method === "OPTIONS") {
		return new Response(null, { status: 204, headers: cors });
	}
	if (context.request.method !== "GET") {
		return json({ error: "method_not_allowed" }, 405, { ...cors, Allow: "GET, OPTIONS" });
	}

	const kv = getKV();
	if (!kv) {
		return json({ error: "KV 未绑定" }, 500, cors);
	}

	const arr = await kv.get(DATA_KEY, { type: "json" });
	const items = Array.isArray(arr) ? arr : [];
	return json({ announcements: items, total: items.length }, 200, cors);
}
