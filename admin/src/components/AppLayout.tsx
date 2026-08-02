// 主布局:顶部栏 + 左侧导航 + 内容区
// 参考 Semi Design Layout + Nav 的「侧边导航」示例
// 移动端(<768px):Sider 隐藏,Header 加汉堡按钮,导航走 SideSheet 抽屉
// 「博客配置」为可展开一级 + 六个分组二级（GROUP_ORDER），深链 /site-config/:group
import {
	IconArticle,
	IconBell,
	IconBranch,
	IconComment,
	IconConfigStroked,
	IconDesktop,
	IconExit,
	IconFile,
	IconFolder,
	IconMapPinStroked,
	IconMenu,
	IconMoon,
	IconQuote,
	IconSetting,
	IconSun,
} from "@douyinfe/semi-icons";
import {
	Avatar,
	Button,
	Layout,
	Nav,
	SideSheet,
	Toast,
} from "@douyinfe/semi-ui";
import type { ReactNode } from "react";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { GROUP_ORDER } from "@/config-schema";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
	getConfigDirtyDomains,
	subscribeConfigDirty,
} from "@/pages/siteConfigDirtyStore";
import { useAuth } from "@/providers/AuthProvider";

const { Header, Sider, Content } = Layout;

// 博客配置侧栏一级 key（Sub 展开用；点它导航到默认分组）
const SITE_CONFIG_NAV_KEY = "/site-config";
const SITE_CONFIG_OPEN_STORAGE = "admin.site-config.nav-open";

// domain → group 映射（与 DOMAIN_SCHEMAS 各 schema.group 一致，侧栏 dirty 橙点用）
const DOMAIN_GROUP: Record<string, string> = {
	site: "站点",
	sidebar: "布局",
	music: "功能",
	pio: "功能",
	effects: "功能",
	comment: "功能",
	announcement: "内容",
	profile: "内容",
	sponsor: "内容",
	license: "内容",
	footer: "内容",
	"friends-page": "内容",
	relationship: "内容",
	ad: "内容",
	dynamic: "内容",
	gallery: "内容",
	wallpaper: "外观",
	cover: "外观",
	font: "外观",
	"expressive-code": "开发者",
	mermaid: "开发者",
	plantuml: "开发者",
};

type NavLeaf = { itemKey: string; text: ReactNode; icon?: ReactNode };
type NavNode = NavLeaf & { items?: NavLeaf[] };

function computeDirtyGroups(domains: string[]): Set<string> {
	const set = new Set<string>();
	for (const d of domains) {
		const g = DOMAIN_GROUP[d];
		if (g) set.add(g);
	}
	return set;
}

function buildNavItems(dirtyGroups: Set<string>): NavNode[] {
	const groupItems: NavLeaf[] = GROUP_ORDER.map((g) => ({
		itemKey: `${SITE_CONFIG_NAV_KEY}/${encodeURIComponent(g)}`,
		// 分组 dirty 时文案后加橙点（Semi text 支持 ReactNode）
		text: dirtyGroups.has(g) ? (
			<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
				{g}
				<span
					aria-label="有未保存修改"
					style={{
						width: 6,
						height: 6,
						borderRadius: "50%",
						backgroundColor: "var(--semi-color-warning)",
						flexShrink: 0,
					}}
				/>
			</span>
		) : (
			g
		),
	}));

	return [
		{ itemKey: "/dashboard", text: "仪表盘", icon: <IconDesktop /> },
		{ itemKey: "/posts", text: "文章管理", icon: <IconArticle /> },
		{ itemKey: "/moments", text: "说说", icon: <IconComment /> },
		{ itemKey: "/places", text: "足迹", icon: <IconMapPinStroked /> },
		{ itemKey: "/announcements", text: "公告", icon: <IconBell /> },
		{ itemKey: "/quotes", text: "每日一言", icon: <IconQuote /> },
		{ itemKey: "/data", text: "资料数据", icon: <IconFolder /> },
		{ itemKey: "/pages", text: "页面内容", icon: <IconFile /> },
		{
			itemKey: SITE_CONFIG_NAV_KEY,
			text: "博客配置",
			icon: <IconConfigStroked />,
			items: groupItems,
		},
		{ itemKey: "/builds", text: "构建记录", icon: <IconBranch /> },
		{ itemKey: "/settings", text: "系统设置", icon: <IconSetting /> },
	];
}

// 从 pathname 解析当前配置分组（HashRouter 下 location.pathname 不含 #）
function parseSiteConfigGroup(pathname: string): string | null {
	if (!pathname.startsWith(`${SITE_CONFIG_NAV_KEY}/`)) return null;
	const rest = pathname.slice(SITE_CONFIG_NAV_KEY.length + 1);
	const groupSeg = rest.split("/")[0] ?? "";
	if (!groupSeg) return null;
	try {
		return decodeURIComponent(groupSeg);
	} catch {
		return groupSeg;
	}
}

