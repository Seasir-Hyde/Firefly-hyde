// 静态公告配置 schema（P0，KV 空时兜底）
import type { ConfigDomainSchema } from "./types";

export const announcementSchema: ConfigDomainSchema = {
	domain: "announcement",
	label: "公告兜底",
	group: "内容",
	hasForm: true,
	groups: [
		{
			label: "公告内容",
			help: "仅当 KV 公告为空时生效，日常公告请用「公告」管理页。",
			fields: [
				{ key: "title", label: "标题", control: "input", placeholder: "公告标题" },
				{
					key: "content",
					label: "内容",
					control: "textarea",
					placeholder: "公告正文",
					rows: 3,
				},
				{
					key: "closable",
					label: "可关闭",
					control: "switch",
				},
			],
		},
		{
			label: "链接",
			fields: [
				{
					key: "link.enable",
					label: "启用链接",
					control: "switch",
				},
				{ key: "link.text", label: "链接文案", control: "input", placeholder: "如 了解更多" },
				{ key: "link.url", label: "链接地址", control: "input", placeholder: "/about/" },
				{
					key: "link.external",
					label: "外链（新窗口）",
					control: "switch",
				},
			],
		},
	],
};
