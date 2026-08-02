// 构建记录 API 封装：读 CNB main 分支 push 事件的流水线记录
import { apiClient } from "./client";

export interface BuildItem {
	sn: string;
	status: string;
	commitTitle: string;
	createTime: string;
	duration: number;
	sha: string;
	targetRef: string;
	buildLogUrl: string;
	userName: string;
}

export interface BuildListResult {
	builds: BuildItem[];
	total: number;
}

export const buildsApi = {
	list: (pageSize = 20) =>
		apiClient.get<BuildListResult>(`/api/build/status?page_size=${pageSize}`),
};
