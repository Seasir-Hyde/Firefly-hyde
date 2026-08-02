import React from "react";
import ReactDOM from "react-dom/client";
// Semi Design 2.x 在 Vite 下零配置按需打包,组件按需注入样式,无需显式引全局 CSS
import "./styles/global.css";
import App from "./App";

// React 18 严格模式仅在开发环境启用,避免生产双渲染带来的额外开销
const rootElement = document.getElementById("root");
if (!rootElement) {
	throw new Error("找不到 #root 挂载节点");
}

ReactDOM.createRoot(rootElement).render(
	import.meta.env.DEV ? (
		<React.StrictMode>
			<App />
		</React.StrictMode>
	) : (
		<App />
	),
);
