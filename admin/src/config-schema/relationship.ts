// 恋爱计时小组件配置 schema（P1）
import type { ConfigDomainSchema } from "./types";

export const relationshipSchema: ConfigDomainSchema = {
	domain: "relationship",
	label: "恋爱计时",
	group: "内容",
	hasForm: true,
	groups: [
		{
			label: "计时",
			fields: [
				{
					key: "startDate",
					label: "起始日期",
					control: "input",
					placeholder: "YYYY-MM-DD",
					help: "恋爱/相识起始日",
				},
				{
					key: "title",
					label: "标题文案",
					control: "input",
					placeholder: "我和宝宝在一起已经",
					help: "显示在计时数字前的说明文字",
				},
			],
		},
		{
			label: "双方",
			fields: [
				{ key: "name1", label: "姓名 1", control: "input", placeholder: "左/上侧名字" },
				{ key: "avatar1", label: "头像 1", control: "imageUrl", placeholder: "头像路径或 URL" },
				{ key: "name2", label: "姓名 2", control: "input", placeholder: "右/下侧名字" },
				{ key: "avatar2", label: "头像 2", control: "imageUrl", placeholder: "头像路径或 URL" },
			],
		},
	],
};
