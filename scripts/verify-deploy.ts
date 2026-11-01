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
async function readLocalBuildInfo(): Promise<BuildInfo | null> {
	for (const path of ["dist/build-info.json", "public/build-info.json"]) {
		try {
			return JSON.parse(await readFile(path, "utf8")) as BuildInfo;
		} catch {
			// 试下一个路径
		}
	}
	return null;
}

async function main(): Promise<void> {
	const local = await readLocalBuildInfo();
	if (!local?.commit || local.commit === "unknown") {
		console.error(
			"[部署校验] 无法读取本地构建指纹（dist/build-info.json），请确认构建步骤已生成",
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
