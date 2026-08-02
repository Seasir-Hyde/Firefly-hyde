// 组装 EdgeOne Makers CLI 手动构建部署所需的产物目录 deploy-dist/
// 内容：Vite 静态产物 + edge-functions/ + cloud-functions/ + middleware.js + edgeone.json + package.json
// 参见：https://pages.edgeone.ai/zh/document/edgeone-cli

import { cp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DIST = resolve(ROOT, "dist");
const OUT = resolve(ROOT, "deploy-dist");

function log(msg) {
	console.log(`[build-deploy-dist] ${msg}`);
}

async function copyIfExists(src, dst) {
	if (!existsSync(src)) {
		log(`跳过（不存在）：${src}`);
		return;
	}
	await cp(src, dst, { recursive: true });
	log(`已复制：${src} → ${dst}`);
}

async function main() {
	if (!existsSync(DIST)) {
		throw new Error(`未找到 Vite 产物目录：${DIST}，请先执行 pnpm build:vite`);
	}

	// 清空并重建 deploy-dist
	if (existsSync(OUT)) await rm(OUT, { recursive: true, force: true });
	await mkdir(OUT, { recursive: true });

	// 守卫：写链路依赖 isomorphic-git 预打包产物（见十三章坑 4）。
	// 缺失通常是漏跑 bundle:git 步骤——此处早失败并给出明确指引，避免部署后运行时才炸。
	const VENDOR_BUNDLE = resolve(
		ROOT,
		"cloud-functions/_shared/vendor/isomorphic-git.bundle.js",
	);
	if (!existsSync(VENDOR_BUNDLE)) {
		throw new Error(
			`未找到 isomorphic-git 打包产物：${VENDOR_BUNDLE}\n请先执行 pnpm bundle:git（或用 pnpm build 走完整流程）`,
		);
	}

	// 复制静态产物
	await cp(DIST, OUT, { recursive: true });
	log(`已复制 Vite 产物：${DIST} → ${OUT}`);

	// 复制函数、中间件、edgeone.json
	await copyIfExists(
		resolve(ROOT, "edge-functions"),
		resolve(OUT, "edge-functions"),
	);
	await copyIfExists(
		resolve(ROOT, "cloud-functions"),
		resolve(OUT, "cloud-functions"),
	);
	await copyIfExists(
		resolve(ROOT, "middleware.js"),
		resolve(OUT, "middleware.js"),
	);
	await copyIfExists(
		resolve(ROOT, "edgeone.json"),
		resolve(OUT, "edgeone.json"),
	);

	// EdgeOne CLI 手动部署要求产物根目录含 package.json；这里写一份最小占位，
	// 真正的 Cloud Functions 依赖声明在 cloud-functions/package.json 中。
	const rootPkgSrc = resolve(ROOT, "package.json");
	const rootPkg = JSON.parse(await readFile(rootPkgSrc, "utf8"));
	const deployPkg = {
		name: rootPkg.name,
		private: true,
		version: rootPkg.version,
		type: "module",
	};
	await writeFile(
		resolve(OUT, "package.json"),
		`${JSON.stringify(deployPkg, null, "\t")}\n`,
		"utf8",
	);
	log("已生成 deploy-dist/package.json");

	log(`部署产物已就绪：${OUT}`);
}

main().catch((err) => {
	console.error("[build-deploy-dist] 失败：", err);
	process.exitCode = 1;
});
