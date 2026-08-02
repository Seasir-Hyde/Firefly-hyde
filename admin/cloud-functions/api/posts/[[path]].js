/**
 * /api/posts/<相对路径>  catch-all
 *   GET    读取单篇文章（走 CNB raw + 解析 frontmatter）
 *   PUT    保存文章：frontmatter + body 序列化为 markdown → git push
 *   DELETE 删除文章：删文件 → git push
 *
 * catch-all：/api/posts/Firefly/快速开始.md → params.path = ["Firefly","快速开始.md"]
 *
 * 读走 CNB API（毫秒级、无需 clone）；写走 isomorphic-git（CNB OpenAPI 不暴露
 * 文件写接口，唯一写通道是 git push，见 docs/admin-console-plan.md 3.6）。
 *
 * 鉴权：middleware.js 只做 cookie 存在性检查（坑 6：middleware env 不保证可用、不验签），
 * 故此处 GET/PUT/DELETE 均各自 requireAuth() 真正验 JWT。
 *
 * 请求体（PUT）：{ frontmatter: object, body: string, commitMessage?: string, skipBuild?: boolean }
 * skipBuild=true 时给 commit message 加 [skip build] 前缀，配合 .cnb.yml 条件跳过博客构建（草稿）。
 */
import { CnbError, getRaw } from "../../_shared/cnb.js";
import { serializePost, parsePost } from "../../_shared/frontmatter.js";
import { commitAndPush, deleteRepoFile, GitOpError, writeRepoFile } from "../../_shared/git.js";
import { requireAuth } from "../../_shared/requireAuth.js";
import { badRequest, errorResponse, jsonResponse, methodNotAllowed } from "../../_shared/response.js";

const BLOG_DIR = "src/content/posts";

// catch-all params.path 统一成相对 blog 目录的路径，并防目录穿越
// 注意：EdgeOne 的 catch-all params 是「未解码」的（前端对每段 encodeURIComponent 后
// 原样保留，如中文 → %E5%BF%AB...）。必须按段 decodeURIComponent 抵消前端编码，
// 还原成原始文件名（如「快速开始.md」）；否则 getRaw 会拿编码态字符串当字面文件名 → 404。
// 见坑：中文路径文章后台打不开（2026-07-09 CDP 实测确诊，纯英文路径不受影响）。
function decodeSeg(s) {
	try {
		return decodeURIComponent(String(s));
	} catch {
		return String(s); // 畸形编码原样返回，交由后续 404
	}
}

function resolveRelPath(path) {
	let rel;
	if (Array.isArray(path)) {
		rel = path.map(decodeSeg).join("/");
	} else if (typeof path === "string") {
		// 整串可能含已编码段，按 / 分割逐段解码（斜杠分隔符本身不会被前端编码）
		rel = path.split("/").map(decodeSeg).join("/");
	} else {
		return null;
	}
	rel = rel.replace(/^\/+|\/+$/g, "");
	if (!rel || rel.includes("..")) return null;
	return rel;
}

// 给 commit message 加 [skip build] 前缀（草稿保存不触发博客构建）
function buildCommitMessage(raw, skipBuild, fallback) {
	const base = (raw && String(raw).trim()) || fallback;
	return skipBuild ? `[skip build] ${base}` : base;
}

async function handleGet(context, rel) {
	if (!/\.mdx?$/.test(rel)) {
		return badRequest("仅支持 .md/.mdx 文章");
	}
	try {
		const absPath = `${BLOG_DIR}/${rel}`;
		const raw = await getRaw(context.env, absPath);
		const { frontmatter, body } = parsePost(raw);
		return jsonResponse({ path: rel, frontmatter, body }, { cache: "no-store" });
	} catch (err) {
		if (err instanceof CnbError) {
			return errorResponse(err.status, err.message);
		}
		return errorResponse(500, "读取文章失败");
	}
}

async function handlePut(context, rel) {
	if (!/\.mdx?$/.test(rel)) {
		return badRequest("仅支持 .md/.mdx 文章");
	}

	let body;
	try {
		body = await context.request.json();
	} catch {
		return badRequest("请求体解析失败");
	}

	const frontmatter = body?.frontmatter;
	if (!frontmatter || typeof frontmatter !== "object") {
		return badRequest("缺少 frontmatter");
	}
	if (!frontmatter.title || String(frontmatter.title).trim() === "") {
		return badRequest("标题必填");
	}

	const content = serializePost(frontmatter, body.body ?? "");
	const absPath = `${BLOG_DIR}/${rel}`;
	const message = buildCommitMessage(body.commitMessage, body.skipBuild === true, `文章: 更新 ${rel}`);

	try {
		const result = await commitAndPush(context.env, message, async (dir) => {
			await writeRepoFile(dir, absPath, content);
		});
		return jsonResponse(
			{ ok: true, path: rel, commit: result.commitOid, branch: result.branch },
			{ cache: "no-store" },
		);
	} catch (err) {
		const status = err instanceof GitOpError ? err.status : 500;
		return errorResponse(status, err?.message || "保存失败");
	}
}

async function handleDelete(context, rel) {
	if (!/\.mdx?$/.test(rel)) {
		return badRequest("仅支持 .md/.mdx 文章");
	}
	const absPath = `${BLOG_DIR}/${rel}`;
	try {
		const result = await commitAndPush(context.env, `文章: 删除 ${rel}`, async (dir) => {
			await deleteRepoFile(dir, absPath);
		});
		return jsonResponse(
			{ ok: true, path: rel, commit: result.commitOid, branch: result.branch },
			{ cache: "no-store" },
		);
	} catch (err) {
		const status = err instanceof GitOpError ? err.status : 500;
		return errorResponse(status, err?.message || "删除失败");
	}
}

export async function onRequest(context) {
	const auth = await requireAuth(context);
	if (auth instanceof Response) return auth;

	const rel = resolveRelPath(context.params?.path);
	if (!rel) {
		return badRequest("文章路径无效");
	}

	const method = context.request.method;
	if (method === "GET") return handleGet(context, rel);
	if (method === "PUT") return handlePut(context, rel);
	if (method === "DELETE") return handleDelete(context, rel);
	return methodNotAllowed(["GET", "PUT", "DELETE"]);
}
