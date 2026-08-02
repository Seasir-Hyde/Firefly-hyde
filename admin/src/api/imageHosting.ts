// 图床（七牛云）API 封装：走 Edge Functions + KV（路径 A，配置秒级生效）
// 与后端 edge-functions/api/image/config.js 数据模型保持一致
import { apiClient } from "./client";

// 七牛存储区域代号（与后端 REGIONS 白名单一致）
export type QiniuRegion = "z0" | "z1" | "z2" | "na0" | "as0";

// 区域选项（配置页 Select 用）：代号 → 展示名
export const REGION_OPTIONS: { value: QiniuRegion; label: string }[] = [
	{ value: "z0", label: "华东-浙江 (z0)" },
	{ value: "z1", label: "华北-河北 (z1)" },
	{ value: "z2", label: "华南-广东 (z2)" },
	{ value: "na0", label: "北美 (na0)" },
	{ value: "as0", label: "东南亚 (as0)" },
];

// 上传时转换的目标格式(与后端 CONVERT_FORMATS 白名单一致)
export type ConvertFormat = "webp" | "avif";

// 转换格式选项(配置页 Select 用)
export const CONVERT_FORMAT_OPTIONS: { value: ConvertFormat; label: string }[] =
	[
		{ value: "webp", label: "WebP（兼容性好，压缩率高）" },
		{ value: "avif", label: "AVIF（压缩率更高，编码依赖浏览器支持）" },
	];

// 图床业务配置（不含任何密钥，AK/SK 在 EdgeOne 环境变量）
export interface ImageHostingConfig {
	bucket: string;
	domain: string;
	region: QiniuRegion;
	prefix: string;
	maxSizeMB: number;
	enabled: boolean;
	/** 上传前是否在浏览器本地转码为 convertFormat */
	convertEnabled: boolean;
	convertFormat: ConvertFormat;
}

// 上传凭证签发结果：token/key 由后端生成，publicUrl 为后端权威拼接的最终访问地址
export interface UploadTokenResult {
	token: string;
	key: string;
	uploadHost: string;
	publicUrl: string;
}

// 已上传图片项（list 接口返回；putTimeMs 已由后端从七牛 100ns 纪元转成毫秒）
export interface QiniuImageItem {
	key: string;
	url: string;
	fsize: number;
	putTimeMs: number;
	mimeType: string;
}

export interface ImageListResult {
	items: QiniuImageItem[];
	marker: string;
	hasMore: boolean;
}

export const imageHostingApi = {
	getConfig: () => apiClient.get<ImageHostingConfig>("/api/image/config"),
	saveConfig: (data: ImageHostingConfig) =>
		apiClient.put<{ ok: true; config: ImageHostingConfig }>(
			"/api/image/config",
			data,
		),
	createToken: (filename: string) =>
		apiClient.post<UploadTokenResult>("/api/image/token", { filename }),
	// scope=prefix 只看配置前缀下的图；all 看整个空间。marker 为七牛分页游标
	list: (scope: "prefix" | "all", marker?: string) =>
		apiClient.get<ImageListResult>(
			`/api/image/list?scope=${scope}${marker ? `&marker=${encodeURIComponent(marker)}` : ""}`,
		),
	remove: (key: string) =>
		apiClient.post<{ ok: true; key: string }>("/api/image/delete", { key }),
};
