// 壁纸配置 schema（P1）
// 复杂联合类型（src 单图/数组/分设备）按当前 JSON 形态表单化：分设备图片 URL 列表
import type { ConfigDomainSchema } from "./types";

export const wallpaperSchema: ConfigDomainSchema = {
	domain: "wallpaper",
	label: "壁纸",
	group: "外观",
	hasForm: true,
	groups: [
		{
			label: "模式",
			fields: [
				{
					key: "mode",
					label: "壁纸模式",
					control: "select",
					options: [
						{ label: "横幅 Banner", value: "banner" },
						{ label: "全屏 Fullscreen", value: "fullscreen" },
						{ label: "透明覆盖 Overlay", value: "overlay" },
						{ label: "纯色 None", value: "none" },
					],
					help: "banner 横幅 / fullscreen 全屏 / overlay 透明覆盖 / none 纯色背景",
				},
				{
					key: "switchable",
					label: "允许访客切换模式",
					control: "switch",
					help: "导航栏控制面板是否可切换壁纸模式",
				},
				{
					key: "playerEnable",
					label: "启用背景视频",
					control: "switch",
					help: "开启后导航栏显示播放按钮；需配置视频地址",
				},
			],
		},
		{
			label: "图片源",
			help: "支持远程 URL 或站点相对路径；可配置多张（每次刷新随机一张）",
			fields: [
				{
					key: "src.desktop",
					label: "桌面端图片",
					control: "tags",
					help: "一张或多张图片 URL；多张时随机选一张",
					placeholder: "输入图片 URL 后点「添加」",
				},
				{
					key: "src.mobile",
					label: "移动端图片",
					control: "tags",
					help: "一张或多张图片 URL；多张时随机选一张",
					placeholder: "输入图片 URL 后点「添加」",
				},
				{
					key: "src.playerUrl",
					label: "背景视频地址",
					control: "tags",
					help: "MP4 等视频 URL；可多条。需同时开启「启用背景视频」",
					placeholder: "输入视频 URL 后点「添加」",
				},
				{
					key: "common.playerMode",
					label: "多视频播放模式",
					control: "select",
					options: [
						{ label: "顺序循环", value: "order" },
						{ label: "随机切换", value: "random" },
					],
					help: "配置多条视频时生效",
				},
			],
		},
		{
			label: "首页文字",
			fields: [
				{
					key: "common.homeText.enable",
					label: "显示首页文字",
					control: "switch",
				},
				{
					key: "common.homeText.switchable",
					label: "允许访客切换标题显示",
					control: "switch",
				},
				{ key: "common.homeText.title", label: "主标题", control: "input", placeholder: "首页大标题" },
				{ key: "common.homeText.titleSize", label: "主标题字号", control: "input", placeholder: "4.5rem" },
				{
					key: "common.homeText.subtitle",
					label: "副标题",
					control: "tags",
					help: "可多条，打字机效果会轮换",
					placeholder: "输入副标题后点「添加」",
				},
				{ key: "common.homeText.subtitleSize", label: "副标题字号", control: "input", placeholder: "1.5rem" },
				{
					key: "common.homeText.typewriter.enable",
					label: "打字机效果",
					control: "switch",
				},
				{
					key: "common.homeText.typewriter.speed",
					label: "打字速度 (ms)",
					control: "number",
					min: 10,
					max: 2000,
					step: 10,
				},
				{
					key: "common.homeText.typewriter.deleteSpeed",
					label: "删除速度 (ms)",
					control: "number",
					min: 10,
					max: 2000,
					step: 10,
				},
				{
					key: "common.homeText.typewriter.pauseTime",
					label: "完整显示后暂停 (ms)",
					control: "number",
					min: 0,
					max: 30000,
					step: 100,
				},
			],
		},
		{
			label: "文章横幅",
			help: "文章详情页 banner 上标题下方显示的内容",
			fields: [
				{
					key: "common.postInfo.mode",
					label: "显示模式",
					control: "select",
					options: [
						{ value: "description", label: "文章描述" },
						{ value: "meta", label: "日期/字数/阅读时长" },
					],
				},
			],
		},
		{
			label: "遮罩与导航栏",
			fields: [
				{
					key: "common.dimOpacity",
					label: "文字遮罩暗度",
					control: "slider",
					min: 0,
					max: 1,
					step: 0.05,
					help: "0–1，越大越暗",
				},
				{
					key: "common.navbar.transparentMode",
					label: "导航栏透明模式",
					control: "select",
					options: [
						{ label: "半透明 semi", value: "semi" },
						{ label: "全透明 full", value: "full" },
						{ label: "半全透明 semifull", value: "semifull" },
					],
				},
				{
					key: "common.navbar.enableBlur",
					label: "导航栏毛玻璃",
					control: "switch",
				},
				{
					key: "common.navbar.blur",
					label: "毛玻璃模糊度",
					control: "number",
					min: 0,
					max: 50,
					step: 1,
				},
			],
		},
		{
			label: "水波纹",
			fields: [
				{
					key: "common.waves.enable.desktop",
					label: "桌面端水波纹",
					control: "switch",
				},
				{
					key: "common.waves.enable.mobile",
					label: "移动端水波纹",
					control: "switch",
				},
				{
					key: "common.waves.switchable",
					label: "允许访客切换水波纹",
					control: "switch",
				},
			],
		},
		{
			label: "渐变过渡",
			help: "水波纹关闭时自动启用，壁纸底部到背景色的平滑过渡",
			fields: [
				{
					key: "common.gradient.enable.desktop",
					label: "桌面端渐变",
					control: "switch",
				},
				{
					key: "common.gradient.enable.mobile",
					label: "移动端渐变",
					control: "switch",
				},
				{ key: "common.gradient.height", label: "渐变高度", control: "input", placeholder: "15vh" },
				{
					key: "common.gradient.switchable",
					label: "允许访客切换渐变",
					control: "switch",
				},
			],
		},
		{
			label: "Banner 模式",
			help: "mode 为 banner 时生效",
			fields: [
				{
					key: "banner.position",
					label: "壁纸位置",
					control: "input",
					placeholder: "如 center 或 0% 20%",
					help: "CSS object-position 值",
				},
				{
					key: "banner.carousel.enable",
					label: "横幅轮播",
					control: "switch",
				},
				{
					key: "banner.carousel.interval",
					label: "轮播间隔 (ms)",
					control: "number",
					min: 1000,
					max: 60000,
					step: 500,
				},
				{
					key: "banner.carousel.switchable",
					label: "允许访客切换轮播",
					control: "switch",
				},
			],
		},
		{
			label: "Overlay 模式",
			help: "mode 为 overlay 时生效",
			fields: [
				{
					key: "overlay.switchable.opacity",
					label: "允许调整透明度",
					control: "switch",
				},
				{
					key: "overlay.switchable.blur",
					label: "允许调整背景模糊",
					control: "switch",
				},
				{
					key: "overlay.switchable.cardOpacity",
					label: "允许调整卡片透明度",
					control: "switch",
				},
				{
					key: "overlay.zIndex",
					label: "层级 zIndex",
					control: "number",
					min: -100,
					max: 100,
					step: 1,
				},
				{
					key: "overlay.opacity",
					label: "壁纸透明度",
					control: "slider",
					min: 0,
					max: 1,
					step: 0.05,
				},
				{
					key: "overlay.blur",
					label: "背景模糊 (px)",
					control: "number",
					min: 0,
					max: 100,
					step: 1,
				},
				{
					key: "overlay.cardOpacity",
					label: "卡片透明度",
					control: "slider",
					min: 0,
					max: 1,
					step: 0.05,
				},
			],
		},
		{
			label: "Fullscreen 模式",
			help: "mode 为 fullscreen 时生效",
			fields: [
				{
					key: "fullscreen.position",
					label: "壁纸位置",
					control: "input",
					placeholder: "center",
					help: "CSS object-position 值",
				},
			],
		},
	],
};
