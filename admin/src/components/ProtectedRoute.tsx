// 路由守卫:未登录跳登录页,加载中占位
import { Spin } from "@douyinfe/semi-ui";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/providers/AuthProvider";

export function ProtectedRoute({ children }: { children: ReactNode }) {
	const { session, loading } = useAuth();
	const location = useLocation();

	if (loading) {
		return (
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					height: "100vh",
				}}
			>
				<Spin size="large" />
			</div>
		);
	}

	if (!session) {
		// 用 state 记录原始目标,登录成功后 LoginPage 会读它跳回来
		return <Navigate to="/login" replace state={{ from: location.pathname }} />;
	}

	return <>{children}</>;
}
