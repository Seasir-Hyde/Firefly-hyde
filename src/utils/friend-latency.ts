import { friendsProbeConfig } from "@/config/friendsProbeConfig";
import type {
	FriendLatencySnapshot,
	FriendLatencyState,
} from "@/types/friendLatency";
import { normalizeFriendUrl } from "@/utils/friend-url";

/** 延迟四级评级：优秀 / 良好 / 一般 / 较差（前三档中的前两档属于绿色健康区间） */
export type FriendLatencyGrade = "excellent" | "good" | "fair" | "poor";

export const FRIEND_LATENCY_GRADE_LABELS: Record<FriendLatencyGrade, string> = {
	excellent: "优秀",
	good: "良好",
	fair: "一般",
	poor: "较差",
};

/** 绿色健康区间的上限（毫秒），即评级「良好」的上界 */
export const FRIEND_LATENCY_GREEN_MAX_MS =
	friendsProbeConfig.latencyGrades.goodMs;

/** 按阈值把毫秒数映射为四级评级 */
export function gradeFriendLatency(milliseconds: number): FriendLatencyGrade {
	const { excellentMs, goodMs, fairMs } = friendsProbeConfig.latencyGrades;
	if (milliseconds < excellentMs) return "excellent";
	if (milliseconds < goodMs) return "good";
	if (milliseconds < fairMs) return "fair";
	return "poor";
}

/**
 * 友链延迟的展示状态。
 * `checking` 只用于「该站点没有探测记录」这一种情况，
 * 它不是探测结果状态（探测结果只有 fast / normal / slow / down）。
 */
export type FriendLatencyDisplayState = FriendLatencyState | "checking";

/** 探测数据超过该时长即视为过期（仅在提示文案上体现，不影响徽章取值） */
export const FRIEND_LATENCY_STALE_HOURS = 48;

/**
 * 历史导出名，保持与既有调用方兼容。
 * 归一化口径已统一到主机名级别（见 utils/friend-url.ts）。
 */
export const normalizeFriendLatencyUrl: (value: string) => string =
	normalizeFriendUrl;

/** 判断一条探测记录是否已过期 */
export function isFriendLatencyStale(
	result: { checkedAt?: string | null } | undefined,
	now: number = Date.now(),
): boolean {
	if (!result?.checkedAt) return false;
	const checkedAt = new Date(result.checkedAt).getTime();
	if (Number.isNaN(checkedAt)) return false;
	return now - checkedAt > FRIEND_LATENCY_STALE_HOURS * 3600_000;
}

export function getFriendLatencyDisplay(
	snapshot: FriendLatencySnapshot,
	siteUrl: string,
): {
	state: FriendLatencyDisplayState;
	value: string;
	label: string;
	stale: boolean;
} {
	const result = snapshot.results[normalizeFriendUrl(siteUrl)];
	if (!result)
		return {
			state: "checking",
			value: "未探测",
			label: "该站点未纳入延迟探测队列，暂无 HTTP 响应时间数据",
			stale: false,
		};
	const checkedAt = new Date(result.checkedAt).toLocaleString("zh-CN", {
		timeZone: "Asia/Shanghai",
		hour12: false,
	});
	const location = result.probeLocation ?? snapshot.probeLocation;
	const source = `${location ?? "未知探测节点"}，探测于 ${checkedAt}（北京时间）`;
	const stale = isFriendLatencyStale(result);
	const staleHint = stale ? "，探测数据已过期" : "";
	if (result.state === "down") {
		const value = result.httpStatus
			? `HTTP ${result.httpStatus}`
			: result.failureReason?.startsWith("Timeout")
				? "超时"
				: "未连通";
		return {
			state: "down",
			value,
			label: `最近一次 HTTP GET 探测${value}；${source}${staleHint}。仅表示该探测节点的结果。`,
			stale,
		};
	}
	const sampleText =
		result.samples && result.samples > 1
			? `连续 ${result.samples} 次采样中位数`
			: "单次采样";
	const grade = gradeFriendLatency(result.milliseconds ?? 0);
	const gradeText = `${FRIEND_LATENCY_GRADE_LABELS[grade]}，绿色区间 <${FRIEND_LATENCY_GREEN_MAX_MS}ms`;
	return {
		state: result.state,
		value: `${result.milliseconds}ms`,
		label: `HTTP GET 响应时间 ${result.milliseconds} 毫秒（${sampleText}；评级：${gradeText}）；${source}${staleHint}。不是访客本机延迟。`,
		stale,
	};
}
