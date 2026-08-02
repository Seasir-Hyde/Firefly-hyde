/**
 * Git 写操作（Cloud Functions，Node.js 20）
 *
 * CNB OpenAPI 不暴露文件写入接口（见 docs/admin-console-plan.md 3.6），
 * 唯一写通道是 git push。用 isomorphic-git（纯 JS，无系统 git 依赖）在 /tmp
 * 做 shallow clone → 改文件 → commit → push。
 *
 * isomorphic-git 从 vendor bundle 导入（不是裸包名 import）：EdgeOne Cloud
 * Functions 部署时用自己的 esbuild 扫所有 .js，裸包名 import 会因产物无
 * node_modules 而 `Could not resolve` 整包 fail（十三章坑 4）。vendor bundle
 * 已用本地 esbuild 预打包成单文件、只 import Node 内置模块，规避该问题。
 * 生成脚本：scripts/bundle-isomorphic-git.mjs（pnpm build / bundle:git 触发）。
 *
 * 依赖环境变量：
 *   CNB_TOKEN    —— 对博客仓库有写权限的访问令牌（同时作 git push HTTPS 凭据）
 *   CNB_USERNAME —— 令牌对应用户名（HTTPS 凭据）
 *   CNB_REPO     —— 仓库标识，如 "xiangfeng-z/Firefly-zane"
 *   CNB_BRANCH   —— 分支，默认 "main"
 *   GIT_AUTHOR_NAME / GIT_AUTHOR_EMAIL —— 提交作者（可选，有默认值）
 *
 * 性能：阶段 0 实测 shallow clone ≈ 28s，maxDuration 已配 120s 足够。
 * TODO(阶段2优化)：改用 plumbing API（readBlob/writeBlob/writeTree/writeCommit/pushRef）
 *   不 checkout 工作目录，只传目标 blob，把单次保存压到 <10s。当前实现优先保证链路正确。
 */

import { mkdtemp, rm, mkdir, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import fs from "node:fs";
import { git, http } from "./vendor/isomorphic-git.bundle.js";

const CNB_HOST = "https://cnb.cool";

function resolveConfig(env) {
	const token = env.CNB_TOKEN;
	const username = env.CNB_USERNAME;
	const repo = env.CNB_REPO;
	if (!token || !username || !repo) {
		throw new GitOpError(500, "服务器缺少 CNB_TOKEN / CNB_USERNAME / CNB_REPO 配置");
	}
	return {
		token,
		username,
		repo,
		branch: env.CNB_BRANCH || "main",
		authorName: env.GIT_AUTHOR_NAME || "Firefly Admin",
		authorEmail: env.GIT_AUTHOR_EMAIL || "admin@firefly.local",
	};
}

export class GitOpError extends Error {
	constructor(status, message) {
		super(message);
		this.name = "GitOpError";
		this.status = status;
	}
}

/**
 * 在 /tmp 做一次「clone → 变更回调 → commit → push」的完整事务。
 * @param {Record<string,string|undefined>} env
 * @param {string} commitMessage 提交信息（中文），skipBuild 时调用方自行加 [skip build] 前缀
 * @param {(workdir: string) => Promise<void>} mutate 在工作目录内改文件的回调
 * @returns {Promise<{ commitOid: string, branch: string }>}
 */
export async function commitAndPush(env, commitMessage, mutate) {
	const cfg = resolveConfig(env);
	const dir = await mkdtemp(join(tmpdir(), "firefly-admin-"));
	const url = `${CNB_HOST}/${cfg.repo}.git`;
	const onAuth = () => ({ username: cfg.username, password: cfg.token });

	try {
		await git.clone({
			fs,
			http,
			dir,
			url,
			ref: cfg.branch,
			singleBranch: true,
			depth: 1,
			onAuth,
		});

		// 执行文件变更（写/删）
		await mutate(dir);

		// 全量 add（含删除）：statusMatrix 找出变更后逐个 add/remove
		await stageAll(dir);

		const commitOid = await git.commit({
			fs,
			dir,
			message: commitMessage,
			author: { name: cfg.authorName, email: cfg.authorEmail },
		});

		await git.push({
			fs,
			http,
			dir,
			remote: "origin",
			ref: cfg.branch,
			onAuth,
		});

		return { commitOid, branch: cfg.branch };
	} catch (err) {
		if (err instanceof GitOpError) throw err;
		const msg = err && err.message ? err.message : String(err);
		throw new GitOpError(502, `git 操作失败：${msg}`);
	} finally {
		// 清理临时目录，忽略清理错误
		await rm(dir, { recursive: true, force: true }).catch(() => {});
	}
}

// 根据 statusMatrix 暂存所有变更（新增/修改/删除）
async function stageAll(dir) {
	const matrix = await git.statusMatrix({ fs, dir });
	for (const [filepath, head, workdir] of matrix) {
		// workdir === 0 表示工作区已删除该文件 → git.remove；否则 add
		if (workdir === 0) {
			await git.remove({ fs, dir, filepath });
		} else if (head !== workdir || workdir === 2) {
			await git.add({ fs, dir, filepath });
		}
	}
}

/**
 * 在工作目录写入一个文件（自动建父目录）。
 * @param {string} dir 工作目录
 * @param {string} relPath 相对仓库根的路径
 * @param {string} content 文件内容
 */
export async function writeRepoFile(dir, relPath, content) {
	const full = join(dir, relPath);
	await mkdir(dirname(full), { recursive: true });
	await writeFile(full, content, "utf8");
}

/**
 * 删除工作目录中的一个文件（文件不存在时忽略）。
 * @param {string} dir 工作目录
 * @param {string} relPath 相对仓库根的路径
 */
export async function deleteRepoFile(dir, relPath) {
	const full = join(dir, relPath);
	await unlink(full).catch(() => {});
}
