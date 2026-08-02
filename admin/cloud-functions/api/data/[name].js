/**
 * GET / PUT /api/data/<name>
 * 资料数据读写通道（Cloud Functions，Node.js 20）：
 *   GET：fetch CNB raw 读 src/data/<name>.json（读 main 分支，push 后即刻可读，不必等构建）。
 *   PUT：把 src/data/<name>.json 整体写回并 git push（触发 CNB 流水线重建，约 3-5 分钟生效）。
 *
 * 与 posts 读写同一套通道（读走 _shared/cnb.js，写走 _shared/git.js）。阶段 5 ② 资料数据管理页启用。
 *
 * 请求体（PUT）：{ data: unknown, commitMessage?: string }
 * <name> 白名单校验，只允许已知的资料数据文件，防任意路径读写。
 *
 * 鉴权：middleware.js 只做 cookie 存在性检查（坑 6），此处调 requireAuth 真正验签 JWT。
 */

import { CnbError, getRaw } from "../../_shared/cnb.js";
import { commitAndPush, GitOpError, writeRepoFile } from "../../_shared/git.js";
import { requireAuth } from "../../_shared/requireAuth.js";

const DATA_DIR = "src/data";
// 允许读写的资料数据文件名白名单（阶段 4 博客前台 data JSON 化后逐步启用）
const ALLOWED_NAMES = new Set(["projects", "devices", "skills", "timeline", "friends"]);

function jsonResponse(data, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
	});
}

// 校验并取白名单内的 name，失败返回 Response，成功返回字符串
function resolveName(context) {
	const name = context.params?.name;
	if (typeof name !== "string" || !ALLOWED_NAMES.has(name)) {
		return jsonResponse({ error: "不支持的资料数据类型" }, 400);
	}
	return name;
}

// GET：读 CNB main 上的 src/data/<name>.json，解析后返回 { name, data }
async function handleGet(context) {
	const auth = await requireAuth(context);
	if (auth instanceof Response) return auth;

	const name = resolveName(context);
	if (name instanceof Response) return name;

	const relPath = `${DATA_DIR}/${name}.json`;
	try {
		const raw = await getRaw(context.env, relPath);
		let data;
		try {
			data = JSON.parse(raw);
		} catch {
			return jsonResponse({ error: `解析 ${name}.json 失败` }, 500);
		}
		return jsonResponse({ name, data });
	} catch (err) {
		const status = err instanceof CnbError ? err.status : 500;
		return jsonResponse({ error: err?.message || "读取失败" }, status);
	}
}

// PUT：把 data 整体写回 src/data/<name>.json 并 git push
async function handlePut(context) {
	const auth = await requireAuth(context);
	if (auth instanceof Response) return auth;

	const name = resolveName(context);
	if (name instanceof Response) return name;

	let body;
	try {
		body = await context.request.json();
	} catch {
		return jsonResponse({ error: "请求体解析失败" }, 400);
	}
	if (!body || !("data" in body)) {
		return jsonResponse({ error: "缺少 data 字段" }, 400);
	}

	// 2 空格缩进 + 末尾换行，贴近仓库现有 JSON 风格
	const content = `${JSON.stringify(body.data, null, 2)}\n`;
	const relPath = `${DATA_DIR}/${name}.json`;
	const message = (body.commitMessage && String(body.commitMessage).trim()) || `数据: 更新 ${name}.json`;

	try {
		const result = await commitAndPush(context.env, message, async (dir) => {
			await writeRepoFile(dir, relPath, content);
		});
		return jsonResponse({ ok: true, name, commit: result.commitOid, branch: result.branch });
	} catch (err) {
		const status = err instanceof GitOpError ? err.status : 500;
		return jsonResponse({ error: err?.message || "保存失败" }, status);
	}
}

export async function onRequest(context) {
	const method = context.request.method;
	if (method === "GET") return handleGet(context);
	if (method === "PUT") return handlePut(context);
	return jsonResponse({ error: "method_not_allowed" }, 405);
}
