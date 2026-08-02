// 代码高亮（expressive-code）配置 schema（P2）
// 主题名见 https://expressive-code.com/guides/themes/
import type { ConfigDomainSchema } from "./types";

export const expressiveCodeSchema: ConfigDomainSchema = {
	domain: "expressive-code",
	label: "代码高亮",
	group: "开发者",
	hasForm: true,
	groups: [
		{
			label: "主题",
			help: "修改后需重新构建；开发服务器需重启才生效。更多主题见官方文档",
			fields: [
				{
					key: "lightTheme",
					label: "亮色主题",
					control: "input",
					placeholder: "one-light",
					help: "expressive-code 主题名，如 one-light、github-light",
				},
				{
					key: "darkTheme",
					label: "暗色主题",
					control: "input",
					placeholder: "one-dark-pro",
					help: "expressive-code 主题名，如 one-dark-pro、github-dark",
				},
			],
		},
		{
			label: "折叠插件",
			fields: [
				{
					key: "pluginCollapsible.enable",
					label: "启用代码块折叠",
					control: "switch",
				},
				{
					key: "pluginCollapsible.lineThreshold",
					label: "折叠行数阈值",
					control: "number",
					min: 1,
					max: 500,
					step: 1,
					help: "代码块超过该行数时启用折叠",
				},
				{
					key: "pluginCollapsible.previewLines",
					label: "折叠时预览行数",
					control: "number",
					min: 1,
					max: 100,
					step: 1,
				},
				{
					key: "pluginCollapsible.defaultCollapsed",
					label: "默认折叠",
					control: "switch",
					help: "超过阈值时初始状态是否折叠",
				},
			],
		},
		{
			label: "语言徽章",
			fields: [
				{
					key: "pluginLanguageBadge.enable",
					label: "显示语言徽章",
					control: "switch",
					help: "代码块右上角显示语言名",
				},
			],
		},
	],
};
