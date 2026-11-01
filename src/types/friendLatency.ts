export type FriendLatencyState = "fast" | "normal" | "slow" | "down";

export type FriendProbeResult = {
	state: FriendLatencyState;
	// down 状态下可能没有耗时数据
	milliseconds?: number;
	checkedAt: string;
	httpStatus?: number | null;
	failureReason?: string | null;
	// 来自 Umami 的点击次数聚合
	clicks?: number;
	// 该条记录的探测节点：快照可能同时包含多个节点的结果
	probeLocation?: string;
};

export type FriendLatencySnapshot = {
	version?: number;
	generatedAt: string | null;
	// 探测节点说明，缺失时由 getFriendLatencyDisplay 兜底
	probeLocation?: string;
	timezone?: string;
	slot?: string | null;
	results: Record<string, FriendProbeResult>;
};
