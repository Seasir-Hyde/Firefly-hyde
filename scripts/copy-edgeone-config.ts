// 生成 EdgeOne Pages 部署用的配置文件到构建产物目录。
//
// 背景：
// `edgeone pages deploy ./dist`（以及控制台手动上传 dist）只会上传 dist/ 目录，
// 仓库根目录的 edgeone.json 不会随之上传，Pages 于是退回控制台默认缓存策略
// （Cache-Control: max-age=0, must-revalidate），导致 HTML 每次都回源。
// 因此需要把缓存相关配置放进产物目录。
//
// 但产物目录里的 edgeone.json 不能带 buildCommand / outputDirectory：
// 平台看到 buildCommand 就会把它当成源码仓库，先执行构建命令，
// 而 dist/ 里没有 package.json，构建必然失败
// （ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND）。
//
// 所以这里生成一份「产物专用」的精简配置：只保留 headers 与 caches。
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(projectRoot, "edgeone.json");
const targetDir = join(projectRoot, "dist");
const target = join(targetDir, "edgeone.json");

await mkdir(targetDir, { recursive: true });

const config = JSON.parse(await readFile(source, "utf8"));

// 仅保留产物部署需要的字段；buildCommand 等构建期配置必须剔除，
// 否则平台会对 dist/ 执行 pnpm build 并因缺少 package.json 而失败。
const artifactConfig = {
	$schema: config.$schema,
	...(config.headers ? { headers: config.headers } : {}),
	...(config.caches ? { caches: config.caches } : {}),
};

await writeFile(target, `${JSON.stringify(artifactConfig, null, 2)}\n`, "utf8");
console.log(
	"edgeone.json 已生成到 dist/（产物模式：仅 headers + caches，不含 buildCommand）",
);
