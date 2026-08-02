// 评论系统配置 schema（P0）
import type { ConfigDomainSchema } from "./types";

export const commentSchema: ConfigDomainSchema = {
	domain: "comment",
	label: "评论",
	group: "功能",
	hasForm: true,
	groups: [
		{
			label: "类型",
			fields: [
				{
					key: "type",
					label: "评论系统",
					control: "select",
					options: [
						{ label: "关闭", value: "none" },
						{ label: "Twikoo", value: "twikoo" },
						{ label: "Waline", value: "waline" },
						{ label: "Giscus", value: "giscus" },
						{ label: "Disqus", value: "disqus" },
						{ label: "Artalk", value: "artalk" },
					],
					help: "选择启用的评论系统；下方对应区块才生效",
				},
			],
		},
		{
			label: "Twikoo",
			fields: [
				{ key: "twikoo.envId", label: "环境 ID / 服务地址", control: "input", placeholder: "环境 ID 或服务 URL" },
				{ key: "twikoo.lang", label: "语言", control: "input", placeholder: "如 zh-CN" },
				{
					key: "twikoo.visitorCount",
					label: "访客统计",
					control: "switch",
				},
				{ key: "twikoo.jsUrl", label: "JS URL", control: "input", placeholder: "自定义 twikoo.js 地址" },
				{ key: "twikoo.cssUrl", label: "CSS URL", control: "input", placeholder: "自定义 twikoo.css 地址" },
			],
		},
		{
			label: "Waline",
			fields: [
				{ key: "waline.serverURL", label: "服务地址", control: "input", placeholder: "https://your-waline.example" },
				{ key: "waline.lang", label: "语言", control: "input", placeholder: "如 zh-CN" },
				{ key: "waline.emoji", label: "表情包 CDN", control: "tags", placeholder: "表情包 CDN 后点「添加」" },
				{
					key: "waline.login",
					label: "登录",
					control: "select",
					options: [
						{ label: "启用", value: "enable" },
						{ label: "禁用", value: "disable" },
						{ label: "强制", value: "force" },
					],
				},
				{
					key: "waline.visitorCount",
					label: "访客统计",
					control: "switch",
				},
			],
		},
		{
			label: "Artalk",
			fields: [
				{ key: "artalk.server", label: "服务地址", control: "input", placeholder: "https://your-artalk.example" },
				{ key: "artalk.locale", label: "语言", control: "input", placeholder: "如 zh-CN" },
				{
					key: "artalk.visitorCount",
					label: "访客统计",
					control: "switch",
				},
			],
		},
		{
			label: "Giscus",
			fields: [
				{ key: "giscus.repo", label: "仓库", control: "input", placeholder: "owner/repo" },
				{ key: "giscus.repoId", label: "仓库 ID", control: "input", placeholder: "giscus 控制台仓库 ID" },
				{ key: "giscus.category", label: "分类", control: "input", placeholder: "Discussions 分类名" },
				{ key: "giscus.categoryId", label: "分类 ID", control: "input", placeholder: "giscus 控制台分类 ID" },
				{ key: "giscus.mapping", label: "映射", control: "input", placeholder: "如 pathname" },
				{ key: "giscus.strict", label: "严格匹配", control: "input", placeholder: "0 或 1" },
				{ key: "giscus.reactionsEnabled", label: "表情反应", control: "input", placeholder: "0 或 1" },
				{ key: "giscus.emitMetadata", label: "输出元数据", control: "input", placeholder: "0 或 1" },
				{
					key: "giscus.inputPosition",
					label: "输入框位置",
					control: "select",
					options: [
						{ label: "顶部", value: "top" },
						{ label: "底部", value: "bottom" },
					],
				},
				{ key: "giscus.lang", label: "语言", control: "input", placeholder: "如 zh-CN" },
				{
					key: "giscus.loading",
					label: "加载方式",
					control: "select",
					options: [
						{ label: "懒加载", value: "lazy" },
						{ label: "立即", value: "eager" },
					],
				},
			],
		},
		{
			label: "Disqus",
			fields: [
				{ key: "disqus.shortname", label: "Shortname", control: "input", placeholder: "Disqus 站点 shortname" },
			],
		},
	],
};