export function AppLayout() {
	const navigate = useNavigate();
	const location = useLocation();
	const { session, logout } = useAuth();
	const isMobile = useIsMobile();
	// 移动端抽屉导航开关(桌面不渲染抽屉,该状态无效)
	const [navOpen, setNavOpen] = useState(false);
	const [dark, setDark] = useState(
		() => document.body.getAttribute("theme-mode") === "dark",
	);
	// 内容区滚动容器:sticky 吸顶的滚动参照。路由切换时手动归零
	// (react-router 默认只重置 window 滚动,不重置自定义滚动容器,
	// 否则从 A 页滚到底再跳 B 页,B 页一进来就处于吸顶状态、内容从中间显示)
	const contentRef = useRef<HTMLDivElement>(null);

	// 配置中心 dirty 域 → 分组橙点
	const dirtyDomains = useSyncExternalStore(
		subscribeConfigDirty,
		getConfigDirtyDomains,
		getConfigDirtyDomains,
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: location.pathname 是刻意的触发器——路由切换时滚动归零，移除会破坏吸顶复位
	useEffect(() => {
		contentRef.current?.scrollTo({ top: 0 });
		// 路由切换后兜底关闭移动端抽屉(主关闭路径在 Nav 的 onClick)
		setNavOpen(false);
	}, [location.pathname]);

	const selectedKeys = useMemo(() => {
		const path = location.pathname;
		// 配置中心：高亮具体分组二级项
		const group = parseSiteConfigGroup(path);
		if (group) {
			return [`${SITE_CONFIG_NAV_KEY}/${encodeURIComponent(group)}`];
		}
		if (path === SITE_CONFIG_NAV_KEY) {
			// 仅 /site-config 时落到默认分组「站点」高亮
			return [`${SITE_CONFIG_NAV_KEY}/${encodeURIComponent("站点")}`];
		}
		// 用「前缀最长匹配」定位当前选中项,兼容子路径场景（文章编辑等）
		const flatKeys = [
			"/dashboard",
			"/posts",
			"/moments",
			"/places",
			"/announcements",
			"/quotes",
			"/data",
			"/pages",
			"/builds",
			"/settings",
		];
		const matched = flatKeys
			.filter((k) => path === k || path.startsWith(`${k}/`))
			.sort((a, b) => b.length - a.length);
		return matched.length > 0 ? [matched[0]] : ["/dashboard"];
	}, [location.pathname]);

	// 展开态：记住 localStorage；进入配置中心路径时自动展开
	const [openKeys, setOpenKeys] = useState<string[]>(() => {
		try {
			const saved = localStorage.getItem(SITE_CONFIG_OPEN_STORAGE);
			if (saved === "1") return [SITE_CONFIG_NAV_KEY];
			if (saved === "0") return [];
		} catch {
			// ignore
		}
		return [];
	});

	// 进入配置中心时自动展开一级
	useEffect(() => {
		if (
			location.pathname === SITE_CONFIG_NAV_KEY ||
			location.pathname.startsWith(`${SITE_CONFIG_NAV_KEY}/`)
		) {
			setOpenKeys((prev) =>
				prev.includes(SITE_CONFIG_NAV_KEY)
					? prev
					: [...prev, SITE_CONFIG_NAV_KEY],
			);
		}
	}, [location.pathname]);

	const handleOpenChange = useCallback(
		(data: { openKeys?: (string | number)[] }) => {
			const keys = (data.openKeys ?? []).map(String);
			setOpenKeys(keys);
			try {
				localStorage.setItem(
					SITE_CONFIG_OPEN_STORAGE,
					keys.includes(SITE_CONFIG_NAV_KEY) ? "1" : "0",
				);
			} catch {
				// ignore
			}
		},
		[],
	);

	const toggleTheme = useCallback(() => {
		// Semi 官方切换方式:body 上 theme-mode 属性,CSS 变量自动生效
		const body = document.body;
		if (body.hasAttribute("theme-mode")) {
			body.removeAttribute("theme-mode");
			setDark(false);
		} else {
			body.setAttribute("theme-mode", "dark");
			setDark(true);
		}
	}, []);

	const handleLogout = useCallback(async () => {
		// AuthProvider.logout 内部已 try/finally 兜底,失败也会清 session
		await logout();
		Toast.success("已退出登录");
		navigate("/login", { replace: true });
	}, [logout, navigate]);

	const handleSelect = useCallback(
		({ itemKey }: { itemKey: string | number }) => {
			const key = String(itemKey);
			// 点一级「博客配置」：
			// - 桌面：导航到默认分组（pathname effect 会顺带展开）
			// - 移动端：不导航，交给 onOpenChange 只做展开/收起；
			//   若这里 navigate，pathname effect 会立刻关抽屉，二级分组看不见
			if (key === SITE_CONFIG_NAV_KEY) {
				if (isMobile) return;
				navigate(`${SITE_CONFIG_NAV_KEY}/${encodeURIComponent("站点")}`);
				return;
			}
			navigate(key);
		},
		[navigate, isMobile],
	);

	const navItems = useMemo(
		() => buildNavItems(computeDirtyGroups(dirtyDomains)),
		[dirtyDomains],
	);

	return (
		// 高度用 .app-root-layout(global.css):100vh 兜底 + 支持时 100dvh 随移动端地址栏伸缩
		<Layout className="app-root-layout">
			{!isMobile && (
				<Sider style={{ backgroundColor: "var(--semi-color-bg-1)" }}>
					<Nav
						style={{ height: "100%" }}
						items={navItems}
						selectedKeys={selectedKeys}
						openKeys={openKeys}
						onOpenChange={handleOpenChange}
						header={{ text: "Firefly 管理后台" }}
						footer={{ collapseButton: true }}
						onSelect={handleSelect}
					/>
				</Sider>
			)}
			<Layout
				style={{
					// 桌面靠 has-sider 的 row+stretch 把内层 Layout 锁在 100dvh；
					// 移动端无 Sider，外层是 column，内层 Layout 的 min-height:auto 会让它
					// 随内容增长、滚动容器 height:100% 失去参照 → 整页用 body 滚动、Header 跟着滚走。
					// 显式 height:100% + min-height:0 把内层 Layout 锁死在 100dvh 内，
					// Header 固定、Content 内部 div 滚动才成立。桌面加这行无害（本就撑满）。
					height: "100%",
					minHeight: 0,
				}}
			>
				<Header
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: isMobile ? "space-between" : "flex-end",
						padding: isMobile ? "12px 16px" : "12px 24px",
						gap: 12,
						backgroundColor: "var(--semi-color-bg-1)",
						borderBottom: "1px solid var(--semi-color-border)",
					}}
				>
					{isMobile ? (
						<Button
							theme="borderless"
							type="tertiary"
							icon={<IconMenu />}
							onClick={() => setNavOpen(true)}
							aria-label="打开导航"
						/>
					) : null}
					<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
						<Button
							theme="borderless"
							type="tertiary"
							icon={dark ? <IconSun /> : <IconMoon />}
							onClick={toggleTheme}
							aria-label="切换主题"
						/>
						<Avatar size="extra-small" color="light-blue">
							{session?.username?.[0]?.toUpperCase() ?? "U"}
						</Avatar>
						{isMobile ? null : (
							<span style={{ color: "var(--semi-color-text-1)" }}>
								{session?.username ?? ""}
							</span>
						)}
						<Button
							theme="borderless"
							type="tertiary"
							icon={<IconExit />}
							onClick={handleLogout}
							aria-label="退出登录"
						>
							{isMobile ? null : "退出"}
						</Button>
					</div>
				</Header>
				<Content
					style={{
						// Content 是 class 组件不支持 ref 转发,故滚动容器用内部 div 承载;
						// Content 自身不设 overflow,padding 已移至各页面根 div
						overflow: "hidden",
						backgroundColor: "var(--semi-color-bg-0)",
					}}
				>
					{/* 滚动容器:sticky 吸顶的滚动参照。路由切换时手动归零
					    (react-router 默认只重置 window 滚动,不重置自定义滚动容器) */}
					<div ref={contentRef} style={{ height: "100%", overflow: "auto" }}>
						<Outlet />
					</div>
				</Content>
			</Layout>

			{/* 移动端抽屉导航:复用 navItems 与 selectedKeys,高亮与桌面天然同步。
				    关抽屉：Nav onClick 对叶子项关闭；一级「博客配置」展开/收起不关。
				    另有路由切换 effect 兜底 + SideSheet 自带遮罩/X/Esc 三条退出路径 */}
			{isMobile ? (
				<SideSheet
					placement="left"
					width={280}
					visible={navOpen}
					onCancel={() => setNavOpen(false)}
					title="Firefly 管理后台"
					bodyStyle={{ padding: 0 }}
				>
					<Nav
						style={{ width: "100%", height: "100%" }}
						items={navItems}
						selectedKeys={selectedKeys}
						openKeys={openKeys}
						onOpenChange={handleOpenChange}
						onSelect={handleSelect}
						onClick={({ itemKey }) => {
							// 一级「博客配置」只展开/收起，关抽屉会打断选二级分组
							if (String(itemKey) === SITE_CONFIG_NAV_KEY) return;
							setNavOpen(false);
						}}
					/>
				</SideSheet>
			) : null}
		</Layout>
	);
}
