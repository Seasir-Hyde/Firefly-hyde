// 每日一言（Quotes）API 封装：走 Edge Functions + KV（单 key 存数组，秒级生效）
// 与后端 edge-functions/api/quotes/index.js 数据模型保持一致
import { apiClient } from "./client";

// 一言数据模型（对齐博客 src/content/ziyuan/quote.md 的 {text,author} + KV 侧补充 id/时间）
export interface Quote {
	id: string;
	text: string;
	author: string;
	createdAt?: string;
	updatedAt?: string;
}

export interface QuoteListResult {
	quotes: Quote[];
	total: number;
}

// 新建 / 更新提交体（不含 id；update 时 id 作为独立参数由封装并入 body）
export interface SaveQuotePayload {
	text: string;
	author: string;
}

export const quotesApi = {
	list: () => apiClient.get<QuoteListResult>("/api/quotes"),
	create: (data: SaveQuotePayload) =>
		apiClient.post<{ ok: true; quote: Quote }>("/api/quotes", data),
	// 后端 PUT 读 body.id 定位记录，故这里把 id 并入 body
	update: (id: string, data: SaveQuotePayload) =>
		apiClient.put<{ ok: true; quote: Quote }>("/api/quotes", { ...data, id }),
	remove: (id: string) =>
		apiClient.delete<{ ok: true; id: string }>(
			`/api/quotes?id=${encodeURIComponent(id)}`,
		),
};
