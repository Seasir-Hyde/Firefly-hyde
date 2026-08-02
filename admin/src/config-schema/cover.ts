// 文章封面图配置 schema（P1）
import type { ConfigDomainSchema } from "./types";

export const coverSchema: ConfigDomainSchema = {
	domain: "cover",
	label: "封面图",
	group: "外观",
	hasForm: true,
	groups: [
		{
			label: "文章详情",
			fields: [
				{
					key: "enableInPost",
					label: "文章页显示封面图",
					control: "switch",
				},
				{
					key: "enableInPostOverlay",
					label: "标题/元数据叠加在封面上",
					control: "switch",
					help: "开启后文章顶部封面与标题/元数据叠加为横幅；关闭则封面作为独立块显示",
				},
				{
					key: "showLoading",
					label: "显示加载动画",
					control: "switch",
					help: "开启后显示转圈圈加载动画，会替代掉 LQIP 占位",
				},
			],
		},
		{
			label: "随机封面",
			help: '文章 frontmatter 写 image: "api" 时启用；依次尝试 API，全部失败保留 LQIP 并显示错误提示',
			fields: [
				{
					key: "randomCoverImage.enable",
					label: "启用随机图",
					control: "switch",
				},
				{
					key: "randomCoverImage.apis",
					label: "随机图 API",
					control: "tags",
					help: "按顺序尝试；失败则下一个",
					placeholder: "输入 API URL 后点「添加」",
				},
			],
		},
	],
};
