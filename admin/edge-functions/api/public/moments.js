/**
 * GET /api/public/moments  说说公开只读 API（Edge Functions，Edge Runtime）
 *
 * 无鉴权：middleware.js 白名单已放行 /api/public/*。供博客前台运行时 fetch（阶段 4）。
 *
 *   ?month=<yyyymm>  只读某月分片（前台按月分页时用）
 *   （无 month）      合并所有月份分片，按 date 倒序返回全部
 *
 * 响应头：
 *   Access-Control-Allow-Origin: <PUBLIC_ALLOWED_ORIGIN>（博客域名，环境变量配置）
 *   Cache-Control: public, max-age=60, s-maxage=60（减少函数调用 + 准实时，KV 本身最长 60s 最终一致）
 *
 * 单文件、零本地 import（同 index.js，避免 545）。此文件只读，不含 JWT/写逻辑。
 */

const IDX_KEY = "moments_idx";

function monthKey(month) {
	return `moments_${month}`;
}

// 绑定变量名 firefly_kv（控制台绑定，全局可见）
function getKV() {
	// biome-ignore lint/correctness/noUndeclaredVariables: firefly_kv 是 EdgeOne KV 绑定的全局变量
	if (typeof firefly_kv === "undefined" || !firefly_kv) return null;
	// biome-ignore lint/correctness/noUndeclaredVariables: 同上
	return firefly_kv;
}

async function readIdx(kv) {
	const idx = await kv.get(IDX_KEY, { type: "json" });
	if (!idx || !Array.isArray(idx.months)) return { months: [], total: 0 };
	return { months: idx.months, total: typeof idx.total === "number" ? idx.total : 0 };
}

async function readMonth(kv, month) {
	const arr = await kv.get(monthKey(month), { type: "json" });
	return Array.isArray(arr) ? arr : [];
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

	// 预检
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

	const url = new URL(context.request.url);
	const monthParam = url.searchParams.get("month");
	const idx = await readIdx(kv);

	let items = [];
	if (monthParam) {
		items = await readMonth(kv, monthParam);
	} else {
		for (const month of idx.months) {
			const arr = await readMonth(kv, month);
			items = items.concat(arr);
		}
	}
	items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

	return json({ moments: items, total: idx.total, months: idx.months }, 200, cors);
}
