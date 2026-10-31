/**
 * 字体工具函数
 *
 * 提供字体配置相关的共享逻辑，用于 astro.config.mjs 和 scripts/subset-fonts.ts。
 */

import type {
	FontSelectionConfig,
	FontSwitchOption,
} from "../types/fontConfig";

/**
 * 从 fontConfig 中收集所有实际使用的字体 CSS 变量名。
 *
 * 包括：
 * - selected 中的非 "system" 值
 * - bannerTitleFont / bannerSubtitleFont / navbarTitleFont 区域覆盖
 * - codeFont 代码块字体
 *
 * @returns 去重后的 CSS 变量名集合（如 "--font-inter"）
 */
export function collectUsedFontCssVars(
	config: FontSelectionConfig,
): Set<string> {
	const used = new Set<string>();

	const sel = config.selected;
	if (Array.isArray(sel)) {
		for (const v of sel) {
			if (v !== "system") used.add(v);
		}
	} else if (sel !== "system") {
		used.add(sel);
	}

	if (config.bannerTitleFont) used.add(config.bannerTitleFont);
	if (config.bannerSubtitleFont) used.add(config.bannerSubtitleFont);
	if (config.navbarTitleFont) used.add(config.navbarTitleFont);
	if (config.codeFont) used.add(config.codeFont);

	return used;
}

/**
 * 解析字体切换的可用档位。
 *
 * 仅在 fontConfig.enable 与 switchable.enable 同时开启、且至少配置了两个档位时生效。
 * defaultMode 为 null 时表示不提供切换，返回空数组。
 *
 * @returns 可用档位列表（至少包含 2 项才会返回）
 */
export function resolveFontSwitchOptions(
	config: FontSelectionConfig,
): FontSwitchOption[] {
	if (!config.enable || !config.switchable?.enable) return [];
	const options = config.switchable.options.filter(Boolean);
	// 少于两个档位时切换没有意义
	if (options.length < 2) return [];
	return options;
}

/**
 * 取得字体切换的默认档位 id。
 *
 * 优先使用 switchable.defaultMode；未配置时回退到第一个档位。
 *
 * @returns 默认档位 id，切换未启用时返回 null
 */
export function resolveDefaultFontMode(
	config: FontSelectionConfig,
): string | null {
	const options = resolveFontSwitchOptions(config);
	if (!options.length) return null;
	const configured = config.switchable?.defaultMode;
	if (configured === null) return null;
	if (configured && options.some((o) => o.id === configured)) return configured;
	return options[0].id;
}

/**
 * 将本地字体的 src 路径转换为 public 目录下的访问路径。
 *
 * 支持的输入格式：
 * - "./public/..."  → "/..."（public/ 前缀的相对路径）
 * - "public/..."    → "/..."
 * - "/public/..."   → "/..."
 * - "/..."          → "/..."（已是绝对路径，直接返回）
 * - 其他相对路径    → 返回 null（无法安全转换）
 *
 * @returns 转换后的访问路径，或 null 表示无法转换
 */
export function toPublicPath(rawSrc: string): string | null {
	// 已是绝对路径（包括 /public/ 前缀的路径，去掉 /public 前缀）
	if (rawSrc.startsWith("/")) {
		const match = rawSrc.match(/^\/public\/(.+)$/);
		return match ? `/${match[1]}` : rawSrc;
	}

	// 匹配 public/ 前缀的各种写法
	const match = rawSrc.match(/^\.?\/?public\/(.+)$/);
	if (match) {
		return `/${match[1]}`;
	}

	// 相对路径且不含 public/ 前缀，无法安全转换
	return null;
}
