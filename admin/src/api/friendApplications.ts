// 友链申请（Friend Applications）API：Edge Functions + KV
// 与后端 edge-functions/api/friend-applications/index.js 对齐
import { apiClient } from "./client";

export type FriendApplicationStatus = "pending" | "approved" | "rejected";

export interface FriendApplication {
	id: string;
	title: string;
	imgurl?: string;
	desc?: string;
	siteurl: string;
	email?: string;
	message?: string;
	status: FriendApplicationStatus;
	createdAt?: string;
	updatedAt?: string;
	reviewedAt?: string;
	rejectReason?: string;
	applicantIp?: string;
}

export interface FriendApplicationListResult {
	applications: FriendApplication[];
	total: number;
}

export const friendApplicationsApi = {
	list: (status?: FriendApplicationStatus | "all") => {
		const q =
			status && status !== "all"
				? `?status=${encodeURIComponent(status)}`
				: "";
		return apiClient.get<FriendApplicationListResult>(
			`/api/friend-applications${q}`,
		);
	},
	approve: (id: string) =>
		apiClient.post<{
			ok: true;
			application: FriendApplication;
			appended?: boolean;
			friendsTotal?: number;
		}>("/api/friend-applications", { action: "approve", id }),
	reject: (id: string, rejectReason?: string) =>
		apiClient.post<{ ok: true; application: FriendApplication }>(
			"/api/friend-applications",
			{
				action: "reject",
				id,
				...(rejectReason ? { rejectReason } : {}),
			},
		),
	remove: (id: string) =>
		apiClient.delete<{ ok: true; id: string }>(
			`/api/friend-applications?id=${encodeURIComponent(id)}`,
		),
};
