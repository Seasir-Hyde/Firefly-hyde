import type { FriendLatencySnapshot } from "@/types/friendLatency";

export const normalizeFriendLatencyUrl = (value: string): string =>
	value
		.trim()
		.replace(/^https?:\/\//iu, "")
		.replace(/^www\./iu, "")
		.replace(/\/+$/u, "")
		.toLowerCase();

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
	const source = `${snapshot.probeLocation}，探测于 ${checkedAt}（北京时间）`;
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
	return {
		state: result.state,
		value: `${result.milliseconds}ms`,
		label: `HTTP GET 首次响应时间 ${result.milliseconds} 毫秒；${source}。不是访客本机延迟。`,
	};
}