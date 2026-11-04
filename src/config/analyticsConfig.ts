import type { AnalyticsConfig } from "../types/analyticsConfig";

export const analyticsConfig: AnalyticsConfig = {
	// Google Analytics ID
	googleAnalyticsId: "",
	// Microsoft Clarity ID
	microsoftClarityId: "",
	// Umami 统计配置
	umamiAnalytics: {
		// Umami Website ID
		websiteId: "88b3aaa0-7626-4464-aa70-f684493f5f80",
		// Umami JS地址，支持使用自建
		scriptUrl: "https://umami.seasir.top/script.js",
		// Umami 会话回放脚本地址，支持使用自建
		replaysScriptUrl: "https://umami.seasir.top/recorder.js",
		// 公开分享链接对应的 Share ID（仅用于读取公开统计，不要填写管理员 Token）
		shareId: "cp5SqrNUOxbulLZt",
		// Umami 实例的 API 地址（自建实例指向源站根地址，不含 /api）
		shareApiBase: "https://umami.seasir.top",
		// 迁移前的历史累计访客/浏览量，仅用于站内展示，不会回写 Umami
		historicalStats: {
			visitors: 0,
			pageviews: 0,
		},
		// 文章页是否显示 Umami 浏览量
		showPageViews: false,
		// 是否在站点统计卡（用户资料组件等）中显示累计访客与浏览量
		showSiteStats: true,
		// 是否追踪出站链接
		trackOutboundLinks: true,
		// 是否收集浏览器性能指标
		collectWebVitals: false,
		// 会话回放配置
		replays: {
			// 是否启用会话回放
			enabled: false,
			// 录制会话采样率，范围 0-1，例如 0.15 表示记录 15% 的会话
			sampleRate: 0.15,
			// 隐私遮罩级别："moderate" 会遮罩所有输入框；"strict" 额外遮罩页面全部文本
			maskLevel: "moderate",
			// 单次录制最大时长（毫秒）
			maxDuration: 300000,
			// 需要排除录制的元素 CSS 选择器，例如 ".sensitive-widget"
			blockSelector: "",
		},
	},
	// 51la 统计配置
	la51Analytics: {
		// 51la 统计 ID
		Id: "",
		// 自定义 SDK JS 地址，防止 DNS 污染，留空使用默认地址
		sdkUrl: "",
		// 多个统计 ID 的数据分离标识，留空则使用 Id
		ck: "",
		// 是否开启事件分析功能
		autoTrack: false,
		//  Hash路由模式, 项目使用History API路由, 所以不必开启默认false
		hashMode: false,
		// 是否开启网站录屏功能
		screenRecord: true,
	},
};
