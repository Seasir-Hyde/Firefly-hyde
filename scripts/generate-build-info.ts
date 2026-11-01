// 生成构建指纹（public/build-info.json）
//
// 用途：部署到 EdgeOne 后据此确认「线上是否已经更新到本次构建」。
// 文件会随 public/ 一起进入 dist/，是部署后唯一可靠的版本标识
// （HTML 与其它静态资源在边缘有 1 天缓存，直接比对页面内容会拿到旧版本）。
//
// 用法：pnpm generate-build-info（已串入 pnpm build 的第一步）

import { execSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { siteConfig } from "@/config";

type BuildInfo = {
	/** 短 commit，作为版本标识 */
	commit: string;
	/** 完整 commit */
	fullCommit: string;
	/** 构建分支 */
	branch: string;
	/** 构建时间（ISO） */
	builtAt: string;
	/** CNB 构建 ID（本地构建为 null） */
	buildId: string | null;
	/** 站点地址，部署校验时直接使用，避免脚本再依赖站点配置 */
	siteUrl: string;
};

function git(args: string[]): string | null {
	try {
		// 注意：数组直接拼进字符串会变成逗号分隔，必须显式 join
		return execSync(`git ${args.join(" ")}`, {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		return null;
	}
}

const fullCommit = process.env.CNB_COMMIT ?? git(["rev-parse", "HEAD"]) ?? "";
const branch =
	process.env.CNB_BRANCH ?? git(["rev-parse", "--abbrev-ref", "HEAD"]) ?? "";

const buildInfo: BuildInfo = {
	commit: fullCommit ? fullCommit.slice(0, 7) : "unknown",
	fullCommit,
	branch,
	builtAt: new Date().toISOString(),
	buildId: process.env.CNB_BUILD_ID ?? null,
	siteUrl: siteConfig.site_url,
};

const target = join(process.cwd(), "public/build-info.json");
await mkdir(join(process.cwd(), "public"), { recursive: true });
await writeFile(target, `${JSON.stringify(buildInfo, null, 2)}\n`, "utf8");
console.log(
	`[构建指纹] 已生成 public/build-info.json（commit=${buildInfo.commit} branch=${branch}）`,
);
