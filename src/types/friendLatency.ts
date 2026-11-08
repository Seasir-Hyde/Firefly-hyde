export type FriendLatencyState = "fast" | "normal" | "slow" | "down";

export type FriendProbeResult = {
	state: FriendLatencyState;
	// down 状态下可能没有耗时数据
	milliseconds?: number;
	// 本次响应时间的采样次数（中位数口径）；旧快照缺省时视为单次采样
	samples?: number;
	checkedAt: string;
	httpStatus?: number | null;
	failureReason?: string | null;
	// 来自 Umami 的点击次数聚合
	clicks?: number;
	// 该条记录的探测节点：快照可能同时包含多个节点的结果
	probeLocation?: string;
	// 互链检测：该友链页面上是否包含指回本站的链接（未检测 / 站点不可达时缺省）
	mutual?: boolean;
	// 互链检测时间，与延迟探测共用同一轮定时任务
	mutualCheckedAt?: string;
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
