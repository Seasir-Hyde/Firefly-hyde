// 部署后状态确认
//
// 流程：EdgeOne Pages 部署完成后，轮询线上构建指纹 build-info.json，
// 确认「线上版本 == 本次构建的 commit」。不通过则重试若干次，
// 仍不通过则以非零退出码结束流水线，触发 failStages 告警。
//
// 为什么比对 build-info.json 而不是页面 HTML：
//   HTML 在边缘有 1 天缓存（edgeone.json 的 s-maxage=86400），
//   刚部署完去请求页面很可能仍是旧版本；而 build-info.json 走 no-store，
//   并附加随机查询串绕开缓存，是可靠的版本探针。
//
// 用法：npx tsx scripts/verify-deploy.ts

import { readFile } from "node:fs/promises";
import { friendsProbeConfig } from "../src/config/friendsProbeConfig";

type BuildInfo = {
	commit: string;
	branch?: string;
	builtAt?: string;
	siteUrl?: string;
};

const { retries, intervalMs, timeoutMs } = friendsProbeConfig.verify;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 优先读 dist/ 里的（部署产物），回退到 public/ */
const CANDIDATE_PATHS = ["dist/build-info.json", "public/build-info.json"];

async function readLocalBuildInfo(): Promise<{
	info: BuildInfo | null;
	found: boolean;
}> {
	for (const path of CANDIDATE_PATHS) {
		try {
			const info = JSON.parse(await readFile(path, "utf8")) as BuildInfo;
			return { info, found: true };
		} catch (error) {
			// 文件存在但内容不是合法 JSON：单独提示，避免误报成「未构建」
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
				console.error(
					`[部署校验] 构建指纹 ${path} 解析失败：${error instanceof Error ? error.message : String(error)}`,
				);
				return { info: null, found: true };
			}
		}
	}
	return { info: null, found: false };
}

/**
 * 校验边缘缓存没有返回旧页面。
 * 请求不带随机参数的首页，比较其 Last-Modified 与本次构建时间：
 * 命中旧缓存时 Last-Modified 会明显早于 builtAt，据此发现
 * 「部署成功、域名访问仍旧」的假阳性（build-info.json 走 no-store 无法暴露该问题）。
 */
async function verifyHtmlFreshness(
	siteUrl: string,
	builtAt?: string,
): Promise<void> {
	if (!builtAt) {
		console.warn("[部署校验] 缺少 builtAt，跳过首页缓存校验");
		return;
	}
	const builtTime = Date.parse(builtAt);
	if (Number.isNaN(builtTime)) {
		console.warn("[部署校验] builtAt 无法解析，跳过首页缓存校验");
		return;
	}

	const response = await fetch(`${siteUrl}/`, {
		signal: AbortSignal.timeout(timeoutMs),
	});
	if (!response.ok) {
		throw new Error(`首页请求失败：HTTP ${response.status}`);
	}

	const lastModified = response.headers.get("last-modified");
	const cacheStatus = response.headers.get("eo-cache-status") ?? "unknown";
	if (!lastModified) {
		console.warn("[部署校验] 首页未返回 Last-Modified，跳过缓存校验");
		return;
	}

	const lastModifiedTime = Date.parse(lastModified);
	// 留出构建开始到部署完成的时间差，避免误判
	const toleranceMs = 10 * 60 * 1000;
	if (
		Number.isNaN(lastModifiedTime) ||
		lastModifiedTime + toleranceMs < builtTime
	) {
		throw new Error(
			`首页仍是旧版本：Last-Modified=${lastModified}（缓存状态 ${cacheStatus}），早于本次构建 ${builtAt}；` +
				"请在 EdgeOne 控制台刷新 / 的缓存，并确认 edgeone.json 的 HTML 缓存策略已生效",
		);
	}
	console.log(
		`[部署校验] 首页缓存校验通过：Last-Modified=${lastModified}，缓存状态 ${cacheStatus}`,
	);
}

async function main(): Promise<void> {
	const { info: local, found } = await readLocalBuildInfo();
	if (!local) {
		if (!found) {
			console.error(
				"[部署校验] 未找到构建指纹，请先执行构建（pnpm build）。\n" +
					`  build 首步会生成 public/build-info.json 并复制到 dist/。\n` +
					`  当前工作目录：${process.cwd()}\n` +
					`  查找路径：${CANDIDATE_PATHS.join("、")}`,
			);
		} else {
			console.error(
				"[部署校验] 构建指纹内容异常（缺少有效字段），请重新执行 pnpm build 生成",
			);
		}
		process.exit(1);
	}
	if (local.commit === "unknown") {
		console.error(
			"[部署校验] 构建指纹中的 commit 为 unknown（构建环境取不到 git/CNB_COMMIT），无法比对线上版本",
		);
		process.exit(1);
	}
	const siteUrl = (local.siteUrl ?? "https://seasir.top").replace(/\/+$/, "");
	const expected = local.commit;
	console.log(
		`[部署校验] 目标站点 ${siteUrl}，期望版本 ${expected}，最多重试 ${retries} 次（间隔 ${intervalMs}ms）`,
	);

	for (let attempt = 1; attempt <= retries; attempt++) {
		// 附加随机查询串，绕开边缘缓存，避免读到旧版本
		const url = `${siteUrl}/build-info.json?t=${Date.now()}-${attempt}`;
		try {
			const response = await fetch(url, {
				headers: { "Cache-Control": "no-cache" },
				signal: AbortSignal.timeout(timeoutMs),
			});
			if (response.ok) {
				const online = (await response.json()) as BuildInfo;
				if (online.commit === expected) {
					console.log(
						`[部署校验] 通过：线上已更新到 ${expected}（第 ${attempt} 次校验，构建于 ${online.builtAt ?? "未知"}）`,
					);
					try {
						await verifyHtmlFreshness(siteUrl, local.builtAt ?? online.builtAt);
					} catch (error) {
						console.error(
							`[部署校验] 失败：${error instanceof Error ? error.message : String(error)}`,
						);
						process.exit(1);
					}
					return;
				}
				console.warn(
					`[部署校验] 第 ${attempt} 次校验：线上版本 ${online.commit} ≠ 本次 ${expected}`,
				);
			} else {
				console.warn(
					`[部署校验] 第 ${attempt} 次校验：HTTP ${response.status}`,
				);
			}
		} catch (error) {
			console.warn(
				`[部署校验] 第 ${attempt} 次校验请求失败：${error instanceof Error ? error.message : String(error)}`,
			);
		}
		if (attempt < retries) await sleep(intervalMs);
	}

	console.error(
		`[部署校验] 失败：线上在 ${(retries * intervalMs) / 1000}s 内未更新到 ${expected}`,
	);
	process.exit(1);
}

await main();
