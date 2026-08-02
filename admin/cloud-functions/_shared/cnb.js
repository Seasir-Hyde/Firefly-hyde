/**
 * CNB OpenAPI 客户端（读操作）
 *
 * Edge Functions 侧只做读：目录树、文件 raw、构建记录。
 * 写操作（git push）在 Cloud Functions 用 isomorphic-git 完成。
 *
 * 依赖环境变量：
 *   CNB_TOKEN   对博客仓库有读权限的访问令牌
 *   CNB_REPO    仓库标识，如 "xiangfeng-z/Firefly-zane"
 *   CNB_BRANCH  分支，默认 "main"
 */

const CNB_API_BASE = "https://api.cnb.cool";

export class CnbError extends Error {
	constructor(status, message) {
		super(message);
		this.name = "CnbError";
		this.status = status;
	}
}

function resolveConfig(env) {
	const token = env.CNB_TOKEN;
	const repo = env.CNB_REPO;
	if (!token || !repo) {
		throw new CnbError(500, "服务器缺少 CNB_TOKEN / CNB_REPO 配置");
	}
	return { token, repo, branch: env.CNB_BRANCH || "main" };
}

// 对路径的每一段做 encode，保留斜杠分隔（文件名可能含空格、中文）
function encodePath(path) {
	return path
		.split("/")
		.map((seg) => encodeURIComponent(seg))
		.join("/");
}

async function cnbFetch(env, url, accept) {
	const { token } = resolveConfig(env);
	return fetch(url, {
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: accept,
		},
	});
}

/**
 * 读取目录或单文件的 contents 元信息。
 * 传目录路径返回 entries；传文件路径返回含 base64 content 的对象。
 */
export async function getContents(env, path) {
	const { repo, branch } = resolveConfig(env);
	const encoded = encodePath(path);
	const url = `${CNB_API_BASE}/${repo}/-/git/contents/${encoded}?ref=${encodeURIComponent(branch)}`;
	const res = await cnbFetch(env, url, "application/json");
	if (!res.ok) {
		throw new CnbError(res.status, `读取目录失败：${path}（${res.status}）`);
	}
	return await res.json();
}

/**
 * 读取文件原始文本（markdown 正文）。
 * raw 端点路径形态为 {ref}/{path}。
 */
export async function getRaw(env, path) {
	const { repo, branch } = resolveConfig(env);
	const refWithPath = encodePath(`${branch}/${path}`);
	const url = `${CNB_API_BASE}/${repo}/-/git/raw/${refWithPath}`;
	const res = await cnbFetch(env, url, "text/plain");
	if (res.status === 404) {
		throw new CnbError(404, `文件不存在：${path}`);
	}
	if (!res.ok) {
		throw new CnbError(res.status, `读取文件失败：${path}（${res.status}）`);
	}
	return await res.text();
}

/**
 * 递归列出某目录下所有 markdown 文件（.md/.mdx）的相对路径。
 */
export async function listMarkdownFiles(env, dir) {
	const result = [];
	const root = await getContents(env, dir);
	const entries = root.entries ?? [];

	const subDirTasks = [];
	for (const entry of entries) {
		if (entry.type === "tree") {
			subDirTasks.push(listMarkdownFiles(env, entry.path));
		} else if (entry.type === "blob" && /\.mdx?$/.test(entry.name)) {
			result.push(entry.path);
		}
	}
	const subResults = await Promise.all(subDirTasks);
	for (const sub of subResults) {
		result.push(...sub);
	}
	return result;
}

/**
 * 读取构建记录列表（默认 main 分支 push 事件）。
 * 端点 GET /{repo}/-/build/logs 需 token 含 scope `repo-cnb-history:r`，
 * 否则 CNB 返回 403 [NO_RIGHT]Token scope not match（2026-07-08 实测）。
 */
export async function getBuildLogs(env, opts = {}) {
	const { repo, branch } = resolveConfig(env);
	const params = new URLSearchParams();
	params.set("targetRef", opts.targetRef ?? branch);
	if (opts.event) params.set("event", opts.event);
	params.set("page_size", String(opts.pageSize ?? 20));
	const url = `${CNB_API_BASE}/${repo}/-/build/logs?${params.toString()}`;
	const res = await cnbFetch(env, url, "application/json");
	if (!res.ok) {
		throw new CnbError(res.status, `读取构建记录失败（${res.status}）`);
	}
	return await res.json();
}
