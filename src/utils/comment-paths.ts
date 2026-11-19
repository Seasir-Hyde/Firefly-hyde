/**
 * 收集可能承载评论的页面路径。
 *
 * Twikoo 按页面路径存储评论（路径通常不含尾斜杠），与 analytics 页保持同一套来源：
 * 固定页面 + 全部文章页。文章页路径直接扫描内容目录，以保留原始大小写
 * （Twikoo 存的是原始文件名，Astro glob loader 会规范化成小写连字符，两者对不上）。
 *
 * 构建期结果会被缓存，避免侧边栏在多个页面重复扫描目录。
 */
const FIXED_COMMENT_PATHS = [
	"/guestbook",
	"/friends",
	"/moments",
	"/dynamic",
	"/about",
	"/",
];

let cachedPaths: string[] | null = null;

export async function getCommentPathList(): Promise<string[]> {
	if (cachedPaths) return cachedPaths;

	const paths = [...FIXED_COMMENT_PATHS];

	try {
		const { readdirSync, statSync } = await import("node:fs");
		const { join, relative, sep } = await import("node:path");
		const base = join(process.cwd(), "src", "content", "posts");

		const walk = (dir: string) => {
			for (const entry of readdirSync(dir)) {
				const full = join(dir, entry);
				if (statSync(full).isDirectory()) {
					walk(full);
					continue;
				}
				if (!/\.(md|mdx|markdown)$/iu.test(entry)) continue;
				const rel = relative(base, full).split(sep).join("/");
				const slug = rel.replace(/\.(md|mdx|markdown)$/iu, "");
				if (slug) paths.push(`/posts/${slug}`);
			}
		};

		walk(base);
	} catch {
		// node:fs 不可用（如 Workers 运行时）时仅保留固定页面路径
	}

	cachedPaths = paths;
	return paths;
}
