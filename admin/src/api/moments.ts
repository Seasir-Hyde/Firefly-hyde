// 说说（Moments）API 封装：全部走 Edge Functions + KV（说说数据存 KV，秒级生效）
// 与后端 edge-functions/api/moments/index.js 的数据模型保持一致
import { apiClient } from "./client";

// 图片展示配置（沿用博客 src/data/diary.ts 的 DiaryItem.imageDisplay）
export interface MomentImageDisplay {
	type: "carousel" | "grid";
	autoPlay?: boolean;
	interval?: number;
	showIndicator?: boolean;
	showControls?: boolean;
}

// 说说数据模型（沿用 diary.ts 字段 + KV 侧补充 id/createdAt/updatedAt）
export interface Moment {
	id: string;
	content: string;
	date: string; // ISO 日期串，决定所属月份分片
	images?: string[];
	video?: string;
	location?: string;
	locationUrl?: string;
	mood?: string;
	tags?: string[];
	avatar?: string;
	imageDisplay?: MomentImageDisplay;
	createdAt?: string;
	updatedAt?: string;
}

export interface MomentListResult {
	moments: Moment[];
	total: number;
	months: string[];
}

// 新建 / 更新提交体（不含 id；update 时 id 作为独立参数由封装并入 body）
export interface SaveMomentPayload {
	content: string;
	date: string;
	images?: string[];
	video?: string;
	location?: string;
	locationUrl?: string;
	mood?: string;
	tags?: string[];
	avatar?: string;
	imageDisplay?: MomentImageDisplay;
}

export const momentsApi = {
	// 管理端列表（读所有月份分片合并，按 date 倒序）
	list: () => apiClient.get<MomentListResult>("/api/moments"),
	create: (data: SaveMomentPayload) =>
		apiClient.post<{ ok: true; moment: Moment }>("/api/moments", data),
	// 后端 PUT 读 body.id 定位记录，故这里把 id 并入 body
	update: (id: string, data: SaveMomentPayload) =>
		apiClient.put<{ ok: true; moment: Moment }>("/api/moments", {
			...data,
			id,
		}),
	remove: (id: string) =>
		apiClient.delete<{ ok: true; id: string }>(
			`/api/moments?id=${encodeURIComponent(id)}`,
		),
};
