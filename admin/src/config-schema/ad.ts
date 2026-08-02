// 广告配置 schema（P2）
// 顶层两个广告位 ad1 / ad2；开关在侧边栏组件配置中控制是否展示
import type { ConfigDomainSchema } from "./types";

export const adSchema: ConfigDomainSchema = {
	domain: "ad",
	label: "广告",
	group: "内容",
	hasForm: true,
	groups: [
		{
			label: "广告位 1",
			help: "纯图片广告位；侧边栏是否展示由「侧边栏」域的广告组件开关控制",
			fields: [
				{ key: "ad1.image.src", label: "图片", control: "imageUrl", placeholder: "assets/images/cover.avif" },
				{ key: "ad1.image.alt", label: "图片描述", control: "input", placeholder: "图片说明文字" },
				{ key: "ad1.image.link", label: "图片点击链接", control: "input", placeholder: "https://… 或相对路径" },
				{
					key: "ad1.image.external",
					label: "外链打开",
					control: "switch",
					help: "开启后新标签打开链接",
				},
				{
					key: "ad1.closable",
					label: "可关闭",
					control: "switch",
				},
				{
					key: "ad1.displayCount",
					label: "显示次数",
					control: "number",
					min: -1,
					max: 9999,
					step: 1,
					help: "-1 表示无限制",
				},
				{
					key: "ad1.padding",
					label: "边距（JSON）",
					control: "json",
					help: "如 {\"all\":\"0\"} 或 {\"top\":\"1rem\",\"bottom\":\"0\"}",
				},
			],
		},
		{
			label: "广告位 2",
			help: "完整内容广告（标题/正文/图片/链接）",
			fields: [
				{ key: "ad2.title", label: "标题", control: "input", placeholder: "广告标题" },
				{
					key: "ad2.content",
					label: "正文",
					control: "textarea",
					placeholder: "广告正文",
					rows: 3,
				},
				{ key: "ad2.image.src", label: "图片", control: "imageUrl", placeholder: "assets/images/cover.avif" },
				{ key: "ad2.image.alt", label: "图片描述", control: "input", placeholder: "图片说明文字" },
				{ key: "ad2.image.link", label: "图片点击链接", control: "input", placeholder: "https://… 或相对路径" },
				{
					key: "ad2.image.external",
					label: "图片外链打开",
					control: "switch",
				},
				{ key: "ad2.link.text", label: "按钮文字", control: "input", placeholder: "支持一下" },
				{ key: "ad2.link.url", label: "按钮链接", control: "input", placeholder: "如 /about/" },
				{
					key: "ad2.link.external",
					label: "按钮外链打开",
					control: "switch",
				},
				{
					key: "ad2.closable",
					label: "可关闭",
					control: "switch",
				},
				{
					key: "ad2.displayCount",
					label: "显示次数",
					control: "number",
					min: -1,
					max: 9999,
					step: 1,
					help: "-1 表示无限制",
				},
				{
					key: "ad2.padding",
					label: "边距（JSON）",
					control: "json",
					help: "如 {} 或 {\"all\":\"1rem\"}",
				},
			],
		},
	],
};
