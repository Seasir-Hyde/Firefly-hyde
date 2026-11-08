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
	 * 延迟采样次数：连续采样后取中位数，过滤单次抖动与冷启动尖峰。
	 * 同一站点的采样复用连接，贴近访客重复访问时的真实响应时间。
	 */
	samples: 3,
	/**
	 * 延迟分级阈值（毫秒）。绿色健康区间为 < goodMs（即「优秀 + 良好」）：
	 *   < excellentMs        优秀（深绿）
	 *   excellentMs–goodMs   良好（绿）
	 *   goodMs–fairMs        一般（黄）
	 *   ≥ fairMs             较差（红）
	 * 探测状态仍只有 fast / normal / slow 三档，映射关系为 fast = 绿色区间。
	 */
	latencyGrades: {
		excellentMs: 200,
		goodMs: 500,
		fairMs: 1000,
	},
	/**
	 * 常态化监控告警阈值：
	 *   siteMs —— 单个站点超过该值即列入告警名单（绿色区间上限）
	 *   p95Ms  —— 整轮 p95 超过该值即判定整体偏离绿色区间
	 * 只影响摘要/通知文案，不会中断流水线或阻止快照更新。
	 */
	alert: {
		siteMs: 500,
		p95Ms: 1000,
	},
	/** 延迟趋势日志（JSONL），每轮全量探测追加一行，供长期监控与回溯 */
	historyFile: "src/data/friends-latency-history.jsonl",
	/** 互链检测并发数：与延迟采样分两批执行，避免页面下载挤占延迟测量带宽 */
	mutualConcurrency: 2,
	/** 互链结果复用窗口（小时）：窗口内的重复运行不再重新扫描友链页 */
	mutualCacheHours: 12,
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
