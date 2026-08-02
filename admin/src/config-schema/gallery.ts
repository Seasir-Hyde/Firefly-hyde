// 相册配置 schema（P2）
// albums 增删影响路由生成，标危险项（决策 5 / 7.6）
import type { ConfigDomainSchema } from "./types";

export const gallerySchema: ConfigDomainSchema = {
	domain: "gallery",
	label: "相册",
	group: "内容",
	hasForm: true,
	groups: [
		{
			label: "布局",
			fields: [
				{
					key: "columnWidth",
					label: "瀑布流最小列宽",
					control: "number",
					min: 100,
					max: 600,
					step: 10,
					help: "单位 px，默认 240；浏览器按容器宽度自动算列数",
				},
			],
		},
		{
			label: "相册列表",
			help: "每个相册需在 public/gallery/<id>/ 目录放入图片；id 同时作为 URL slug 与目录名",
			fields: [
				{
					key: "albums",
					label: "相册",
					control: "objectList",
					itemLabelKey: "name",
					danger:
						"增删或改 id 会影响相册路由生成；请确保 public/gallery/<id>/ 目录存在对应图片",
					emptyItem: {
						id: "",
						name: "",
						description: "",
						location: "",
						date: "",
						tags: [],
						cover: "",
						password: "",
						passwordHint: "",
					},
					itemSchema: [
						{
							key: "id",
							label: "ID（slug）",
							control: "input",
							placeholder: "scenery",
							help: "URL 与 public/gallery/ 目录名，建议英文/短横线",
						},
						{ key: "name", label: "名称", control: "input", placeholder: "相册显示名称" },
						{
							key: "description",
							label: "描述",
							control: "textarea",
							placeholder: "相册简介",
							rows: 2,
						},
						{ key: "location", label: "地点", control: "input", placeholder: "如 杭州" },
						{ key: "date", label: "日期", control: "input", placeholder: "YYYY-MM-DD" },
						{ key: "tags", label: "标签", control: "tags", placeholder: "输入标签后点「添加」" },
						{
							key: "cover",
							label: "封面图",
							control: "imageUrl",
							placeholder: "封面路径或 URL",
							help: "可选；省略则自动取 cover.* 或第一张",
						},
						{
							key: "password",
							label: "访问密码",
							control: "input",
							placeholder: "留空为公开",
							help: "非空时启用加密；留空为公开相册",
						},
						{ key: "passwordHint", label: "密码提示", control: "input", placeholder: "密码提示语" },
					],
				},
			],
		},
	],
};
