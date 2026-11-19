// 为每个路由目录补一个伴随文件，让 EdgeOne Pages 能把该目录解析成目录索引。
//
// 背景（2026-11-19 线上实测）：
// Astro 产物是「目录型」布局（dist/posts/todo/index.html）。EdgeOne Pages 的静态层
// 只有在目录被登记为真实目录时，才会把 /posts/todo/ 映射到 posts/todo/index.html。
// 实测同一份产物里：
//   · 目录内只有 index.html 一个对象 → /archive/ 带斜杠 404、/posts/todo 两种形式都 404
//     （对象本身在，/posts/todo/index.html 直接访问是 200）
//   · 目录内还有别的对象（public/ 拷进来的 directory.json、urls.txt、图片等）
//     → /friends/、/gallery/、/gallery/scenery/ 两种形式都 200
// 即「目录里只有 index.html」时，平台不做目录索引解析；而站点导航、canonical、
// sitemap 用的都是带斜杠形式，等于全站链接都指向 404。
//
// 修复：给每个「只有 index.html」的路由目录写一个伴随文件 index.json，
// 让目录里出现第二个对象，平台即可把该目录识别为真实目录，
// 于是 /posts/todo 与 /posts/todo/ 都命中同一份 index.html，URL 与 canonical 不变。
//
// index.json 内容仅为路由元信息（无副作用、不参与渲染），同时便于外部枚举路由。
import { readdir, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "..", "..");
const distDir = join(projectRoot, "dist");

// 这些目录放的是资源而非页面，不需要处理（本身也不含 index.html，留作兜底）
const SKIP_DIRS = new Set([
	"_astro",
	"api",
	"assets",
	"favicon",
	"images",
	"js",
	"mouse",
	"og",
	"pagefind",
	"pio",
]);

let scanned = 0;
let patched = 0;

async function walk(dir: string): Promise<void> {
	const entries = await readdir(dir, { withFileTypes: true });
	const files = entries
		.filter((entry) => entry.isFile())
		.map((entry) => entry.name);
	const dirs = entries
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);

	if (files.includes("index.html")) {
		scanned++;
		// 目录里只有 index.html 一个对象 → 平台不会解析目录索引，补一个伴随文件
		if (files.length === 1) {
			const route = `/${relative(distDir, dir).split(sep).join("/")}/`;
			await writeFile(
				join(dir, "index.json"),
				`${JSON.stringify({ route }, null, 2)}\n`,
				"utf8",
			);
			patched++;
		}
	}

	for (const name of dirs) {
		if (SKIP_DIRS.has(name)) continue;
		await walk(join(dir, name));
	}
}

try {
	await walk(distDir);
} catch (error) {
	if ((error as NodeJS.ErrnoException).code === "ENOENT") {
		console.error("[路由索引] 未找到 dist/ 目录，请先执行构建");
		process.exit(1);
	}
	throw error;
}

console.log(
	`[路由索引] 路由目录 ${scanned} 个，已为 ${patched} 个「仅含 index.html」的目录补上 index.json`,
);
