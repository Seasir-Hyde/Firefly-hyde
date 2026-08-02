// 友链页面配置 schema（P1）
// 友链数据本身走 KV（友链管理页），本域只管页面标题/描述/开关
import type { ConfigDomainSchema } from "./types";

export const friendsPageSchema: ConfigDomainSchema = {
	domain: "friends-page",
	label: "友链页面",
	group: "内容",
	hasForm: true,
	groups: [
		{
			label: "页面文案",
			help: "友链条目请用「资料数据 → 友链」管理（KV 即时生效）",
			fields: [
				{
					key: "title",
					label: "页面标题",
					control: "input",
					placeholder: "留空用默认文案",
					help: "留空则使用 i18n 翻译",
				},
				{
					key: "description",
					label: "页面描述",
					control: "textarea",
					placeholder: "留空用默认文案",
					rows: 2,
					help: "留空则使用 i18n 翻译",
				},
			],
		},
		{
			label: "开关",
			fields: [
				{
					key: "showCustomContent",
					label: "显示自定义内容",
					control: "switch",
					help: "是否渲染 friends.mdx 中的自定义 Markdown",
				},
				{
					key: "showComment",
					label: "显示评论区",
					control: "switch",
				},
				{
					key: "randomizeSort",
					label: "随机排序",
					control: "switch",
					help: "开启后忽略 weight，每次随机打乱友链顺序",
				},
			],
		},
	],
};
