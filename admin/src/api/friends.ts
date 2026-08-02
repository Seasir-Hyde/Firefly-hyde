// 友链（Friends）API 封装：走 Edge Functions + KV（单 key 存数组，秒级生效）
// 与后端 edge-functions/api/friends/index.js 数据模型保持一致。
//
// 与其余资料数据（项目/设备/技能/时间线走 Git 通道，见 ./data.ts）不同：
// 友链已迁 KV，保存后秒级生效、无需构建。交互仍是 DataPage 的「本地暂存 + 整体保存」，
// 故只暴露 getAll（读列表）+ replaceAll（整体覆盖），不做单条增删改。
import { apiClient } from "./client";

// 友链数据模型（对齐博客 src/data/friends.json / src/types/config.ts FriendLink）
export interface FriendLink {
	title: string;
	imgurl: string;
	desc: string;
	siteurl: string;
	tags?: string[];
	weight: number;
	enabled: boolean;
}

export interface FriendListResult {
	friends: FriendLink[];
	total: number;
}

export const friendsApi = {
	// 读全部友链（管理端，不过滤 enabled）
	getAll: () => apiClient.get<FriendListResult>("/api/friends"),
	// 整体覆盖并写回 KV（body: { friends }）
	replaceAll: (friends: FriendLink[]) =>
		apiClient.put<FriendListResult & { ok: true }>("/api/friends", { friends }),
};
