// 文章 API 封装：读走 Edge Functions（CNB contents/raw），写走 Cloud Functions（git push）
// 以「相对 blog 目录的文件路径」为标识，读写对称（如 "Firefly/快速开始.md"）
import { apiClient } from "./client";

// 与后端 frontmatter 模型保持一致（edge-functions/_shared/frontmatter.ts）
export interface PostFrontmatter {
	title: string;
	published: string;
	updated?: string;
	pinned?: boolean;
	draft?: boolean;
	description?: string;
	image?: string;
	slug?: string;
	tags?: string[];
	category?: string;
	lang?: string;
	author?: string;
	sourceLink?: string;
	licenseName?: string;
	licenseUrl?: string;
	comment?: boolean;
	password?: string;
	passwordHint?: string;
	[key: string]: unknown;
}

// 列表项（不含正文）
export interface PostListItem {
	path: string;
	title: string;
	published: string;
	updated?: string;
	draft: boolean;
	pinned: boolean;
	category: string;
	tags: string[];
	description: string;
	excerpt: string;
	image: string;
}

export interface PostListResult {
	posts: PostListItem[];
	total: number;
}

// 单篇详情（含正文）
export interface PostDetail {
	path: string;
	frontmatter: PostFrontmatter;
	body: string;
}

export interface SavePostPayload {
	frontmatter: PostFrontmatter;
	body: string;
	commitMessage?: string;
	skipBuild?: boolean;
}

export interface SavePostResult {
	ok: true;
	path: string;
	commit: string;
	branch: string;
}

export interface PublishDraftsResult {
	ok: true;
	published: { path: string; title: string }[];
	commit: string | null;
	branch: string | null;
}

// 对相对路径逐段 encode，保留斜杠分隔（文件名可能含空格、中文）
function encodePath(path: string): string {
	return path
		.split("/")
		.map((seg) => encodeURIComponent(seg))
		.join("/");
}

export const postsApi = {
	list: () => apiClient.get<PostListResult>("/api/posts"),
	get: (path: string) =>
		apiClient.get<PostDetail>(`/api/posts/${encodePath(path)}`),
	save: (path: string, payload: SavePostPayload) =>
		apiClient.put<SavePostResult>(`/api/posts/${encodePath(path)}`, payload),
	remove: (path: string) =>
		apiClient.delete<SavePostResult>(`/api/posts/${encodePath(path)}`),
	/** 批量发布全部草稿：一次 commit，draft→false，触发构建 */
	publishDrafts: () =>
		apiClient.post<PublishDraftsResult>("/api/posts", {
			action: "publish-drafts",
		}),
};
