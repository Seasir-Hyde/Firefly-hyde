// Mermaid 图表配置 schema（P2）
// 构建时由 merman 渲染为静态 SVG；主题预设名见 @mermanjs/web
import type { ConfigDomainSchema } from "./types";

export const mermaidSchema: ConfigDomainSchema = {
	domain: "mermaid",
	label: "Mermaid",
	group: "开发者",
	hasForm: true,
	groups: [
		{
			label: "主题",
			help: "构建时渲染 mermaid 代码块为静态 SVG，明暗主题通过 CSS 自动切换",
			fields: [
				{
					key: "lightTheme",
					label: "亮色主题",
					control: "select",
					options: [
						{ label: "editor-light", value: "editor-light" },
						{ label: "gruvbox-light", value: "gruvbox-light" },
						{ label: "ayu-light", value: "ayu-light" },
					],
					help: "merman 宿主主题预设",
				},
				{
					key: "darkTheme",
					label: "暗色主题",
					control: "select",
					options: [
						{ label: "editor-dark", value: "editor-dark" },
						{ label: "one-dark", value: "one-dark" },
						{ label: "gruvbox-dark", value: "gruvbox-dark" },
						{ label: "ayu-dark", value: "ayu-dark" },
					],
					help: "merman 宿主主题预设",
				},
			],
		},
	],
};
