// 把 isomorphic-git（及其 Node http 传输层）预打包成单个自含文件
//
// 为什么需要这一步（见 docs/admin-console-plan.md 十三章坑 4）：
//   EdgeOne Cloud Functions 部署时用自己的 esbuild 扫描所有 .js，遇到裸包名
//   import（如 "isomorphic-git"）而部署产物里没有 node_modules，就会
//   `Could not resolve` 导致整个部署失败——且 EdgeOne 只打包不装包。
//
// 解决：本地先用 esbuild 把 isomorphic-git 打成单文件 vendor bundle，产物只
//   import Node 内置模块（buffer/crypto/https/stream/zlib 等，EdgeOne esbuild
//   会自动 external）。写链路 _shared/git.js 从该 bundle 相对 import，EdgeOne
//   端不再看到任何裸包名依赖。
//
// 产物：cloud-functions/_shared/vendor/isomorphic-git.bundle.js（gitignore，CI 每次 build 重生成）

import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT = resolve(ROOT, "cloud-functions/_shared/vendor/isomorphic-git.bundle.js");

// 内联入口：只重导出写链路真正用到的两个入口
//   git   —— isomorphic-git 主 API（clone/commit/push/statusMatrix/add/remove…）
//   http  —— Node 环境的 HTTP 传输层（isomorphic-git/http/node）
const ENTRY = `
export { default as git } from "isomorphic-git";
export { default as http } from "isomorphic-git/http/node";
`;

async function main() {
	const result = await build({
		stdin: {
			contents: ENTRY,
			resolveDir: ROOT,
			sourcefile: "isomorphic-git-entry.mjs",
			loader: "js",
		},
		bundle: true,
		platform: "node",
		format: "esm",
		target: "node20",
		outfile: OUT,
		// isomorphic-git 及其依赖（safe-buffer/sha.js 等）是 CJS，会 require("buffer") 等
		// Node 内置模块。打成 ESM 时 esbuild 的 __require shim 在 ESM 下检测 require 未定义
		// 会抛 "Dynamic require of ... is not supported"。用 banner 注入 createRequire 定义
		// require（Node 20 原生），shim 即走真实 require，内置模块正常加载。
		banner: {
			js: 'import { createRequire as __cr } from "node:module";\nconst require = __cr(import.meta.url);',
		},
		// Node 内置模块保持 external（EdgeOne 运行时自带），只内联 npm 依赖
		metafile: false,
		legalComments: "none",
	});
	if (result.errors.length > 0) {
		console.error("[bundle-isomorphic-git] 打包出错：", result.errors);
		process.exitCode = 1;
		return;
	}
	console.log(`[bundle-isomorphic-git] 已生成：${OUT}`);
}

main().catch((err) => {
	console.error("[bundle-isomorphic-git] 失败：", err);
	process.exitCode = 1;
});
