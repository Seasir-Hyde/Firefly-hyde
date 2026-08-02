/**
 * GET / PUT /api/spec/<name>
 * 整文件文本页读写通道（Cloud Functions，Node.js 20）：关于 / 留言板 / 页脚 HTML。
 *   GET：fetch CNB raw 读白名单内文件（读 main 分支，push 后即刻可读，不必等构建）。
 *   PUT：把整文件写回并 git push（触发 CNB 流水线重建，约 3-5 分钟生效）。
 *
 * 与 posts/data 读写同一套通道（读走 _shared/cnb.js，写走 _shared/git.js）。
 *
 * ⚠️ 整文件纯文本读写：不解析 / 不序列化 frontmatter，把整个 .md 原始内容原样读写，
 * 零格式变动风险（不复用文章专用的 serializePost，那套会把 spec 的 title 从带引号改成裸值）。
 *
 * 请求体（PUT）：{ content: string, commitMessage?: string }
 * <name> 走白名单（about / guestbook），映射到固定文件名，防任意路径读写。
 * name 是纯英文标识符（非文件路径），绕开 catch-all 的中文双重编码坑。
 *
 * 鉴权：middleware.js 只做 cookie 存在性检查（坑 6），此处调 requireAuth 真正验签 JWT。
 */

import { CnbError, getRaw } from "../../_shared/cnb.js";
import { commitAndPush, GitOpError, writeRepoFile } from "../../_shared/git.js";
import { requireAuth } from "../../_shared/requireAuth.js";

// 允许读写的页面白名单：标识符 → 完整仓库相对路径（配置中心阶段 2 起不再限于 spec 目录，
// footerHtml 指向 src/config/FooterConfig.html 页脚整文件 HTML）。friends.mdx 含 JSX/export，不纳入。
const SPEC_FILES = {
	about: "src/content/spec/about.md",
	guestbook: "src/content/spec/guestbook.md",
	footerHtml: "src/config/FooterConfig.html",
};

function jsonResponse(data, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
	});
}

// 校验并取白名单内的 name，失败返回 Response，成功返回 { name, path, file }
// path 是完整仓库相对路径（内部读写用）；file 保持文件名（响应体与默认 commit message 用，
// 前端 PagesPage 以「src/content/spec/{file}」拼显示文案，file 变路径会显示错乱）。
function resolveSpec(context) {
	const name = context.params?.name;
	if (typeof name !== "string" || !Object.hasOwn(SPEC_FILES, name)) {
		return jsonResponse({ error: "不支持的页面类型" }, 400);
	}
	const path = SPEC_FILES[name];
	return { name, path, file: path.split("/").pop() };
}

// GET：读 CNB main 上的 src/content/spec/<file>，整文件原样返回 { name, file, content }
async function handleGet(context) {
	const auth = await requireAuth(context);
	if (auth instanceof Response) return auth;

	const spec = resolveSpec(context);
	if (spec instanceof Response) return spec;

	const relPath = spec.path;
	try {
		const content = await getRaw(context.env, relPath);
		return jsonResponse({ name: spec.name, file: spec.file, content });
	} catch (err) {
		const status = err instanceof CnbError ? err.status : 500;
		return jsonResponse({ error: err?.message || "读取失败" }, status);
	}
}

// PUT：把 content 整体写回 src/content/spec/<file> 并 git push
async function handlePut(context) {
	const auth = await requireAuth(context);
	if (auth instanceof Response) return auth;

	const spec = resolveSpec(context);
	if (spec instanceof Response) return spec;

	let body;
	try {
		body = await context.request.json();
	} catch {
		return jsonResponse({ error: "请求体解析失败" }, 400);
	}
	if (!body || typeof body.content !== "string") {
		return jsonResponse({ error: "缺少 content 字段" }, 400);
	}

	// 换行归一化 + 末尾保证一个换行，贴近仓库现有文件风格；其余内容原样写回不加工
	const content = `${body.content.replace(/\r\n/g, "\n").replace(/\n*$/, "")}\n`;
	const relPath = spec.path;
	const message = (body.commitMessage && String(body.commitMessage).trim()) || `页面: 更新 ${spec.file}`;

	try {
		const result = await commitAndPush(context.env, message, async (dir) => {
			await writeRepoFile(dir, relPath, content);
		});
		return jsonResponse({ ok: true, name: spec.name, commit: result.commitOid, branch: result.branch });
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
