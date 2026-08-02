// 资料数据（友链/项目/设备/技能/时间线）API 封装
// 走 Git 通道（Cloud Functions）：GET 读 CNB main 上的 src/data/<name>.json（push 后即刻可读），
// PUT 把整个数组/对象写回并 git push（触发 CNB 流水线重建，约 3-5 分钟生效）。
// 与后端 cloud-functions/api/data/[name].js 白名单保持一致。
import { apiClient } from "./client";

// ---------- 数据模型（与博客侧类型对齐） ----------

// 友链（对齐 src/types/config.ts FriendLink / src/data/friends.json）
export interface FriendLink {
	title: string;
	imgurl: string;
	desc: string;
	siteurl: string;
	tags?: string[];
	weight: number;
	enabled: boolean;
}

// 项目（对齐 src/data/projects.ts Project）
export interface Project {
	id: string;
	title: string;
	description: string;
	image: string;
	category: "web" | "mobile" | "desktop" | "other";
	techStack: string[];
	status: "completed" | "in-progress" | "planned";
	liveDemo?: string;
	sourceCode?: string;
	visitUrl?: string;
	startDate: string;
	endDate?: string;
	featured?: boolean;
	tags?: string[];
	showImage?: boolean;
}

// 设备（对齐 src/data/devices.ts Device）
export interface Device {
	name: string;
	image: string;
	specs: string;
	description: string;
	link: string;
	price?: string;
}

// 设备原始存储结构：类别 → 设备数组（嵌套）
export type DeviceCategory = Record<string, Device[]>;

// 技能（对齐 src/data/skills.ts Skill）
export interface Skill {
	id: string;
	name: string;
	description: string;
	icon: string;
	category: "frontend" | "backend" | "database" | "tools" | "other";
	level: "beginner" | "intermediate" | "advanced" | "expert";
	experience: {
		years: number;
		months: number;
	};
	projects?: string[];
	certifications?: string[];
	color?: string;
}

// 时间线链接（对齐 src/components/features/timeline/types.ts）
export interface TimelineLink {
	name: string;
	url: string;
	type: "website" | "certificate" | "project" | "other";
}

// 时间线（对齐 src/components/features/timeline/types.ts TimelineItem）
export interface TimelineItem {
	id: string;
	title: string;
	description: string;
	type: "education" | "work" | "project" | "achievement";
	startDate: string;
	endDate?: string;
	location?: string;
	organization?: string;
	position?: string;
	skills?: string[];
	achievements?: string[];
	links?: TimelineLink[];
	icon?: string;
	color?: string;
	featured?: boolean;
}

// 白名单内的资料数据类型名（与后端 ALLOWED_NAMES 一致）
export type DataName =
	| "friends"
	| "projects"
	| "devices"
	| "skills"
	| "timeline";

// GET 返回体：{ name, data }（data 为对应 JSON 的原始内容）
export interface DataGetResult<T = unknown> {
	name: DataName;
	data: T;
}

// PUT 返回体
export interface DataSaveResult {
	ok: true;
	name: DataName;
	commit: string;
	branch: string;
}

export const dataApi = {
	// 读某类资料数据（friends/projects/skills/timeline 是数组，devices 是嵌套对象）
	get: <T = unknown>(name: DataName) =>
		apiClient.get<DataGetResult<T>>(`/api/data/${name}`),
	// 整体写回并触发构建
	save: <T = unknown>(name: DataName, data: T, commitMessage?: string) =>
		apiClient.put<DataSaveResult>(`/api/data/${name}`, { data, commitMessage }),
};
