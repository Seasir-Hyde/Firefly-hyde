import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Vite 配置：React 18 + Semi Design;
// - 使用 HashRouter,无需 SPA 路由重写(EdgeOne rewrites 不支持 SPA 前端路由重写)
// - base: "/admin/" 将 admin 合并进主博客 /admin 子路径部署(见 docs/admin-merge-plan.md §3)
// - dev 时通过 proxy 转发 /api/* 到 edgeone makers dev 的 8088 端口方便联调
export default defineConfig({
	base: "/admin/",
	plugins: [react()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "src"),
		},
	},
	server: {
		port: 5173,
		host: true,
		proxy: {
			// 本地并行运行 `edgeone makers dev` 时,通过 vite 转发 /api/* 请求
			// 优先尝试 9000 端口（node-function），如果 edge-function 可用则用 8088
			"/api": {
				target: "http://localhost:9000",
				changeOrigin: true,
			},
		},
	},
	build: {
		outDir: "dist",
		emptyOutDir: true,
		target: "es2020",
		sourcemap: false,
	},
});
