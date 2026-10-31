import type { FriendLink } from "@/types/friendsConfig";

export type FriendVisibilityStatus = NonNullable<
	FriendLink["visibilityStatus"]
>;

/** 短暂失联整改期为 30 天，违规友链为 7 天 */
export function remediationSeconds(status: FriendVisibilityStatus): number {
	return (status === "temporarily_unavailable" ? 30 : 7) * 24 * 60 * 60;
}

export function formatRemediationCountdown(
	startedAt: number,
	status: FriendVisibilityStatus,
	now: number = Math.floor(Date.now() / 1000),
): string {
	if (!Number.isSafeInteger(startedAt) || startedAt <= 0)
		return "整改期限待同步";
	const seconds = Math.max(0, startedAt + remediationSeconds(status) - now);
	if (!seconds) return "将于3日内清除";
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const remaining = seconds % 60;
	const prefix =
		status === "temporarily_unavailable" ? "整改剩余时间" : "整改剩余";
	return `${prefix} ${days}天${hours}时${minutes}分${remaining}秒`;
}
