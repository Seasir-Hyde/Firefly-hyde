// 页脚开关配置 schema（P1）
// 页脚 HTML 正文走「页面内容」页的「页脚 HTML」Tab（spec 通道 FooterConfig.html）
import type { ConfigDomainSchema } from "./types";

export const footerSchema: ConfigDomainSchema = {
	domain: "footer",
	label: "页脚",
	group: "内容",
	hasForm: true,
	groups: [
		{
			label: "开关",
			help: "页脚自定义 HTML（徽章/备案/计时等）请到「页面内容 → 页脚 HTML」编辑",
			fields: [
				{
					key: "enable",
					label: "启用页脚 HTML 注入",
					control: "switch",
					help: "关闭后不注入 FooterConfig.html 的自定义内容",
				},
			],
		},
	],
};
