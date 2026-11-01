/**
 * 友链探测（延迟 / 可用性）配置。
 *
 * 定时表达式写在 .cnb.yml 的 crontab 里，两者必须保持一致：
 *   .cnb.yml → "crontab: 17 8 * * *"（Asia/Shanghai 时区）
 *   本文件   → cron: "17 8 * * *"
 * 调度器在 YAML、运行参数在 TS，只能靠约定同步，改动时请两处一起改。
 *
 * 探测流程与部署流程的关系：
 *   定时探测 → 提交快照到 main → 触发 push 流水线 → 构建 → 部署 EdgeOne → 状态确认
 */
export const friendsProbeConfig = {
	/** 定时表达式（Asia/Shanghai）：每天 08:17 探测一次 */
	cron: "17 8 * * *",
	/** 单个站点的探测超时（毫秒） */
	timeoutMs: 6000,
	/** 单站失败后的重试次数（不含首次），退避间隔为 retryBackoffMs * 2^n */
	retries: 2,
	/** 重试退避基数（毫秒） */
	retryBackoffMs: 1200,
	/** 并发探测的站点数 */
	concurrency: 4,
	/** 相邻两次请求之间的最小间隔（毫秒），避免给友链站点造成压力 */
	intervalMs: 150,
	/**
	 * 整轮失败率超过该阈值 → 判定为「探测端异常」（网络/机器问题），
	 * 本轮结果整体作废、不写入快照，并以非零退出码让 CI 触发告警。
	 * 没有这道保护，探测机断网会把全部友链写成「失联」并推上线。
	 */
	failureRatioThreshold: 0.3,
	/** 整轮成功数低于该值同样判定为探测端异常 */
	minSuccessCount: 5,
	/** 快照中旧记录的保留天数，超期条目直接丢弃 */
	snapshotRetentionDays: 7,
	/** 探测结果超过该时长视为过期（页面徽章提示用） */
	staleHours: 48,
	/** 部署完成后的状态确认：轮询线上构建指纹直到与本次构建一致 */
	verify: {
		/** 校验重试次数 */
		retries: 6,
		/** 重试间隔（毫秒） */
		intervalMs: 10_000,
		/** 单次请求超时（毫秒） */
		timeoutMs: 20_000,
	},
} as const;

export type FriendsProbeConfig = typeof friendsProbeConfig;
