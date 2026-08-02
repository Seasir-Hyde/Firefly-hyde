// 设备（Devices）API 封装：走 Edge Functions + KV（单 key 存嵌套对象，秒级生效）
// 与后端 edge-functions/api/devices/index.js 数据模型保持一致。
//
// 与其余资料数据（项目/技能/时间线走 Git 通道，见 ./data.ts）不同：
// 设备已迁 KV，保存后秒级生效、无需构建。交互仍是 DataPage 的「本地暂存 + 整体保存」，
// 故只暴露 getAll（读嵌套对象）+ replaceAll（整体覆盖），不做单条增删改。
// 注意：设备是嵌套结构 Record<类别, Device[]>，不是扁平数组（友链是数组）。
import { apiClient } from "./client";

// 设备数据模型（对齐博客 src/data/devices.ts Device）
export interface Device {
	name: string;
	image: string;
	specs: string;
	description: string;
	link: string;
	price?: string;
}

// 嵌套存储：类别 → 设备数组
export type DeviceCategory = Record<string, Device[]>;

export interface DeviceListResult {
	devices: DeviceCategory;
	total: number;
}

export const devicesApi = {
	// 读全部设备（管理端，嵌套对象）
	getAll: () => apiClient.get<DeviceListResult>("/api/devices"),
	// 整体覆盖并写回 KV（body: { devices }）
	replaceAll: (devices: DeviceCategory) =>
		apiClient.put<DeviceListResult & { ok: true }>("/api/devices", {
			devices,
		}),
};
