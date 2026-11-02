// 友链配置
export type FriendLink = {
	title: string; // 友链标题
	imgurl: string; // 头像图片URL
	desc: string; // 友链描述
	siteurl: string; // 友链地址
	rss?: string | string[]; // RSS/Atom 地址，可留空并由友链页面自动探测
	tags?: string[]; // 标签数组
	weight: number; // 权重，数字越大排序越靠前
	enabled: boolean; // 是否启用
	// 以下为 Aemeath的friends 页面移植新增的可选字段
	recommended?: boolean; // 是否使用推荐友链样式
	recommendationReason?: string; // 推荐理由，用于友链评选说明
	recommendedTier?: "full" | "degraded"; // 推荐友链层级，降级推荐仅保留静态卡片装饰
	temporarilyUnavailable?: boolean; // 手动显示暂时失联状态
	visibilityStatus?: "normal" | "temporarily_unavailable" | "policy_violation"; // 友链可见性状态
	violationStartedAt?: number; // 违规整改期开始时间（Unix 秒）
	unavailableStartedAt?: number; // 短暂失联 30 天整改期的开始时间（Unix 秒）
	screenshot?: string; // 站点截图预览图（悬停展示）
};

/**
 * 远程友链：由 /api/friends 接口在运行时下发（Supabase 边缘函数），
 * 字段为驼峰命名，与本地配置（FriendLink）不是同一套结构。
 */
export type RemoteFriendLink = {
	title: string; // 友链标题
	desc: string; // 友链描述
	siteUrl: string; // 友链地址
	imgUrl: string; // 头像图片URL
	tags: string[]; // 标签数组
	weight: number; // 权重，数字越大排序越靠前
	updatedAt: string | null; // 友链记录最后更新时间（ISO 字符串）
	createdAt: string | null; // 友链记录创建时间（ISO 字符串）
};

/**
 * 友链「最后更新」信息。
 * 本地友链来自 RSS 条目的发布时间，远程友链优先取 RSS，回落取友链记录时间。
 */
export type FriendUpdateEntry = {
	date: string; // ISO 时间字符串
	title: string; // 最新文章标题（RSS 兜底时为空）
	stale: boolean; // 是否来自快照缓存（抓取失败时的降级数据）
};

export type FriendsPageConfig = {
	title?: string; // 页面标题，留空则使用 i18n 中的翻译
	description?: string; // 页面描述，留空则使用 i18n 中的翻译
	showCustomContent?: boolean; // 是否显示自定义内容（friends.mdx）
	showComment?: boolean; // 是否显示评论区，默认 true
	randomizeSort?: boolean; // 是否打乱排序，如果为 true，将忽略 weight，随机排序
	// 本站点信息（用于友链申请表单）
	site?: {
		name: string; // 站点名称
		desc: string; // 站点描述
		url: string; // 站点链接
		avatar: string; // 头像链接
		rss?: string; // RSS 订阅地址
	};
	// 注意事项（申请表单下方展示）
	notes?: Array<{ title: string; content: string }>;
};
