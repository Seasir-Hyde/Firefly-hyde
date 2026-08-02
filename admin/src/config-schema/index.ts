// 配置域 schema 注册表：P0+P1+P2 全部表单化（JSON 模式全域仍可用）
import { adSchema } from "./ad";
import { announcementSchema } from "./announcement";
import { commentSchema } from "./comment";
import { coverSchema } from "./cover";
import { dynamicSchema } from "./dynamic";
import { effectsSchema } from "./effects";
import { expressiveCodeSchema } from "./expressive-code";
import { fontSchema } from "./font";
import { footerSchema } from "./footer";
import { friendsPageSchema } from "./friends-page";
import { gallerySchema } from "./gallery";
import { licenseSchema } from "./license";
import { mermaidSchema } from "./mermaid";
import { musicSchema } from "./music";
import { pioSchema } from "./pio";
import { plantumlSchema } from "./plantuml";
import { profileSchema } from "./profile";
import { relationshipSchema } from "./relationship";
import { sidebarSchema } from "./sidebar";
import { siteSchema } from "./site";
import { sponsorSchema } from "./sponsor";
import { wallpaperSchema } from "./wallpaper";
import type { ConfigDomainSchema } from "./types";

export type { ConfigDomainSchema, ConfigFieldSchema, ConfigGroupSchema } from "./types";

// 分组顺序（左侧导航）
const GROUP_ORDER = ["站点", "布局", "功能", "内容", "外观", "开发者"] as const;

// P0 + P1 + P2 全部有表单
const FORM_SCHEMAS: ConfigDomainSchema[] = [
	// P0
	siteSchema,
	sidebarSchema,
	musicSchema,
	pioSchema,
	effectsSchema,
	announcementSchema,
	commentSchema,
	// P1
	wallpaperSchema,
	coverSchema,
	profileSchema,
	sponsorSchema,
	licenseSchema,
	footerSchema,
	friendsPageSchema,
	relationshipSchema,
	// P2
	expressiveCodeSchema,
	mermaidSchema,
	plantumlSchema,
	adSchema,
	dynamicSchema,
	gallerySchema,
	fontSchema,
];

// 按分组顺序 + 组内保持 FORM_SCHEMAS 相对顺序
export const DOMAIN_SCHEMAS: ConfigDomainSchema[] = [...FORM_SCHEMAS].sort(
	(a, b) => {
		const ga = GROUP_ORDER.indexOf(a.group as (typeof GROUP_ORDER)[number]);
		const gb = GROUP_ORDER.indexOf(b.group as (typeof GROUP_ORDER)[number]);
		const ia = ga === -1 ? 99 : ga;
		const ib = gb === -1 ? 99 : gb;
		if (ia !== ib) return ia - ib;
		return FORM_SCHEMAS.indexOf(a) - FORM_SCHEMAS.indexOf(b);
	},
);

export const SCHEMA_BY_DOMAIN = Object.fromEntries(
	DOMAIN_SCHEMAS.map((s) => [s.domain, s]),
) as Record<string, ConfigDomainSchema>;

// 按 GROUP_ORDER 分组（侧栏二级 + 页内 Tabs 共用）
export function getSchemasByGroup(): Map<string, ConfigDomainSchema[]> {
	const map = new Map<string, ConfigDomainSchema[]>();
	for (const g of GROUP_ORDER) map.set(g, []);
	for (const s of DOMAIN_SCHEMAS) {
		const list = map.get(s.group) ?? [];
		list.push(s);
		map.set(s.group, list);
	}
	return map;
}

export function isConfigGroup(name: string): name is (typeof GROUP_ORDER)[number] {
	return (GROUP_ORDER as readonly string[]).includes(name);
}

export { GROUP_ORDER };
