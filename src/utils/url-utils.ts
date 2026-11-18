import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";

/**
 * 移除文件扩展名（.md, .mdx, .markdown）
 * 用于将 Astro v5 Content Layer API 的 id 转换为 URL 友好的 slug
 */
export function removeFileExtension(id: string): string {
	return id.replace(/\.(md|mdx|markdown)$/i, "");
}

/**
 * 统一文章 slug：去扩展名 + 去首尾斜杠。
 * frontmatter 中 `slug: /xxx` 会带前导斜杠，裸拼 `/posts/${id}/` 会产生 //。
 */
export function normalizePostSlug(id: string): string {
	return removeFileExtension(id).replace(/^\/+|\/+$/g, "");
}

export function pathsEqual(path1: string, path2: string): boolean {
	const normalizedPath1 = path1.replace(/^\/|\/$/g, "").toLowerCase();
	const normalizedPath2 = path2.replace(/^\/|\/$/g, "").toLowerCase();
	return normalizedPath1 === normalizedPath2;
}

/**
 * 智能拼接URL，正确处理网络URL和本地路径
 */
function joinUrl(...parts: string[]): string {
	// 如果第一个部分是网络URL，直接返回拼接后的结果（不处理协议头的//）
	if (
		parts[0]?.startsWith("http://") ||
		parts[0]?.startsWith("https://") ||
		parts[0]?.startsWith("//")
	) {
		return parts.join("").replace(/(?<!:)\/+/g, "/");
	}

	// 本地路径正常拼接
	const joined = parts.join("/");
	return joined.replace(/\/+/g, "/");
}

export function getPostUrlBySlug(slug: string): string {
	return url(`/posts/${normalizePostSlug(slug)}/`);
}

export function getTagUrl(tag: string): string {
	if (!tag) return url("/archive/");
	return url(`/archive/?tag=${encodeURIComponent(tag.trim())}`);
}

export function getCategoryUrl(category: string | null): string {
	if (
		!category ||
		category.trim() === "" ||
		category.trim().toLowerCase() === i18n(I18nKey.uncategorized).toLowerCase()
	)
		return url("/categories/uncategorized/");
	return url(`/categories/${encodeURIComponent(category.trim())}/`);
}

export function getCategoryPageUrl(): string {
	return url("/categories/");
}

export function getDir(path: string): string {
	// 移除文件扩展名
	const pathWithoutExt = removeFileExtension(path);
	const lastSlashIndex = pathWithoutExt.lastIndexOf("/");
	if (lastSlashIndex < 0) {
		return "/";
	}
	return pathWithoutExt.substring(0, lastSlashIndex + 1);
}

export function getFileDirFromPath(filePath: string): string {
	return filePath.replace(/^src\//, "").replace(/\/[^/]+$/, "");
}

export function getSearchUrl(query: string): string {
	return url(`/search/?q=${encodeURIComponent(query.trim())}`);
}

// 生成 canonical URL：仅对客户端筛选路由（/archive/ 与 /search/）剥离查询串，
// 避免 ?tag=/?category=/?q= 这类服务端渲染下会被写进 Astro.url 的重复内容 URL
// 自我 canonical。分页（/2/）、文章页等无查询串的路径保持原样。
export function getCanonicalUrl(urlObj: URL): string {
	const pathname = urlObj.pathname;
	if (pathname === "/archive/" || pathname === "/search/") {
		return new URL(pathname, urlObj.origin).toString();
	}
	return urlObj.toString();
}

export function url(path: string): string {
	// 关键修复：如果是网络URL，直接返回原地址
	if (
		path.startsWith("http://") ||
		path.startsWith("https://") ||
		path.startsWith("//")
	) {
		return path;
	}

	// 只有本地相对路径才添加BASE_URL
	return joinUrl("", import.meta.env.BASE_URL, path);
}

// 内容详情页路径模式：文章(/posts/、/post/) 与 项目详情(/projects/<slug>/)
// 用正则而非 includes("/projects/")，是为了不把 /projects/ 列表页误判成详情页
const CONTENT_DETAIL_PATH_PATTERNS = [
	/\/posts\/.+/,
	/\/post\/.+/,
	/\/projects\/.+/,
];

/**
 * 判断路径是否为「内容详情页」（文章 / 项目）。
 * 供侧边栏组件显隐、悬浮目录、沉浸阅读等复用，统一了各处硬编码的 /posts/ 判断。
 */
export function isArticleDetailPage(pathname: string): boolean {
	return CONTENT_DETAIL_PATH_PATTERNS.some((re) => re.test(pathname));
}
