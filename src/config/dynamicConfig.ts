import type { DynamicConfig } from "@/types/dynamicConfig";

export const dynamicConfig: DynamicConfig = {
	// 页面标题，如果留空则使用 i18n 中的翻译
	title: "",

	// 页面描述文本，如果留空则使用 i18n 中的翻译
	description: "",

	// 是否为每条动态启用评论，需要先在 commentConfig.ts 启用评论系统
	showComment: true,

	// 每页显示的动态数量
	itemsPerPage: 20,

	// 动态数据 json 地址，本地默认 "/api/dynamic.json"
	// 可改为第三方接口地址，如 "https://firefly.cuteleaf.cn/api/dynamic.json"
	// 数据结构可打开上方链接地址参考
	apiUrl: "/api/dynamic.json",
};
