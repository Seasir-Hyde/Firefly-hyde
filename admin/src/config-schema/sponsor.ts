// 赞助页配置 schema（P1）
import type { ConfigDomainSchema } from "./types";

export const sponsorSchema: ConfigDomainSchema = {
	domain: "sponsor",
	label: "赞助",
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
					placeholder: "赞助页简介",
					rows: 2,
				},
				{
					key: "usage",
					label: "赞助用途说明",
					control: "textarea",
					placeholder: "赞助用途说明",
					rows: 3,
				},
			],
		},
		{
			label: "开关",
			fields: [
				{
					key: "showSponsorsList",
					label: "显示赞助者列表",
					control: "switch",
				},
				{
					key: "showComment",
					label: "显示评论区",
					control: "switch",
				},
				{
					key: "showButtonInPost",
					label: "文章底部赞助按钮",
					control: "switch",
					help: "文章详情页底部是否显示赞助入口",
				},
			],
		},
		{
			label: "赞助方式",
			fields: [
				{
					key: "methods",
					label: "方式列表",
					control: "objectList",
					itemLabelKey: "name",
					emptyItem: {
						name: "",
						icon: "",
						qrCode: "",
						link: "",
						description: "",
						enabled: true,
					},
					itemSchema: [
						{ key: "name", label: "名称", control: "input", placeholder: "如 支付宝" },
						{ key: "icon", label: "图标", control: "input", placeholder: "fa7-brands:alipay" },
						{
							key: "qrCode",
							label: "收款码",
							control: "imageUrl",
							placeholder: "收款码图片路径/URL",
							help: "扫码赞助用图片",
						},
						{ key: "link", label: "跳转链接", control: "input", placeholder: "https://…" },
						{ key: "description", label: "描述", control: "input", placeholder: "方式说明（可选）" },
						{
							key: "enabled",
							label: "启用",
							control: "switch",
						},
					],
				},
			],
		},
		{
			label: "赞助者名单",
			fields: [
				{
					key: "sponsors",
					label: "赞助者",
					control: "objectList",
					itemLabelKey: "name",
					emptyItem: {
						name: "",
						avatar: "",
						amount: "",
						date: "",
					},
					itemSchema: [
						{ key: "name", label: "名称", control: "input", placeholder: "赞助者昵称" },
						{ key: "avatar", label: "头像", control: "imageUrl", placeholder: "头像路径或 URL" },
						{ key: "amount", label: "金额", control: "input", placeholder: "¥20" },
						{ key: "date", label: "日期", control: "input", placeholder: "YYYY-MM-DD" },
					],
				},
			],
		},
	],
};
