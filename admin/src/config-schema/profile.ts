// 侧边栏个人资料卡 schema（P1）
import type { ConfigDomainSchema } from "./types";

export const profileSchema: ConfigDomainSchema = {
	domain: "profile",
	label: "个人资料",
	group: "内容",
	hasForm: true,
	groups: [
		{
			label: "基础信息",
			fields: [
				{
					key: "avatar",
					label: "头像",
					control: "imageUrl",
					help: "public 路径（/ 开头）、src 相对路径或远程 URL",
					placeholder: "assets/images/avatar.avif",
				},
				{ key: "name", label: "昵称", control: "input", placeholder: "显示昵称" },
				{
					key: "bio",
					label: "简介",
					control: "textarea",
					placeholder: "一句话简介",
					rows: 2,
				},
			],
		},
		{
			label: "社交链接",
			help: "图标用 Iconify 名（如 fa7-brands:github），见 https://icones.js.org/",
			fields: [
				{
					key: "links",
					label: "链接列表",
					control: "objectList",
					itemLabelKey: "name",
					emptyItem: {
						name: "",
						icon: "",
						url: "",
						showName: false,
					},
					itemSchema: [
						{ key: "name", label: "名称", control: "input", placeholder: "如 GitHub" },
						{ key: "icon", label: "图标", control: "input", placeholder: "fa7-brands:github" },
						{ key: "url", label: "链接", control: "input", placeholder: "https://…" },
						{
							key: "showName",
							label: "显示名称",
							control: "switch",
							help: "关闭时仅显示图标",
						},
					],
				},
			],
		},
	],
};
