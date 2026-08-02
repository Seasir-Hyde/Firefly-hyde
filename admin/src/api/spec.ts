// 整文件文本页 API 封装（关于 / 留言板 / 页脚 HTML）
// 走 Git 通道（Cloud Functions）：GET 读 CNB main 白名单文件（push 后即刻可读），
// PUT 把整个文件原始内容写回并 git push（触发 CNB 流水线重建，约 3-5 分钟生效）。
// 与后端 cloud-functions/api/spec/[name].js 白名单保持一致。
//
// 整文件纯文本模型：不解析 / 不序列化 frontmatter，content 是整个文件原始字符串。
import { apiClient } from "./client";

// 白名单内的页面标识符（与后端 SPEC_FILES 的 key 一致）
export type SpecName = "about" | "guestbook" | "footerHtml";

// 各 name 在仓库中的完整相对路径（用于前端显示；后端响应 file 仅 basename 兼容）
export const SPEC_REPO_PATHS: Record<SpecName, string> = {
	about: "src/content/spec/about.md",
	guestbook: "src/content/spec/guestbook.md",
	footerHtml: "src/config/FooterConfig.html",
};

// GET 返回体：整文件原始内容（file 为 basename，与阶段 2 后端兼容）
export interface SpecPageDetail {
	name: SpecName;
	file: string;
	content: string;
}

// PUT 返回体
export interface SpecSaveResult {
	ok: true;
	name: SpecName;
	commit: string;
	branch: string;
}

export const specApi = {
	// 读某个页面的整文件内容
	get: (name: SpecName) => apiClient.get<SpecPageDetail>(`/api/spec/${name}`),
	// 整文件写回并触发构建
	save: (name: SpecName, content: string, commitMessage?: string) =>
		apiClient.put<SpecSaveResult>(`/api/spec/${name}`, {
			content,
			commitMessage,
		}),
};
