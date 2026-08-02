/**
 * GET /api/public/site-flags  站点开关公开只读 API（Edge Functions，Edge Runtime）
 *
 * 无鉴权：middleware.js 白名单已放行 /api/public/*。供博客前台运行时读「动态数据快照开关」。
 * 响应头：CORS（PUBLIC_ALLOWED_ORIGIN）+ Cache-Control 60s（对齐 public/moments.js / announcements.js）。
 *
 * 单文件、零本地 import。只读，不含 JWT/写逻辑。
 *
 * 返回扁平结构 { snapshotDisabled: boolean }，与公开 API 既有扁平风格（{ moments, total } 等）一致。
 * KV 未绑定时兜底返回默认值 { snapshotDisabled: false }（保持现状），而非 500——
 * 开关 API 故障时博客行为不受影响（开关本身是动态数据，永远走运行时读 KV，不受自己控制）。
 */

const DATA_KEY = "site_flags";
const DEFAULT_FLAGS = { snapshotDisabled: false };

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
		// KV 未绑定：返回默认值（保持现状），博客前端行为不受影响
		return json({ snapshotDisabled: false }, 200, cors);
	}

	const stored = await kv.get(DATA_KEY, { type: "json" });
	// 与默认值合并：日后新增字段旧数据也能补全；严格布尔化防止脏数据
	const flags =
		stored && typeof stored === "object"
			? { ...DEFAULT_FLAGS, ...stored }
			: DEFAULT_FLAGS;
	return json({ snapshotDisabled: flags.snapshotDisabled === true }, 200, cors);
}
