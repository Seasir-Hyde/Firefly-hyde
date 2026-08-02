// 页面外壳统一样式:根容器 padding 与 sticky 吸顶头样式的单一来源。
// sticky 头的负 margin 必须与根 padding 等值反号(否则吸顶时左右溢出或露缺口),
// 这对值永远从这里一起取,不要在页面里手写字面量。
// 桌面分支与既有各页字面量逐项一致(桌面零变化);移动端 padding 收窄到 16。
import type { CSSProperties } from "react";
import { useIsMobile } from "./useIsMobile";

interface PageShell {
	isMobile: boolean;
	pad: number;
	pageStyle: CSSProperties;
	stickyStyle: CSSProperties;
}

export function usePageShell(): PageShell {
	const isMobile = useIsMobile();
	const pad = isMobile ? 16 : 24;
	const pageStyle: CSSProperties = { padding: pad };
	// 注意键序:margin 简写在前、marginBottom 在后覆盖底边(与原页面写法一致)
	const stickyStyle: CSSProperties = {
		position: "sticky",
		top: 0,
		zIndex: 10,
		margin: -pad,
		marginBottom: 16,
		padding: isMobile ? "12px 16px" : "16px 24px",
		backgroundColor: "var(--semi-color-bg-0)",
		boxShadow: "0 1px 0 var(--semi-color-border)",
	};
	return { isMobile, pad, pageStyle, stickyStyle };
}
