// 把 edgeone.json 复制到构建产物目录。
//
// 原因：`edgeone pages deploy ./dist` 只会上传 dist/ 目录，
// 仓库根目录的 edgeone.json 不会被 EdgeOne Pages 读取，
// 导致 Pages 退回默认缓存策略（Cache-Control: max-age=0, must-revalidate），
// 每次请求都回源，TTFB 被推到 2-6s。
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(projectRoot, "edgeone.json");
const targetDir = join(projectRoot, "dist");
const target = join(targetDir, "edgeone.json");

await mkdir(targetDir, { recursive: true });
await copyFile(source, target);
console.log("edgeone.json 已复制到 dist/");
