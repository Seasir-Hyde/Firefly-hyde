// 上游动态页配置 schema（P2）
import type { ConfigDomainSchema } from "./types";

export const dynamicSchema: ConfigDomainSchema = {
	domain: "dynamic",
	label: "动态页",
	group: "内容",
	hasForm: true,
	groups: [
		{
			label: "页面文案",
			fields: [
				{
					key: "title",
					label: "页面标题",
					control: "input",
					placeholder: "留空用默认文案",
					help: "留空则使用 i18n 默认文案",
				},
				{
					key: "description",
					label: "页面描述",
					control: "textarea",
					placeholder: "留空用默认文案",
					rows: 2,
					help: "留空则使用 i18n 默认文案",
				},
			],
		},
		{
			label: "开关与分页",
			fields: [
				{
					key: "showComment",
					label: "显示评论区",
					control: "switch",
				},
				{
					key: "itemsPerPage",
					label: "每页条数",
					control: "number",
					min: 1,
					max: 200,
					step: 1,
					help: "动态列表分页大小",
				},
			],
		},
	],
};
