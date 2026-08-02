// 侧边栏配置 schema（P0）
import type { ConfigDomainSchema } from "./types";

const WIDGET_TYPE_OPTIONS = [
	{ label: "个人资料", value: "profile" },
	{ label: "公告", value: "announcement" },
	{ label: "分类", value: "categories" },
	{ label: "标签", value: "tags" },
	{ label: "文章目录", value: "sidebarToc" },
	{ label: "广告", value: "advertisement" },
	{ label: "站点统计", value: "stats" },
	{ label: "站点信息", value: "siteInfo" },
	{ label: "站点日历", value: "calendar" },
	{ label: "音乐", value: "music" },
	{ label: "日程", value: "schedule" },
	{ label: "恋爱时光", value: "relationship" },
	{ label: "今日一言", value: "quoteOfTheDay" },
	{ label: "数据统计", value: "umamiStats" },
	{ label: "天气", value: "weather" },
	{ label: "最新动态", value: "dynamic" },
];

const POSITION_OPTIONS = [
	{ label: "顶部固定", value: "top" },
	{ label: "粘性定位", value: "sticky" },
];

const widgetItemSchema = [
	{
		key: "type",
		label: "组件类型",
		control: "select" as const,
		options: WIDGET_TYPE_OPTIONS,
	},
	{ key: "enable", label: "启用", control: "switch" as const },
	{
		key: "position",
		label: "位置",
		control: "select" as const,
		options: POSITION_OPTIONS,
		help: "移动端底部组件无此字段",
	},
	{
		key: "showOnPostPage",
		label: "文章页显示",
		control: "switch" as const,
	},
	{
		key: "showOnNonPostPage",
		label: "非文章页显示",
		control: "switch" as const,
	},
	{
		key: "configId",
		label: "配置 ID（广告）",
		control: "input" as const,
		placeholder: "ad1 / ad2",
	},
	{
		key: "responsive.collapseThreshold",
		label: "折叠阈值",
		control: "number" as const,
		min: 0,
		help: "分类/标签等组件折叠阈值",
	},
	{
		key: "responsive.showHeatmap",
		label: "显示热力图",
		control: "switch" as const,
		help: "仅日历组件",
	},
	{
			key: "specificConfig.dynamic.limit",
			label: "动态条数限制",
			control: "number" as const,
			min: 1,
			help: "仅动态组件",
		},
		{
			key: "specificConfig.siteInfo.unknownBuildPlatform",
			label: "未知构建平台文案",
			control: "input" as const,
			placeholder: "Unknown CI",
			help: "仅站点信息组件；识别失败时显示",
		},
];

const emptyWidget = {
	type: "profile",
	enable: true,
	position: "top",
	showOnPostPage: true,
};

export const sidebarSchema: ConfigDomainSchema = {
	domain: "sidebar",
	label: "侧边栏",
	group: "布局",
	hasForm: true,
	groups: [
		{
			label: "布局",
			fields: [
				{ key: "enable", label: "启用侧边栏", control: "switch" },
				{
					key: "position",
					label: "侧边栏位置",
					control: "select",
					options: [
						{ label: "仅左侧", value: "left" },
						{ label: "仅右侧", value: "right" },
						{ label: "双侧", value: "both" },
					],
				},
				{
					key: "tabletSidebar",
					label: "平板显示侧",
					control: "select",
					options: [
						{ label: "左侧", value: "left" },
						{ label: "右侧", value: "right" },
					],
					help: "双侧模式下平板端显示哪一侧",
				},
				{
					key: "hideSidebarOnPostPage",
					label: "文章页隐藏侧边栏",
					control: "switch",
				},
				{
					key: "showBothSidebarsOnPostPage",
					label: "文章页显示双侧",
					control: "switch",
					help: "单侧模式下，文章页是否临时显示双侧",
				},
			],
		},
		{
			label: "左侧组件",
			fields: [
				{
					key: "leftComponents",
					label: "左侧组件列表",
					control: "objectList",
					itemLabelKey: "type",
					emptyItem: emptyWidget,
					itemSchema: widgetItemSchema,
				},
			],
		},
		{
			label: "右侧组件",
			fields: [
				{
					key: "rightComponents",
					label: "右侧组件列表",
					control: "objectList",
					itemLabelKey: "type",
					emptyItem: emptyWidget,
					itemSchema: widgetItemSchema,
				},
			],
		},
		{
			label: "移动端底部组件",
			fields: [
				{
					key: "mobileBottomComponents",
					label: "移动端组件列表",
					control: "objectList",
					itemLabelKey: "type",
					emptyItem: {
						type: "profile",
						enable: true,
						showOnPostPage: true,
					},
					itemSchema: widgetItemSchema.filter((f) => f.key !== "position"),
				},
			],
		},
	],
};
