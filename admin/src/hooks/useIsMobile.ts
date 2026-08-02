// 全局移动端断点:<768px 视为移动端(与 Semi Grid 的 md 断点对齐,
// JS 判断与 Grid 响应式 props 在同一像素切换)
// 模块级 matchMedia 单例,所有组件共享一个监听器;纯 SPA 无 SSR 顾虑
import { useSyncExternalStore } from "react";

export const MOBILE_QUERY = "(max-width: 767px)";

const mql = window.matchMedia(MOBILE_QUERY);

function subscribe(callback: () => void): () => void {
	mql.addEventListener("change", callback);
	return () => mql.removeEventListener("change", callback);
}

function getSnapshot(): boolean {
	return mql.matches;
}

/** 是否移动端(<768px);≥768 一律走桌面现状分支 */
export function useIsMobile(): boolean {
	return useSyncExternalStore(subscribe, getSnapshot);
}
