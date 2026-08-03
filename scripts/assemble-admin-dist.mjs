/**
 * 组装 admin 管理后台到主博客 dist 目录
 *
 * 功能：
 * 1. 构建 admin 前端（Vite）
 * 2. 打包 isomorphic-git
 * 3. 复制 admin 产物到 dist/admin/
 * 4. 复制 edge-functions、cloud-functions、middleware.js、edgeone.json 到 dist/ 根级
 *
 * 使用方式：
 * - 在根目录 package.json 的 build 脚本中调用
 * - 需要先安装 admin 依赖：cd admin && pnpm install
 */

import { cp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const ADMIN_DIR = resolve(ROOT, "admin");
const DIST = resolve(ROOT, "dist");
const ADMIN_DIST = resolve(ADMIN_DIR, "dist");

function log(msg) {
	console.log(`[assemble-admin] ${msg}`);
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
	// 检查 admin 目录是否存在
	if (!existsSync(ADMIN_DIR)) {
		log("admin 目录不存在，跳过组装");
		return;
	}

	// 检查是否设置了 BUILD_ADMIN 环境变量
	if (process.env.BUILD_ADMIN !== "1") {
		log("未设置 BUILD_ADMIN=1，跳过 admin 构建");
		return;
	}

	log("开始组装 admin 管理后台...");

	// 1. 安装 admin 依赖（包含 devDependencies，因为构建需要 TypeScript 类型定义和 Vite）
	log("安装 admin 依赖...");
	execSync("pnpm install", {
		cwd: ADMIN_DIR,
		stdio: "inherit",
		env: { ...process.env, NODE_ENV: "development" }
	});

	// 2. 构建 admin 前端
	log("构建 admin 前端...");
	execSync("pnpm build:vite", { cwd: ADMIN_DIR, stdio: "inherit" });

	// 3. 打包 isomorphic-git
	log("打包 isomorphic-git...");
	execSync("pnpm bundle:git", { cwd: ADMIN_DIR, stdio: "inherit" });

	// 4. 创建 admin 目录在 dist 中
	const adminOut = resolve(DIST, "admin");
	if (existsSync(adminOut)) {
		await rm(adminOut, { recursive: true, force: true });
	}
	await mkdir(adminOut, { recursive: true });

	// 5. 复制 admin 前端产物到 dist/admin/
	if (existsSync(ADMIN_DIST)) {
		await cp(ADMIN_DIST, adminOut, { recursive: true });
		log(`已复制 admin 前端：${ADMIN_DIST} → ${adminOut}`);
	} else {
		throw new Error(`admin 构建产物不存在：${ADMIN_DIST}`);
	}

	// 6. 复制 edge-functions 到 dist/ 根级
	const edgeFunctions = resolve(ADMIN_DIR, "edge-functions");
	if (existsSync(edgeFunctions)) {
		await cp(edgeFunctions, resolve(DIST, "edge-functions"), { recursive: true });
		log("已复制 edge-functions");
	}

	// 7. 复制 cloud-functions 到 dist/ 根级
	const cloudFunctions = resolve(ADMIN_DIR, "cloud-functions");
	if (existsSync(cloudFunctions)) {
		await cp(cloudFunctions, resolve(DIST, "cloud-functions"), { recursive: true });
		log("已复制 cloud-functions");
	}

	// 8. 复制 middleware.js
	const middleware = resolve(ADMIN_DIR, "middleware.js");
	if (existsSync(middleware)) {
		await cp(middleware, resolve(DIST, "middleware.js"));
		log("已复制 middleware.js");
	}

	// 9. 复制 edgeone.json
	const edgeoneJson = resolve(ADMIN_DIR, "edgeone.json");
	if (existsSync(edgeoneJson)) {
		await cp(edgeoneJson, resolve(DIST, "edgeone.json"));
		log("已复制 edgeone.json");
	}

	// 10. 生成根级 package.json（EdgeOne CLI 要求）
	const adminPkgSrc = resolve(ADMIN_DIR, "package.json");
	const adminPkg = JSON.parse(await readFile(adminPkgSrc, "utf8"));
	const deployPkg = {
		name: adminPkg.name || "firefly-admin",
		private: true,
		version: adminPkg.version || "0.1.0",
		type: "module",
	};
	await writeFile(
		resolve(DIST, "package.json"),
		`${JSON.stringify(deployPkg, null, "\t")}\n`,
		"utf8",
	);
	log("已生成 dist/package.json");

	log("✅ admin 管理后台组装完成！");
}

main().catch((err) => {
	console.error("[assemble-admin] 失败：", err);
	process.exitCode = 1;
});
