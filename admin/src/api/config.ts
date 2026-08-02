// 站点配置读写 API（Git 通道，Cloud Functions）
// GET /api/config：并行聚合 22 个 settings/*.json
// PUT /api/config：批量写回 N 个域到同一个 commit 并 push（约 3-5 分钟生效）
import { apiClient } from "./client";

// 与后端 DOMAINS 白名单一致（cloud-functions/api/config/index.js）
export type ConfigDomain =
	| "site"
	| "sidebar"
	| "wallpaper"
	| "music"
	| "pio"
	| "effects"
	| "announcement"
	| "comment"
	| "cover"
	| "profile"
	| "sponsor"
	| "license"
	| "footer"
	| "friends-page"
	| "relationship"
	| "expressive-code"
	| "mermaid"
	| "plantuml"
	| "ad"
	| "dynamic"
	| "gallery"
	| "font";

export const CONFIG_DOMAIN_LABELS: Record<ConfigDomain, string> = {
	site: "站点",
	sidebar: "侧边栏",
	wallpaper: "壁纸",
	music: "音乐播放器",
	pio: "看板娘",
	effects: "樱花特效",
	announcement: "公告",
	comment: "评论",
	cover: "封面图",
	profile: "个人资料",
	sponsor: "赞助",
	license: "许可证",
	footer: "页脚",
	"friends-page": "友链页面",
	relationship: "恋爱计时",
	"expressive-code": "代码高亮",
	mermaid: "Mermaid",
	plantuml: "PlantUML",
	ad: "广告",
	dynamic: "动态页",
	gallery: "相册",
	font: "字体",
};

// 全部 22 个域（与后端白名单顺序无关，前端按分组排序）
export const ALL_CONFIG_DOMAINS = Object.keys(
	CONFIG_DOMAIN_LABELS,
) as ConfigDomain[];

// GET 返回：domains 为 { [domain]: object | null }，单域失败为 null 并附 errors
export interface ConfigGetResult {
	domains: Partial<Record<ConfigDomain, Record<string, unknown> | null>>;
	errors?: Partial<Record<ConfigDomain, string>>;
}

// PUT 返回
export interface ConfigSaveResult {
	ok: true;
	domains: ConfigDomain[];
	commit: string;
	branch: string;
}

export const configApi = {
	get: () => apiClient.get<ConfigGetResult>("/api/config"),
	save: (
		changes: Partial<Record<ConfigDomain, Record<string, unknown>>>,
		commitMessage?: string,
	) =>
		apiClient.put<ConfigSaveResult>("/api/config", {
			changes,
			commitMessage,
		}),
};
