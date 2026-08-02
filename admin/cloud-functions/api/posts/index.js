/**
 * /api/posts
 *   GET  文章列表：递归列出 src/content/blog 下所有 markdown（不含正文）
 *   POST 批量发布草稿：一次 git commit 将全部 draft:true 改为 false 并 push（触发构建）
 *
 * 读走 CNB raw；写走 isomorphic-git（见 docs/admin-console-plan.md）。
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CnbError, getRaw, listMarkdownFiles } from "../../_shared/cnb.js";
import {
	extractExcerpt,
	parsePost,
	serializePost,
} from "../../_shared/frontmatter.js";
import { commitAndPush, GitOpError, writeRepoFile } from "../../_shared/git.js";
import { requireAuth } from "../../_shared/requireAuth.js";
import {
	badRequest,
	errorResponse,
	jsonResponse,
	methodNotAllowed,
} from "../../_shared/response.js";

const BLOG_DIR = "src/content/posts";

export async function onRequestGet(context) {
	const auth = await requireAuth(context);
	if (auth instanceof Response) return auth;

	try {
		const absPaths = await listMarkdownFiles(context.env, BLOG_DIR);

		const items = await Promise.all(
			absPaths.map(async (absPath) => {
				try {
					const raw = await getRaw(context.env, absPath);
					const { frontmatter, body } = parsePost(raw);
					const relPath = absPath.startsWith(`${BLOG_DIR}/`)
						? absPath.slice(BLOG_DIR.length + 1)
						: absPath;
					return {
						path: relPath,
						title: frontmatter.title || relPath,
						published: frontmatter.published || "",
						updated: frontmatter.updated,
						draft: frontmatter.draft === true,
						pinned: frontmatter.pinned === true,
						category: frontmatter.category || "",
						tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
						description: frontmatter.description || "",
						excerpt: frontmatter.description || extractExcerpt(body),
						image: frontmatter.image || "",
					};
				} catch {
					return null;
				}
			}),
		);

		const posts = items.filter((it) => it !== null);
		posts.sort((a, b) => {
			if (a.pinned && !b.pinned) return -1;
			if (!a.pinned && b.pinned) return 1;
			return a.published < b.published ? 1 : -1;
		});

		return jsonResponse({ posts, total: posts.length }, { cache: "no-store" });
	} catch (err) {
		if (err instanceof CnbError) {
			return errorResponse(err.status, err.message);
		}
		return errorResponse(500, "读取文章列表失败");
	}
}

/**
 * POST body: { action: "publish-drafts" }
 * 将仓库中全部 draft:true 的文章改为 draft:false，单次 commit + push，触发博客构建。
 * 无草稿时不写仓库，返回 published: []。
 */
export async function onRequestPost(context) {
	const auth = await requireAuth(context);
	if (auth instanceof Response) return auth;

	let body;
	try {
		body = await context.request.json();
	} catch {
		return badRequest("请求体解析失败");
	}

	const action = body?.action;
	if (action !== "publish-drafts") {
		return badRequest('不支持的 action（仅支持 "publish-drafts"）');
	}

	try {
		// 先在 CNB raw 上扫一遍草稿列表（clone 前可知有无、可写 commit 摘要）
		const absPaths = await listMarkdownFiles(context.env, BLOG_DIR);
		const draftMetas = [];
		for (const absPath of absPaths) {
			try {
				const raw = await getRaw(context.env, absPath);
				const { frontmatter } = parsePost(raw);
				if (frontmatter.draft === true) {
					const relPath = absPath.startsWith(`${BLOG_DIR}/`)
						? absPath.slice(BLOG_DIR.length + 1)
						: absPath;
					draftMetas.push({
						path: relPath,
						title: frontmatter.title || relPath,
					});
				}
			} catch {
				// 单篇读失败跳过，避免整批失败
			}
		}

		if (draftMetas.length === 0) {
			return jsonResponse(
				{ ok: true, published: [], commit: null, branch: null },
				{ cache: "no-store" },
			);
		}

		const titles = draftMetas.map((d) => d.title).slice(0, 5);
		const more = draftMetas.length > 5 ? ` 等 ${draftMetas.length} 篇` : "";
		const message = `文章: 批量发布草稿 ${titles.join("、")}${more}`;

		const published = [];
		const result = await commitAndPush(context.env, message, async (dir) => {
			// 在工作树内再读一遍并改写，保证与 clone 内容一致
			for (const meta of draftMetas) {
				const absPath = `${BLOG_DIR}/${meta.path}`;
				const filePath = join(dir, absPath);
				let raw;
				try {
					raw = await readFile(filePath, "utf8");
				} catch {
					continue;
				}
				const { frontmatter, body: postBody } = parsePost(raw);
				if (frontmatter.draft !== true) continue;
				frontmatter.draft = false;
				const content = serializePost(frontmatter, postBody);
				await writeRepoFile(dir, absPath, content);
				published.push({ path: meta.path, title: meta.title });
			}
			if (published.length === 0) {
				// 工作树内已无草稿（并发被别人发了），避免空提交
				throw new GitOpError(409, "工作树内未找到可发布的草稿，请刷新后重试");
			}
		});

		return jsonResponse(
			{
				ok: true,
				published,
				commit: result.commitOid,
				branch: result.branch,
			},
			{ cache: "no-store" },
		);
	} catch (err) {
		if (err instanceof CnbError) {
			return errorResponse(err.status, err.message);
		}
		if (err instanceof GitOpError) {
			return errorResponse(err.status, err.message);
		}
		return errorResponse(500, err?.message || "批量发布草稿失败");
	}
}

export async function onRequest(context) {
	const method = context.request.method;
	if (method === "GET") return onRequestGet(context);
	if (method === "POST") return onRequestPost(context);
	return methodNotAllowed(["GET", "POST"]);
}
