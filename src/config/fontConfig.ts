import type { FontConfig } from "../types/fontConfig";

// 字体配置
export const fontConfig: FontConfig = {
	// 是否启用自定义字体功能
	enable: true,
	// 是否预加载字体文件
	preload: true,
	// 当前选择的字体，支持多个字体组合
	selected: ["Chikushi-A-maru"],

	// 各区域独立字体设置（填写下方 fonts 中的字体 ID，留空则使用全局 selected 字体）
	// 横幅标题字体
	bannerTitleFont: "Chikushi-A-maru",
	// 横幅副标题字体
	bannerSubtitleFont: "Chikushi-A-maru",
	// 导航栏标题字体
	navbarTitleFont: "Chikushi-A-maru",

	// 字体列表
	// 推荐使用可靠的 CDN 服务商提供的字体链接，它天然做了按需分片加载，且性能较好
	//
	// 也可以使用本地字体文件，但建议开启字体子集化处理，否则会因为字体文件庞大增加带宽负担导致页面加载缓慢甚至无法加载
	// 如果进行字体子集化处理，会导致动态内容（如评论，Bangumi等）无法正确显示字体，因此不推荐使用本地字体文件
	fonts: {
		// 本地字体 - Tsukushi A Rd Gothic Bold
		"Chikushi-A-maru": {
			id: "Chikushi-a-maru",
			name: "筑紫A丸",
			src: "/fonts/Chikushi-A-maru.woff2",
			family: "Chikushi A Rd Gothic",
			weight: 700,
			display: "swap" as const,
		},

		// 系统字体
		system: {
			id: "system",
			name: "系统字体",
			src: "", // 系统字体无需 src
			family:
				"system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
		},

		// Google Fonts - Zen Maru Gothic
		"zen-maru-gothic": {
			id: "zen-maru-gothic",
			name: "Zen Maru Gothic",
			src: "https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@300;400;500;700;900&display=swap",
			family: "Zen Maru Gothic",
			display: "swap" as const,
		},

		// Google Fonts - Inter
		inter: {
			id: "inter",
			name: "Inter",
			src: "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap",
			family: "Inter",
			display: "swap" as const,
		},

		// 小米字体 - MiSans Normal
		"misans-normal": {
			id: "misans-normal",
			name: "MiSans Normal",
			src: "https://unpkg.com/misans@4.1.0/lib/Normal/MiSans-Normal.min.css",
			family: "MiSans",
			weight: 400,
			display: "swap" as const,
		},

		// 小米字体 - MiSans Regular
		"misans-regular": {
			id: "misans-regular",
			name: "MiSans Regular",
			src: "https://unpkg.com/misans@4.1.0/lib/Normal/MiSans-Regular.min.css",
			family: "MiSans",
			weight: 500,
			display: "swap" as const,
		},

		// 小米字体 - MiSans Semibold
		"misans-semibold": {
			id: "misans-semibold",
			name: "MiSans Semibold",
			src: "https://unpkg.com/misans@4.1.0/lib/Normal/MiSans-Semibold.min.css",
			family: "MiSans",
			weight: 600,
			display: "swap" as const,
		},

		// ========== 本地字体示例（启用子集化） ==========
		// 使用步骤：
		// 1. 将 TTF/OTF/WOFF2 字体文件放在 public/fonts/ 目录下
		// 2. 取消下方注释并填写正确的字体信息
		// 3. 运行 pnpm build，脚本会自动扫描页面字符并生成轻量 woff2 子集
		// 注意：子集化仅包含构建时页面中出现的字符，评论等动态加载内容可能字体缺失
		//       可通过 subsetExtraChars 补充额外字符来缓解
		//
		// "misans-test": {
		// 	id: "misans-test",
		// 	name: "MiSans Test",
		// 	src: "/fonts/MiSans-Test.woff2",
		// 	family: "MiSans",
		// 	weight: 400,
		// 	display: "swap" as const,
		// 	subset: true, // 启用子集化
		// 	subsetExtraChars: "",
		// },
	},

	// 全局字体回退
	fallback: [
		"system-ui",
		"-apple-system",
		"BlinkMacSystemFont",
		"Segoe UI",
		"Roboto",
		"sans-serif",
	],
};
