// 站点开关读写 API：走 Edge Functions + KV（秒级生效，无需 git 构建）
// 与后端 edge-functions/api/site-flags/index.js 数据模型保持一致
import { apiClient } from "./client";

// 站点开关配置
export interface SiteFlags {
	// 是否禁用动态数据快照展示。
	// true=5 类动态数据首屏不读构建期快照、只靠运行时 fetch（消除闪烁，丢 SEO 可接受）；
	// false=保持现状（快照 + 运行时覆盖）。
	snapshotDisabled: boolean;
}

export const flagsApi = {
	get: () => apiClient.get<SiteFlags>("/api/site-flags"),
	save: (data: SiteFlags) =>
		apiClient.put<{ ok: true; config: SiteFlags }>("/api/site-flags", data),
};
