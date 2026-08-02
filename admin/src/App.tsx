// 应用根组件:HashRouter + 全局 Provider + 路由表
// 说说/公告/一言/资料/构建等页面在阶段 1 只放占位,阶段 2 之后逐个替换
import { LocaleProvider } from "@douyinfe/semi-ui";
import zh_CN from "@douyinfe/semi-ui/lib/es/locale/source/zh_CN";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AnnouncementsPage } from "@/pages/AnnouncementsPage";
import { BuildsPage } from "@/pages/BuildsPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { DataPage } from "@/pages/DataPage";
import { LoginPage } from "@/pages/LoginPage";
import { MomentsPage } from "@/pages/MomentsPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { PagesPage } from "@/pages/PagesPage";
import { PlacesPage } from "@/pages/PlacesPage";
import { PostEditorPage } from "@/pages/PostEditorPage";
import { PostsPage } from "@/pages/PostsPage";
import { QuotesPage } from "@/pages/QuotesPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { SiteConfigPage } from "@/pages/SiteConfigPage";
import { AuthProvider } from "@/providers/AuthProvider";

// React Query:阶段 1 只做骨架,默认 60s stale + 关闭窗口聚焦重取,避免频繁请求空接口
const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 60 * 1000,
			refetchOnWindowFocus: false,
			retry: 1,
		},
	},
});

export default function App() {
	return (
		<QueryClientProvider client={queryClient}>
			<LocaleProvider locale={zh_CN}>
				<AuthProvider>
					<HashRouter>
						<Routes>
							<Route path="/login" element={<LoginPage />} />
							<Route
								path="/"
								element={
									<ProtectedRoute>
										<AppLayout />
									</ProtectedRoute>
								}
							>
								<Route index element={<Navigate to="/dashboard" replace />} />
								<Route path="dashboard" element={<DashboardPage />} />
								<Route path="posts" element={<PostsPage />} />
								<Route path="posts/new" element={<PostEditorPage />} />
								<Route path="posts/edit" element={<PostEditorPage />} />
								<Route path="moments" element={<MomentsPage />} />
								<Route path="places" element={<PlacesPage />} />
								<Route path="announcements" element={<AnnouncementsPage />} />
								<Route path="quotes" element={<QuotesPage />} />
								<Route path="data" element={<DataPage />} />
								<Route path="pages" element={<PagesPage />} />
								<Route path="builds" element={<BuildsPage />} />
								{/* 博客配置：单路由 + splat，避免切分组 remount 丢掉 dirty 草稿 */}
								<Route path="site-config/*" element={<SiteConfigPage />} />
								<Route path="settings" element={<SettingsPage />} />
							</Route>
							<Route path="*" element={<NotFoundPage />} />
						</Routes>
					</HashRouter>
				</AuthProvider>
			</LocaleProvider>
		</QueryClientProvider>
	);
}
