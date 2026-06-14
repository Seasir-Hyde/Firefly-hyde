import {
	type NavBarConfig,
	type NavBarLink,
	type NavBarSearchConfig,
	NavBarSearchMethod,
} from "../types/navBarConfig";

// ============================================================================
// 导航栏配置 - 根据顺序动态生成导航栏链接
// NavBar Configuration - Dynamically generate navigation bar links based on order
// ============================================================================
const getDynamicNavBarConfig = (): NavBarConfig => {
	// 基础导航栏链接
	const links: NavBarLink[] = [
		// 主页
		LinkPresets.Home,
	];

	// 文章及其子菜单
	links.push({
		name: "文章",
		url: "#",
		icon: "material-symbols:article",
		children: [
			// 归档
			LinkPresets.Archive,

			// 分类
			LinkPresets.Categories,

			// 标签
			LinkPresets.Tags,
		],
	});

	// 友链
	links.push(LinkPresets.Friends);

	// 留言板
	links.push(LinkPresets.Guestbook);

	// 我的及其子菜单
	links.push({
		name: "我的",
		url: "#",
		icon: "material-symbols:person",
		children: [
			// 相册
			LinkPresets.Gallery,

			// 番组计划
			LinkPresets.Bangumi,

			// 设备
			LinkPresets.Devices,

			// 日记
			LinkPresets.Diary,

			// 音乐
			LinkPresets.Music,
		],
	});

	// 关于及其子菜单
	links.push({
		name: "更多",
		url: "/content/",
		icon: "material-symbols:info",
		children: [
			// 赞助
			LinkPresets.Sponsor,

			// 关于页面
			LinkPresets.About,
		],
	});

	// 关于及其子菜单
	links.push({
		name: "其他",
		url: "/other/",
		icon: "material-symbols:more-horiz",
		children: [
			// 项目
			LinkPresets.Projects,

			// 时间线
			LinkPresets.Timeline,

			// 技能
			LinkPresets.Skills,

			{
				name: "统计",
				url: "https://umami.seasir.top/share/cp5SqrNUOxbulLZt/seasir.top",
				external: true,
				icon: "fa7-solid:chart-simple",
			},
		],
	});

	// 自定义导航栏链接
	links.push({
		name: "链接",
		url: "#",
		icon: "material-symbols:link",
		// 子菜单
		children: [
			{
				name: "GitHub",
				url: "https://github.com/Seasir-Hyde",
				external: true,
				icon: "fa7-brands:github",
			},
			{
				name: "Gitee",
				url: "https://gitee.com/SeasirHyde",
				external: true,
				icon: "fa7-brands:gitee",
			},
			{
				name: "CNB",
				url: "https://cnb.cool/W3C/Hyde/Firefly-hyde",
				external: true,
				icon: "tdesign:logo-cnb-filled",
			},
			{
				name: "个人主页",
				url: "https://home.seasir.top/",
				external: true,
				icon: "material-symbols:page-footer-outline",
			},
			// {
			// 	name: "QQ交流群",
			// 	url: "https://qq.com",
			// 	external: true,
			// 	icon: "fa7-brands:qq",
			// },
		],
	});

	// 自定义导航栏链接示例2：带子菜单（混用预设链接）
	// links.push({
	// 	name: "链接",
	// 	url: "/links/",
	// 	icon: "material-symbols:link",

	// 	// 子菜单
	// 	children: [
	// 		{
	// 			name: "GitHub",
	// 			url: "https://github.com/CuteLeaf/Firefly",
	// 			external: true,
	// 			icon: "fa7-brands:github",
	// 		},
	// 		{
	// 			name: "Bilibili",
	// 			url: "https://space.bilibili.com/38932988",
	// 			external: true,
	// 			icon: "fa7-brands:bilibili",
	// 		},
	// 		LinkPreset.Friends,
	// 	],
	// });

	// 仅返回链接，其它导航搜索相关配置在模块顶层常量中独立导出
	return { links } as NavBarConfig;
};

// 导航搜索配置
export const navBarSearchConfig: NavBarSearchConfig = {
	method: NavBarSearchMethod.PageFind,
};

// ============================================================================
// 链接预设 - 可自由自定义导航栏链接的名称、图标和URL
// Link Presets - Allows free customization of the name, icon, and URL of navigation bar links
// ============================================================================
export const LinkPresets: Record<string, NavBarLink> = {
	Home: {
		name: "主页",
		url: "/",
		icon: "material-symbols:home",
	},
	Archive: {
		name: "归档",
		url: "/archive/",
		icon: "material-symbols:archive",
	},
	Categories: {
		name: "分类",
		url: "/categories/",
		icon: "material-symbols:folder-open-rounded",
	},
	Tags: {
		name: "标签",
		url: "/tags/",
		icon: "material-symbols:label",
	},
	Friends: {
		name: "友链",
		url: "/friends/",
		icon: "material-symbols:group",
	},
	Sponsor: {
		name: "赞助",
		url: "/sponsor/",
		icon: "material-symbols:favorite",
	},
	Guestbook: {
		name: "留言",
		url: "/guestbook/",
		icon: "material-symbols:chat",
	},
	About: {
		name: "关于我",
		url: "/about/",
		icon: "material-symbols:person",
	},
	Bangumi: {
		name: "番组计划",
		url: "/bangumi/",
		icon: "material-symbols:movie",
	},
	Gallery: {
		name: "相册",
		url: "/gallery/",
		icon: "material-symbols:photo-library",
	},
	Devices: {
		name: "设备",
		url: "/devices/",
		icon: "material-symbols:devices",
	},
	Diary: {
		name: "日记",
		url: "/diary/",
		icon: "material-symbols:book",
	},
	Projects: {
		name: "项目",
		url: "/projects/",
		icon: "material-symbols:work",
	},
	Skills: {
		name: "技能",
		url: "/skills/",
		icon: "material-symbols:psychology",
	},
	Timeline: {
		name: "时间线",
		url: "/timeline/",
		icon: "material-symbols:timeline",
	},
	Music: {
		name: "音乐",
		url: "/music/",
		icon: "material-symbols:music-note-rounded",
	},
};

export const navBarConfig: NavBarConfig = getDynamicNavBarConfig();
