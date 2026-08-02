// 声明式 Modal 的响应式尺寸:桌面保持原 width 居中,移动端全屏。
// fullScreen 是 Semi 一等属性,会覆盖 width/height;关闭出口 = 右上角 X + Esc + footer 取消,
// maskClosable=false 在全屏下本就无遮罩可点,无副作用。
import type { CSSProperties } from "react";
import { useIsMobile } from "./useIsMobile";

interface ResponsiveModalProps {
	fullScreen?: boolean;
	width?: number;
	bodyStyle?: CSSProperties;
}

/** 用法:<Modal {...useModalProps(640)} title=... visible=... /> */
export function useModalProps(desktopWidth: number): ResponsiveModalProps {
	const isMobile = useIsMobile();
	if (!isMobile) return { width: desktopWidth };
	return {
		fullScreen: true,
		// 全屏下长表单在 body 内自行滚动;dvh 随移动端地址栏伸缩,避免底部字段被裁
		bodyStyle: { overflowY: "auto", maxHeight: "calc(100dvh - 150px)" },
	};
}
