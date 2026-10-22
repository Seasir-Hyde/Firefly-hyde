import type { AnnouncementConfig } from "../types/announcementConfig";

export const announcementConfig: AnnouncementConfig = {
	// 公告标题
	title: "📢 欢迎来访者",

	// 公告内容
	content:
		"👋🏻 Hi，我是Rain，也是朝朝听雨，欢迎来到我的博客！这里是分享知识、交流想法的地方。希望你能在这里找到有价值的内容！\n本站已开源",

	// 是否允许用户关闭公告
	closable: true,

	links: [
		{
			// 启用链接
			enable: true,
			// 链接文本
			text: "了解更多",
			// 链接 URL
			url: "/about/",
			// 内部链接
			external: false,
		},
		{
			// 启用链接
			enable: true,
			// 链接文本
			text: "开源地址",
			// 链接 URL
			url: "https://github.com/Jarvis0227/Aemeath",
			// 外部链接
			external: true,
		},
	],
};
