// PlantUML 图表配置 schema（P2）
// 构建时编码 + 客户端按主题拉取 SVG；主题名见 https://plantuml.com/zh/theme
import type { ConfigDomainSchema } from "./types";

export const plantumlSchema: ConfigDomainSchema = {
	domain: "plantuml",
	label: "PlantUML",
	group: "开发者",
	hasForm: true,
	groups: [
		{
			label: "开关与服务器",
			fields: [
				{
					key: "enable",
					label: "启用 PlantUML",
					control: "switch",
					help: "关闭后 plantuml 代码块退化为普通代码高亮",
				},
				{
					key: "server",
					label: "PlantUML 服务器",
					control: "input",
					placeholder: "https://www.plantuml.com/plantuml",
					help: "尾部斜杠会自动归一化；可填自建服务器",
				},
			],
		},
		{
			label: "主题",
			help: "留空表示不注入 !theme <name>；主题名见 plantuml.com/zh/theme",
			fields: [
				{
					key: "lightTheme",
					label: "亮色主题",
					control: "input",
					placeholder: "留空 = 不注入主题",
					help: "如 plain、cerulean；空字符串不注入",
				},
				{
					key: "darkTheme",
					label: "暗色主题",
					control: "input",
					placeholder: "cyborg",
					help: "如 cyborg、superhero；空字符串不注入",
				},
			],
		},
	],
};
