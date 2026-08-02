// 站点字体配置 schema（Astro Font API）
// 顶层：{ fontConfig: FontSelectionConfig, fontsList: FontDefinition[] }
// fontsList / subsetFonts 结构较深，用 json 控件；选用与区域用表单。
import type { ConfigDomainSchema } from "./types";

const FONT_CSS_VAR_HELP =
	"填写 fontsList 里某项的 cssVariable（如 --font-chikushi-a-maru），或 system 表示系统字体；留空表示跟随全局 selected";

export const fontSchema: ConfigDomainSchema = {
	domain: "font",
	label: "字体",
	group: "外观",
	hasForm: true,
	groups: [
		{
			label: "开关与选用",
			help: "基于 Astro Font API。本地中文字体构建期会子集化；fontsource/google 由框架按需加载。改完保存后约 3–5 分钟构建生效。",
			fields: [
				{
					key: "fontConfig.enable",
					label: "启用自定义字体",
					control: "switch",
					help: "关闭后整站使用系统字体栈，不加载任何自定义字体",
				},
				{
					key: "fontConfig.selected",
					label: "全局选用字体",
					control: "tags",
					help: "cssVariable 列表，可多选组合；system 表示系统字体。例：--font-chikushi-a-maru",
					placeholder: "输入 --font-xxx 或 system 后点添加",
				},
			],
		},
		{
			label: "区域字体",
			help: "留空则跟随全局 selected。Banner 标题/副标题、导航栏标题、代码块可单独指定。",
			fields: [
				{
					key: "fontConfig.bannerTitleFont",
					label: "横幅主标题字体",
					control: "input",
					help: FONT_CSS_VAR_HELP,
					placeholder: "--font-chikushi-a-maru",
				},
				{
					key: "fontConfig.bannerSubtitleFont",
					label: "横幅副标题字体",
					control: "input",
					help: FONT_CSS_VAR_HELP,
					placeholder: "--font-inter",
				},
				{
					key: "fontConfig.navbarTitleFont",
					label: "导航栏标题字体",
					control: "input",
					help: FONT_CSS_VAR_HELP,
					placeholder: "留空 = 跟随全局",
				},
				{
					key: "fontConfig.codeFont",
					label: "代码块字体",
					control: "input",
					help: "等宽字体 cssVariable，默认 --font-jetbrains-mono",
					placeholder: "--font-jetbrains-mono",
				},
			],
		},
		{
			label: "本地字体子集化",
			help: "仅对 provider=local 的字体生效。构建后 scripts/subset-fonts.ts 扫描页面字符生成轻量 woff2；extraChars 可补评论/动态等未进静态页的字。",
			fields: [
				{
					key: "fontConfig.subsetFonts",
					label: "子集化表（JSON）",
					control: "json",
					help: '键为 cssVariable，值如 { "extraChars": "…" }。例：{ "--font-chikushi-a-maru": { "extraChars": "" } }',
					rows: 8,
				},
			],
		},
		{
			label: "字体库 fontsList",
			help: "Astro Font API 定义数组。provider：local / fontsource / google / bunny / fontshare / npm。本地文件路径须在 public/ 下（如 ./public/fonts/xxx.woff2）。",
			fields: [
				{
					key: "fontsList",
					label: "字体定义列表（JSON）",
					control: "json",
					help: "数组项：{ name, cssVariable, provider, weights?, styles?, subsets?, fallbacks?, display?, options? }",
					rows: 16,
				},
			],
		},
	],
};
