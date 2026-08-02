// 配置中心 schema 类型定义（方案 5.4）
// 手工维护：label/help 迁自 src/config/*.ts 与 types/config.ts 注释

export type ConfigControl =
	| "switch"
	| "input"
	| "textarea"
	| "number"
	| "slider"
	| "select"
	| "tags"
	| "imageUrl"
	| "objectList"
	| "json";

export interface ConfigFieldSchema {
	/** 支持点路径，如 "themeColor.hue" */
	key: string;
	/** 中文标签 */
	label: string;
	/** 说明文案 */
	help?: string;
	control: ConfigControl;
	/** select 选项（Semi Select 的 value 仅支持 string | number） */
	options?: { label: string; value: string | number }[];
	/** number/slider 用 */
	min?: number;
	max?: number;
	step?: number;
	/** 危险项二次确认警示文案（保存时汇总展示） */
	danger?: string;
	/** objectList 的行内字段 */
	itemSchema?: ConfigFieldSchema[];
	/** objectList 空行工厂默认值（JSON 可序列化） */
	emptyItem?: Record<string, unknown>;
	/** objectList 行摘要字段（列表展示用，默认取第一个 string 字段） */
	itemLabelKey?: string;
	/** 占位符 */
	placeholder?: string;
	/** textarea 最小行数 */
	rows?: number;
}

export interface ConfigGroupSchema {
	label: string;
	/** 组级说明（如公告 KV 兜底提示） */
	help?: string;
	fields: ConfigFieldSchema[];
}

export interface ConfigDomainSchema {
	domain: string;
	label: string;
	/** 分组排序用：站点 / 布局 / 功能 / 内容 / 外观 / 开发者 */
	group: string;
	/** 是否已提供可视化表单（false 时仅 JSON 模式） */
	hasForm: boolean;
	groups: ConfigGroupSchema[];
}
