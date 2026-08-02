// 文章许可证配置 schema（P1）
import type { ConfigDomainSchema } from "./types";

export const licenseSchema: ConfigDomainSchema = {
	domain: "license",
	label: "许可证",
	group: "内容",
	hasForm: true,
	groups: [
		{
			label: "文章许可证",
			fields: [
				{
					key: "enable",
					label: "启用许可证展示",
					control: "switch",
					help: "文章详情页底部是否显示许可证信息",
				},
				{ key: "name", label: "许可证名称", control: "input", placeholder: "CC BY-NC-SA 4.0" },
				{ key: "url", label: "许可证链接", control: "input", placeholder: "https://creativecommons.org/…" },
				{
					key: "icon",
					label: "图标",
					control: "input",
					help: "留空则按名称自动匹配（CC 系列等）；也可填 Iconify 图标名",
					placeholder: "留空自动匹配",
				},
			],
		},
	],
};
