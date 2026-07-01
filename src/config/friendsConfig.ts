import type { FriendLink, FriendsPageConfig } from "../types/friendsConfig";

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
		desc: "人心中的成见是一座大山",
		siteurl: "https://seasir.top/",
		imgurl: "/assets/avatar.avif",
		tags: ["Astro"],
		weight: 10,
		enabled: true,
	},
	{
		title: "Firefly Docs",
		desc: "Firefly主题模板文档",
		siteurl: "https://docs-firefly.cuteleaf.cn",
		imgurl: "https://docs-firefly.cuteleaf.cn/logo.png",
		tags: ["Docs"],
		weight: 10,
		enabled: true,
	},
	{
		title: "RyuChan",
		desc: "Ciallo～(∠・ω<)⌒★",
		siteurl: "https://ryu-chan.vercel.app/",
		imgurl: "https://ryu-chan.vercel.app/profile.png",
		tags: ["Astro"],
		weight: 10,
		enabled: true,
	},
	{
		title: "Mizuki",
		desc: "下一代Material Design 3 博客主题(Astro驱动)",
		siteurl: "https://mizuki.mysqil.com/",
		imgurl: "https://mizuki.mysqil.com/_astro/avatar.DodcwRNI_ZrnMU5.webp",
		tags: ["Astro"],
		weight: 8,
		enabled: true,
	},
	{
		title: "Mizuki-Ultra",
		desc: "一个简约&功能丰富的 Astro 博客 主题",
		siteurl: "https://docs.mizuki.mysqil.com/",
		imgurl: "https://docs.mizuki.mysqil.com/favicon.png",
		tags: ["Docs"],
		weight: 8,
		enabled: true,
	},
	{
		title: "W3C技术联盟",
		desc: "让Web服务全人类",
		siteurl: "https://image.js.cn/",
		imgurl: "https://image.js.cn/logo.svg",
		tags: ["Astro"],
		weight: 8,
		enabled: true,
	},
	{
		title: "One",
		desc: "上海修车spa足浴推拿反差狂魔one哥",
		siteurl: "https://onedayxyy.cn/",
		imgurl:
			"https://img.onedayxyy.cn/images/Teek/Teekwebsite/xyy-logo.avif?w=150&h=150&fit=crop&fm=webp&q=80",
		tags: ["Blog"],
		weight: 8,
		enabled: true,
	},
	{
		title: "楠枝小笺",
		desc: "安安静静地存在，就已经很好了。",
		siteurl: "https://www.nannax.top/",
		imgurl:
			"https://www.nannax.top/upload/Image_1777700231866_594.jpg?width=800",
		tags: ["Astro"],
		weight: 8,
		enabled: true,
	},
	{
		title: "Yubendan",
		desc: "内心充盈者，独行也如众。",
		siteurl: "https://yubendan.com/",
		imgurl: "https://yubendan.com/_astro/avatar.DVGZ46-Q_1TAarN.webp",
		tags: ["Astro"],
		weight: 8,
		enabled: true,
	},
	{
		title: "versus0",
		desc: "技术+算法blog。",
		siteurl: "https://blog.542000.xyz",
		imgurl:
			"https://img.542000.xyz/file/friend_avatar/1778931720838_f167cb95af9d881f4378b92b3e181d89_4647054993754934443.jpg",
		tags: ["Astro"],
		weight: 8,
		enabled: true,
	},
	{
		title: "ZhiJing's Blog",
		desc: "Go with the flow.",
		siteurl: "https://iwexe.top",
		imgurl: "https://iwexe.top/avatar.svg",
		tags: ["Astro"],
		weight: 8,
		enabled: true,
	},
	{
		title: "十三",
		desc: "欲买桂花同载酒，终不似，少年游。",
		siteurl: "https://blog.nw177.cn",
		imgurl: "https://img.nw177.cn/blog/100.assets/avatar.webp",
		tags: ["Astro"],
		weight: 8,
		enabled: true,
	},
	{
		title: "星遐蝶梦",
		desc: "星穹漫遐，蝶携清梦。",
		siteurl: "https://blog.casto.top",
		imgurl: "https://blog.casto.top/_astro/avatar.BmbZMO2d_Z1ed0Se.webp",
		tags: ["Astro"],
		weight: 8,
		enabled: true,
	},
	{
		title: "团子和蛋糕",
		desc: "如果你喜欢那么欢迎来到我的世界！",
		siteurl: "https://blog.tsh520.cn",
		imgurl: "https://re.tsh520.cn/zl/tx.webp",
		tags: ["Astro"],
		weight: 0,
		enabled: true,
	},
	{
		title: "年华",
		desc: "分享生活和技术。",
		siteurl: "https://blog.520781.xyz",
		imgurl: "https://q1.qlogo.cn/g?b=qq&nk=1323860289&s=640",
		tags: ["Astro"],
		weight: 0,
		enabled: true,
	},
	{
		title: "THW's Blog",
		desc: "前途似海，来日方长",
		siteurl: "https://blog.tianhw.top",
		imgurl: "https://image.tianhw.top/avatar.webp",
		tags: ["Astro"],
		weight: 0,
		enabled: true,
	},
	{
		title: "番茄主理人",
		desc: "坐而言不如起而行.",
		siteurl: "https://fqzlr.com/",
		imgurl: "https://q1.qlogo.cn/g?b=qq&nk=20447289&s=640",
		tags: ["Astro"],
		weight: 0,
		enabled: true,
	},
	{
		title: "晓正杨博客",
		desc: "让代码更有价值，让学生生活不再枯燥",
		siteurl: "https://blog.7003410.xyz/",
		imgurl: "https://images.sy.fj.kg/logo.96adlmmyni.webp",
		tags: ["Astro"],
		weight: 0,
		enabled: true,
	},
	{
		title: "小王的博客",
		desc: "一个上了年纪的猿人.",
		siteurl: "https://www.huhaha.vip/",
		imgurl: "https://www.huhaha.vip/acatar.webp",
		tags: ["Astro"],
		weight: 0,
		enabled: true,
	},
	{
		title: "Sigrika-善良耙耙柑🍊",
		desc: "记录我的二次元之旅",
		siteurl: "https://qwq.sigrika.cc/",
		imgurl:
			"https://weavatar.com/avatar/bc0dba25ea5949e8290d012e081ceec669aa7784c7ad765173473c80cbaee404",
		tags: ["Astro"],
		weight: 0,
		enabled: true,
	},
	{
		title: "Nachcekoの小窝",
		desc: "1つの熱愛の2次元の小さい萌の新しい~ /.こんにちはnya~です",
		siteurl: "https://tbmiao.dpdns.org",
		imgurl: "https://avatars.githubusercontent.com/u/172878250?v=4",
		tags: ["Astro"],
		weight: 0,
		enabled: true,
	},
	{
		title: "Saimen Blog",
		desc: "读史可以明智,知古方能鉴今。",
		siteurl: "https://com.z2m.store",
		imgurl: "https://blog.z2m.store/_astro/xgg.rSbGMho9_Z1Y5OOT.webp",
		tags: ["Blog"],
		weight: 0,
		enabled: true,
	},
	{
		title: "新锐博客",
		desc: "记录学习与分享资源",
		siteurl: "https://blog.xrbk.cn",
		imgurl: "https://blog.xrbk.cn/favicon.png",
		tags: ["Blog"],
		weight: 0,
		enabled: true,
	},
	{
		title: "Eysnter",
		desc: "你好",
		siteurl: "https://blog.eysnter.cn/",
		imgurl: "https://img.eysnter.cn/file/posts/icon/1780993886377_0122.webp",
		tags: ["Astro"],
		weight: 0,
		enabled: true,
	},
	{
		title: "小生",
		desc: "天生我材必有用，千金散尽还复来。",
		siteurl: "https://www.zsso.cn",
		imgurl: "https://t.alcy.cc/tx",
		tags: ["Blog"],
		weight: 0,
		enabled: true,
	},
	{
		title: "mccsjs",
		desc: "点一盏灯，等待一个迷路的夜🍁",
		siteurl: "https://blog.seln.cn",
		imgurl: "https://blog.seln.cn/img/ico.jpg",
		tags: ["Blog"],
		weight: 0,
		enabled: true,
	},
	{
		title: "橘智",
		desc: "共享博客&深度思考",
		siteurl: "https://juzhiart.com",
		imgurl: "https://dataer-1257252871.cos.ap-shanghai.myqcloud.com/virtualUserIcon/logo.png",
		tags: ["Blog"],
		weight: 0,
		enabled: true,
	},
	{
		title: "顾拾柒",
		desc: "分享、实践、学习",
		siteurl: "https://blog.olinl.com",
		imgurl: "https://q2.qlogo.cn/headimg_dl?dst_uin=9892214&spec=0",
		tags: ["Blog"],
		weight: 0,
		enabled: true,
	},
	{
		title: "萌酷网",
		desc: "专属个人随笔博客，记录日常琐事、职场工作点滴、喜怒哀乐心情感悟，用文字留存平凡生活里的温柔与酷感习",
		siteurl: "https://www.moekuu.com",
		imgurl: "https://www.moekuu.com/content/uploadfile/202606/ad7b1781017552.jpg",
		tags: ["Blog"],
		weight: 0,
		enabled: true,
	},
	{
		title: "石猫博客",
		desc: "就叫石猫好啦...习",
		siteurl: "https://blog.imshimao.comm",
		imgurl: "https://img.cdn1.vip/i/6a1ad021e2d4c_1780142113.jpeg",
		tags: ["Blog"],
		weight: 0,
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
