export type AnalyticsConfig = {
	googleAnalyticsId?: string; // Google Analytics ID
	microsoftClarityId?: string; // Microsoft Clarity ID
	umamiAnalytics?: {
		websiteId?: string; // Umami Website ID
		shareId?: string; // Umami 分享令牌（分享链接 /share/{shareId} 中的 ID），用于页脚公开统计查询
		/** Umami 实例地址，例如 https://umami.seasir.top；公开统计接口的基址 */
		shareApiBase?: string;
		/** 迁移前仅用于站内展示的历史累计，不会回写或伪造 Umami 数据 */
		historicalStats?: {
			visitors?: number;
			pageviews?: number;
			/** 例如：含迁移前历史累计；浏览量为估算值 */
			label?: string;
		};
		/** 是否在站点统计卡中显示 Umami 的累计访客与浏览量，默认 true */
		showSiteStats?: boolean;
		scriptUrl?: string; // Umami JS地址，支持使用自建
		replaysScriptUrl?: string; // Umami 会话回放脚本地址
		trackOutboundLinks?: boolean; // 是否追踪出站链接点击事件，默认 true
		collectWebVitals?: boolean; // 是否自动收集访客浏览器核心网页指标，默认 false
		replays?: {
			enabled?: boolean; // 是否启用会话回放，默认 false
			sampleRate?: number; // 录制会话采样率，范围 0-1，默认 0.15
			maskLevel?: "moderate" | "strict"; // 隐私遮罩级别，默认 moderate
			maxDuration?: number; // 单次录制最大时长（毫秒），默认 300000
			blockSelector?: string; // 需要完全排除录制的元素 CSS 选择器
		};
	};
	la51Analytics?: {
		Id?: string; // 51la 统计 ID
		sdkUrl?: string; // 自定义 SDK 地址，防止 DNS 污染，默认为 "//sdk.51.la/js-sdk-pro.min.js"
		ck?: string; // 多个统计 ID 的数据分离标识，默认与 id 相同
		autoTrack?: boolean; // 开启事件分析功能，默认 true
		hashMode?: boolean; // 单页面应用统计（Vue/React 等），默认 false
		screenRecord?: boolean; // 开启网站录屏功能，默认 true
	};
};
