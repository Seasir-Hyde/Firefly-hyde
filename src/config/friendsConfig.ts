import type { FriendLink, FriendsPageConfig } from "../types/config";

// 可以在src/content/spec/friends.md中编写友链页面下方的自定义内容

// 友链页面配置
export const friendsPageConfig: FriendsPageConfig = {
	// 页面标题，如果留空则使用 i18n 中的翻译
	title: "友链墙",

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
		siteurl: "https://seasir.top/",
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
		imgurl: "https://mizuki.mysqil.com/_astro/avatar.DodcwRNI_ZrnMU5.webp",
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
	{
		title: "楠枝小笺",
		imgurl:
			"https://www.nannax.top/upload/Image_1777700231866_594.jpg?width=800",
		desc: "安安静静地存在，就已经很好了。",
		siteurl: "https://www.nannax.top/",
		tags: ["Astro"],
		weight: 8,
		enabled: true,
	},
	{
		title: "Yubendan",
		imgurl:
			"https://yubendan.com/_astro/avatar.DVGZ46-Q_1TAarN.webp",
		desc: "内心充盈者，独行也如众。",
		siteurl: "https://yubendan.com/",
		tags: ["Astro"],
		weight: 8,
		enabled: true,
	},
	{
		title: "versus0",
		imgurl: "https://img.542000.xyz/file/friend_avatar/1778931720838_f167cb95af9d881f4378b92b3e181d89_4647054993754934443.jpg",
		desc: "技术+算法blog。",
		siteurl: "https://blog.542000.xyz",
		tags: [
			"Astro"
		],
		weight: 8,
		enabled: true
	},
	{
		title: "ZhiJing’s Blog",
		imgurl: "https://iwexe.top/avatar.svg",
		desc: "Go with the flow.",
		siteurl: "https://iwexe.top",
		tags: [
			"Astro"
		],
		weight: 8,
		enabled: true
	},
	{
		title: "十三",
		imgurl: "https://img.nw177.cn/blog/100.assets/avatar.webp",
		desc: "欲买桂花同载酒，终不似，少年游。",
		siteurl: "https://firefly.nw177.cn",
		tags: [
			"Astro"
		],
		weight: 8,
		enabled: true
	},
	{
		title: "星遐蝶梦",
		imgurl: "https://blog.casto.top/_astro/avatar.BmbZMO2d_Z1ed0Se.webp",
		desc: "星穹漫遐，蝶携清梦。",
		siteurl: "https://blog.casto.top",
		tags: [],
		weight: 8,
		enabled: true
	},
	{
		title: "团子和蛋糕",
		imgurl: "https://re.tsh520.cn/zl/tx.webp",
		desc: "如果你喜欢那么欢迎来到我的世界！",
		siteurl: "https://blog.tsh520.cn",
		tags: [],
		weight: 0,
		enabled: true
	},
	{
		title: "年华",
		imgurl: "https://q1.qlogo.cn/g?b=qq&nk=1323860289&s=640",
		desc: "分享生活和技术。",
		siteurl: "https://blog.520781.xyz",
		tags: [],
		weight: 0,
		enabled: true
	}
];

// 获取启用的友链并进行排序
export const getEnabledFriends = (): FriendLink[] => {
	const friends = friendsConfig.filter((friend) => friend.enabled);

	if (friendsPageConfig.randomizeSort) {
		return friends.sort(() => Math.random() - 0.5);
	}

	return friends.sort((a, b) => b.weight - a.weight);
};
