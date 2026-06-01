import {
	LinkPreset,
	type NavBarConfig,
	type NavBarLink,
	type NavBarSearchConfig,
	NavBarSearchMethod,
} from "../types/config";
import { siteConfig } from "./siteConfig";

// 根据页面开关动态生成导航栏配置
const getDynamicNavBarConfig = (): NavBarConfig => {
	// 基础导航栏链接
	const links: (NavBarLink | LinkPreset)[] = [
		// 主页
		LinkPreset.Home,

		// 归档
		LinkPreset.Archive,
	];

	// 根据配置决定是否添加友链，在siteConfig关闭pages.friends时导航栏不显示友链
	if (siteConfig.pages.friends) {
		links.push(LinkPreset.Friends);
	}

	// 根据配置决定是否添加留言板，在siteConfig关闭pages.guestbook时导航栏不显示留言板
	if (siteConfig.pages.guestbook) {
		links.push(LinkPreset.Guestbook);
	}

	// 我的及其子菜单
	links.push({
		name: "我的",
		url: "/my/",
		icon: "material-symbols:person",
		children: [
			// 根据配置决定是否添加番组计划，在siteConfig关闭pages.bangumi时导航栏不显示番组计划
			...(siteConfig.pages.bangumi ? [LinkPreset.Bangumi] : []),

			// 根据配置决定是否添加设备，在siteConfig关闭pages.devices时导航栏不显示设备
			...(siteConfig.pages.devices ? [LinkPreset.Devices] : []),

			// 根据配置决定是否添加相册，在siteConfig关闭pages.gallery时导航栏不显示相册
			...(siteConfig.pages.gallery ? [LinkPreset.Gallery] : []),

			// 根据配置决定是否添加日记，在siteConfig关闭pages.diary时导航栏不显示日记
			...(siteConfig.pages.diary ? [LinkPreset.Diary] : []),
		],
	});

	// 关于及其子菜单
	links.push({
		name: "更多",
		url: "/content/",
		icon: "material-symbols:info",
		children: [
			// 根据配置决定是否添加赞助，在siteConfig关闭pages.sponsor时导航栏不显示赞助
			...(siteConfig.pages.sponsor ? [LinkPreset.Sponsor] : []),

			// 关于页面
			LinkPreset.About,
		],
	});

	// 其他及其子菜单
	links.push({
		name: "其他",
		url: "/other/",
		icon: "material-symbols:more-horiz",
		children: [
			// 根据配置决定是否添加项目，在siteConfig关闭pages.projects时导航栏不显示项目
			...(siteConfig.pages.projects ? [LinkPreset.Projects] : []),

			// 根据配置决定是否添加时间线，在siteConfig关闭pages.timeline时导航栏不显示时间线
			...(siteConfig.pages.timeline ? [LinkPreset.Timeline] : []),

			// 根据配置决定是否添加技能，在siteConfig关闭pages.skills时导航栏不显示技能
			...(siteConfig.pages.skills ? [LinkPreset.Skills] : []),

			{
				name: "统计",
				url: "https://umami.seasir.top/share/cp5SqrNUOxbulLZt/seasir.top",
				external: true,
				icon: "fa7-solid:chart-simple",
			},
		],
	});

	// 自定义导航栏链接,并且支持多级菜单
	links.push({
		name: "链接",
		url: "/links/",
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
				name: "Cnb",
				url: "https://cnb.cool/u/SeasirHyde",
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

export const navBarConfig: NavBarConfig = getDynamicNavBarConfig();
