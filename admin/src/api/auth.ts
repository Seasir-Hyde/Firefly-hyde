// 认证相关 API 封装
import { apiClient } from "./client";

export interface CurrentUser {
	username: string;
}

export interface LoginPayload {
	username: string;
	password: string;
}

export const authApi = {
	login: (payload: LoginPayload) =>
		apiClient.post<CurrentUser>("/api/auth/login", payload),
	logout: () => apiClient.post<{ ok: true }>("/api/auth/logout"),
	me: () => apiClient.get<CurrentUser>("/api/auth/me"),
};
