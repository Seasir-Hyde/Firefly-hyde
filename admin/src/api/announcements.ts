// 公告（Announcements）API 封装：走 Edge Functions + KV（单 key 存数组，秒级生效）
// 与后端 edge-functions/api/announcements/index.js 数据模型保持一致
import { apiClient } from "./client";

// 公告链接（对齐博客 src/config/announcementConfig.ts 的 link 结构）
export interface AnnouncementLink {
	enable: boolean;
	text: string;
	url: string;
	external: boolean;
}

// 公告数据模型（对齐 announcementConfig.ts + KV 侧补充 id/createdAt/updatedAt）
export interface Announcement {
	id: string;
	title: string;
	content: string;
	closable: boolean;
	link?: AnnouncementLink;
	createdAt?: string;
	updatedAt?: string;
}

export interface AnnouncementListResult {
	announcements: Announcement[];
	total: number;
}

// 新建 / 更新提交体（不含 id；update 时 id 作为独立参数由封装并入 body）
export interface SaveAnnouncementPayload {
	title: string;
	content: string;
	closable: boolean;
	link?: AnnouncementLink | null;
}

export const announcementsApi = {
	list: () => apiClient.get<AnnouncementListResult>("/api/announcements"),
	create: (data: SaveAnnouncementPayload) =>
		apiClient.post<{ ok: true; announcement: Announcement }>(
			"/api/announcements",
			data,
		),
	// 后端 PUT 读 body.id 定位记录，故这里把 id 并入 body
	update: (id: string, data: SaveAnnouncementPayload) =>
		apiClient.put<{ ok: true; announcement: Announcement }>(
			"/api/announcements",
			{ ...data, id },
		),
	remove: (id: string) =>
		apiClient.delete<{ ok: true; id: string }>(
			`/api/announcements?id=${encodeURIComponent(id)}`,
		),
};
