import type { FriendLink, FriendsPageConfig } from "../types/config";

// 可以在src/content/spec/friends.md中编写友链页面下方的自定义内容

// 友链页面配置
export const friendsPageConfig: FriendsPageConfig = {
	// 页面标题，如果留空则使用 i18n 中的翻译
	title: "",

	// 页面描述文本，如果留空则使用 i18n 中的翻译
	description: "",

	// 是否显示底部自定义内容（friends.mdx 中的内容）
	showCustomContent: true,

	// 是否显示评论区，需要先在commentConfig.ts启用评论系统
	showComment: true,

	// 是否开启随机排序配置，如果开启，就会忽略权重，构建时进行一次随机排序
	randomizeSort: false,
};

// 友链配置
export const friendsConfig: FriendLink[] = [
	{
		title: "Hyde Blog",
		imgurl: "/assets/avatar.avif",
		desc: "人心中的成见是一座大山~",
		siteurl: "https://teek.seasir.top/",
		tags: ["Astro"],
		weight: 10, // 权重，数字越大排序越靠前
		enabled: true, // 是否启用
	},
	{
		title: "Firefly Docs",
		imgurl: "https://docs-firefly.cuteleaf.cn/logo.png",
		desc: "Firefly主题模板文档",
		siteurl: "https://docs-firefly.cuteleaf.cn",
		tags: ["Docs"],
		weight: 10,
		enabled: true,
	},
	{
		title: "RyuChan",
		imgurl: "https://ryu-chan.vercel.app/profile.png",
		desc: "Ciallo～(∠・ω<)⌒★",
		siteurl: "https://ryu-chan.vercel.app/",
		tags: ["Astro"],
		weight: 10, // 权重，数字越大排序越靠前
		enabled: true, // 是否启用
	},
	{
		title: "Mizuki",
		imgurl: "https://mizuki.mysqil.com/_astro/avatar.DodcwRNI_Z1iLucw.webp",
		desc: "下一代Material Design 3 博客主题(Astro驱动)",
		siteurl: "https://mizuki.mysqil.com/",
		tags: ["Astro"],
		weight: 8,
		enabled: true,
	},
	{
		title: "Mizuki-Ultra",
		imgurl: "https://docs.mizuki.mysqil.com/favicon.png",
		desc: "一个简约&功能丰富的 Astro 博客 主题",
		siteurl: "https://docs.mizuki.mysqil.com/",
		tags: ["Docs"],
		weight: 8,
		enabled: true,
	},
	{
		title: "W3C技术联盟",
		imgurl: "https://image.js.cn/logo.svg",
		desc: "让Web服务全人类",
		siteurl: "https://image.js.cn/",
		tags: ["W3C"],
		weight: 8,
		enabled: true,
	},
	{
		title: "One",
		imgurl:
			"https://img.onedayxyy.cn/images/Teek/Teekwebsite/xyy-logo.avif?w=150&h=150&fit=crop&fm=webp&q=80",
		desc: "上海修车spa足浴推拿反差狂魔one哥",
		siteurl: "https://onedayxyy.cn/",
		tags: ["One哥"],
		weight: 8,
		enabled: true,
	},
];

// 获取启用的友链并进行排序
export const getEnabledFriends = (): FriendLink[] => {
	const friends = friendsConfig.filter((friend) => friend.enabled);

	if (friendsPageConfig.randomizeSort) {
		return friends.sort(() => Math.random() - 0.5);
	}

	return friends.sort((a, b) => b.weight - a.weight);
};
