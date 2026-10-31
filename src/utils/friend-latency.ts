import type { FriendLatencySnapshot } from "@/types/friendLatency";

export const normalizeFriendLatencyUrl = (value: string): string =>
	value
		.trim()
		.replace(/^https?:\/\//iu, "")
		.replace(/^www\./iu, "")
		.replace(/\/+$/u, "")
		.toLowerCase();

/**
 * 把延迟快照条目格式化为卡片徽章可直接使用的三元组。
 * 兼容早期快照：缺少 probeLocation / httpStatus / failureReason 时按兜底文案处理。
 */
export function getFriendLatencyDisplay(
	snapshot: FriendLatencySnapshot,
	siteUrl: string,
): {
	state: string;
	value: string;
	label: string;
} {
	const result = snapshot.results[normalizeFriendLatencyUrl(siteUrl)];
	if (!result)
		return {
			state: "checking",
			value: "未检测",
			label: "暂无 HTTP 响应时间探测记录",
		};
	const checkedAt = new Date(result.checkedAt).toLocaleString("zh-CN", {
		timeZone: "Asia/Shanghai",
		hour12: false,
	});
	const location = snapshot.probeLocation?.trim();
	const source = `${location || "定时探测节点"}，探测于 ${checkedAt}（北京时间）`;
	if (result.state === "down") {
		const value = result.httpStatus
			? `HTTP ${result.httpStatus}`
			: result.failureReason?.startsWith("Timeout")
				? "超时"
				: "未连通";
		return {
			state: "down",
			value,
			label: `最近一次 HTTP GET 探测${value}；${source}。仅表示该探测节点的结果。`,
		};
	}
	const milliseconds = result.milliseconds;
	if (typeof milliseconds !== "number") {
		return {
			state: result.state,
			value: "未检测",
			label: `暂无 HTTP 响应时间探测记录；${source}。`,
		};
	}
	return {
		state: result.state,
		value: `${milliseconds}ms`,
		label: `HTTP GET 首次响应时间 ${milliseconds} 毫秒；${source}。不是访客本机延迟。`,
	};
}
