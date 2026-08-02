// 统一的 fetch 封装:同域调用,自动携带 httpOnly Cookie,处理 JSON 序列化与错误
// 后端 API 全部挂在 /api 前缀下,由 EdgeOne middleware.js 统一鉴权

export class ApiError extends Error {
	readonly status: number;
	readonly data: unknown;

	constructor(status: number, message: string, data?: unknown) {
		super(message);
		this.name = "ApiError";
		this.status = status;
		this.data = data;
	}
}

async function request<T>(
	method: string,
	path: string,
	body?: unknown,
): Promise<T> {
	const init: RequestInit = {
		method,
		// 关键:同域 httpOnly Cookie 需要 credentials=same-origin(默认即可,显式声明以防被误改)
		credentials: "same-origin",
		headers: body != null ? { "Content-Type": "application/json" } : undefined,
		body: body != null ? JSON.stringify(body) : undefined,
	};

	const res = await fetch(path, init);
	// 不盲信 content-type：EdgeOne 会按 URL 扩展名（如 /api/posts/xxx.md）把函数响应的
	// content-type 覆盖成 text/markdown，即使 body 是 JSON。故统一先取 text 再尝试 JSON.parse，
	// 解析成功即视为 JSON 对象，失败才保留为纯文本。否则单篇文章会被当字符串 → data.frontmatter
	// undefined → 编辑页 toFormValues 崩溃白屏（2026-07-09 CDP 确诊根因）。
	const text = await res.text();
	let payload: unknown = text;
	if (text) {
		try {
			payload = JSON.parse(text);
		} catch {
			payload = text; // 非 JSON，保留原文本
		}
	} else {
		payload = null;
	}
	const isObj = payload != null && typeof payload === "object";

	if (!res.ok) {
		const message =
			(isObj && "message" in (payload as Record<string, unknown>)
				? String((payload as { message: unknown }).message)
				: isObj && "error" in (payload as Record<string, unknown>)
					? String((payload as { error: unknown }).error)
					: null) ?? `请求失败:${res.status} ${res.statusText}`;
		throw new ApiError(res.status, message, payload);
	}

	return payload as T;
}

export const apiClient = {
	get: <T>(path: string) => request<T>("GET", path),
	post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
	put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
	delete: <T>(path: string) => request<T>("DELETE", path),
};
