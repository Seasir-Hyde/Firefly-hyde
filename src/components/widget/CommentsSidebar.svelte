<script lang="ts">
/**
 * 侧边栏最新评论组件
 *
 * 数据获取与 analytics 页的“最近评论”模块保持一致：
 * - Twikoo：按页面路径 POST COMMENT_GET 聚合（规避部分自托管实例上
 *   GET_RECENT_COMMENTS 的 SQL 拼接缺陷），再合并、去重、按时间倒序
 * - Waline：GET /api/comment?type=recent
 * - Artalk：GET /api/v2/comments
 */
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import { onMount } from "svelte";
import { siteConfig } from "@/config";
import type { CommentConfig } from "@/types/commentConfig";
import { formatDateToYYYYMMDD } from "@/utils/date-utils";
import { url } from "@/utils/url-utils";

interface Props {
	commentConfig: CommentConfig;
	limit: number;
	authorName?: string;
	commentPaths?: string[];
}

interface RecentComment {
	id: string;
	nick: string;
	avatar?: string;
	content: string;
	createdAt: number;
	pageLabel: string;
	targetUrl: string;
}

interface TwikooRecentComment {
	id?: string | number;
	url?: string;
	nick?: string;
	avatar?: string;
	mailMd5?: string;
	comment?: string;
	created?: number;
}

interface WalineRecentComment {
	objectId?: number | string;
	nick?: string;
	avatar?: string;
	mailMd5?: string;
	comment?: string;
	insertedAt?: number | string;
	url?: string;
}

interface ArtalkRecentComment {
	id?: number | string;
	nick?: string;
	avatar?: string;
	content?: string;
	created_at?: string;
	page_url?: string;
}

const DEFAULT_COMMENT_PATHS = [
	"/guestbook",
	"/friends",
	"/moments",
	"/dynamic",
	"/about",
	"/",
];

const FETCH_TIMEOUT_MS = 8000;

const relativeTimeFormat = new Intl.RelativeTimeFormat(
	(siteConfig.lang || "zh-CN").replace(/_/gu, "-"),
	{ numeric: "auto" },
);

let {
	commentConfig,
	limit,
	authorName,
	commentPaths = DEFAULT_COMMENT_PATHS,
}: Props = $props();

let comments: RecentComment[] = $state([]);
let loading = $state(true);

onMount(() => {
	let active = true;

	(async () => {
		try {
			const result = await fetchRecentComments();
			if (active) comments = result.filter((c) => c.content).slice(0, limit);
		} catch (error) {
			console.error("[CommentsSidebar] 加载最新评论失败:", error);
		} finally {
			if (active) loading = false;
		}
	})();

	return () => {
		active = false;
	};
});

async function fetchRecentComments(): Promise<RecentComment[]> {
	switch (commentConfig.type) {
		case "twikoo":
			return fetchTwikoo();
		case "waline":
			return fetchWaline();
		case "artalk":
			return fetchArtalk();
		default:
			// giscus / disqus 没有可直接读取最近评论的公开接口
			return [];
	}
}

/** Twikoo：按页面路径并行聚合评论，逻辑与 analytics 页同源 */
async function fetchTwikoo(): Promise<RecentComment[]> {
	const config = commentConfig.twikoo;
	if (!config?.envId) return [];

	const base = config.envId.replace(/\/+$/, "");
	const paths =
		commentPaths.length > 0 ? commentPaths : DEFAULT_COMMENT_PATHS;

	const collect = async (group: string[]) => {
		const batches = await Promise.all(
			group.map(async (path) => {
				try {
					const rows = await fetchTwikooPage(base, path);
					return rows.map((row) => ({ ...row, __path: row.url || path }));
				} catch {
					return [];
				}
			}),
		);
		return batches.flat();
	};

	// 固定页面评论最集中，先取这一批；不足目标条数再补文章页，避免打满并发
	let merged = await collect(paths.slice(0, 6));
	if (merged.length < limit && paths.length > 6) {
		merged = merged.concat(await collect(paths.slice(6)));
	}

	const seen = new Set<string>();
	const unique = merged.filter((row) => {
		const key = String(row.id ?? `${row.nick}-${row.created}`);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
	unique.sort((a, b) => Number(b.created || 0) - Number(a.created || 0));

	return unique.map((row, index) =>
		normalizeComment({
			id: row.id != null ? String(row.id) : `twikoo-${index}`,
			nick: row.nick,
			avatar: row.avatar,
			avatarHash: row.mailMd5,
			content: row.comment,
			createdAt: row.created,
			path: row.__path,
		}),
	);
}

async function fetchTwikooPage(
	base: string,
	path: string,
): Promise<TwikooRecentComment[]> {
	const response = await fetch(`${base}/api/comment`, {
		method: "POST",
		headers: {
			Accept: "application/json",
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ event: "COMMENT_GET", url: path, pageSize: 20 }),
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	});
	if (!response.ok) return [];

	const payload = (await response.json()) as {
		code?: number;
		data?: TwikooRecentComment[];
	};
	if (Number(payload?.code) > 0 || !Array.isArray(payload?.data)) return [];
	return payload.data;
}

async function fetchWaline(): Promise<RecentComment[]> {
	const config = commentConfig.waline;
	if (!config?.serverURL) return [];

	const base = config.serverURL.replace(/\/+$/, "");
	const apiBase = base.endsWith("/api") ? base : `${base}/api`;
	const params = new URLSearchParams({
		type: "recent",
		count: String(limit),
		lang: config.lang || "zh-CN",
	});
	const response = await fetch(`${apiBase}/comment?${params.toString()}`, {
		headers: { Accept: "application/json" },
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	});
	if (!response.ok) {
		throw new Error(`Waline request failed: ${response.status}`);
	}

	const payload = (await response.json()) as unknown;
	const data = Array.isArray(payload)
		? (payload as WalineRecentComment[])
		: ((payload as { data?: WalineRecentComment[] })?.data ?? []);

	return data.map((item, index) =>
		normalizeComment({
			id: item.objectId != null ? String(item.objectId) : `waline-${index}`,
			nick: item.nick,
			avatar: item.avatar,
			avatarHash: item.mailMd5,
			content: item.comment,
			createdAt: item.insertedAt,
			path: item.url,
		}),
	);
}

async function fetchArtalk(): Promise<RecentComment[]> {
	const config = commentConfig.artalk;
	if (!config?.server) return [];

	const base = config.server.replace(/\/+$/, "");
	const params = new URLSearchParams({
		site_name: siteConfig.title,
		limit: String(limit),
		offset: "0",
		sort_by: "date_desc",
	});
	const response = await fetch(
		`${base}/api/v2/comments?${params.toString()}`,
		{
			headers: { Accept: "application/json" },
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		},
	);
	if (!response.ok) {
		throw new Error(`Artalk request failed: ${response.status}`);
	}

	const payload = (await response.json()) as {
		data?: { comments?: ArtalkRecentComment[] } | ArtalkRecentComment[];
	};
	const raw = payload?.data;
	const data = Array.isArray(raw) ? raw : (raw?.comments ?? []);

	return data.map((item, index) =>
		normalizeComment({
			id: item.id != null ? String(item.id) : `artalk-${index}`,
			nick: item.nick,
			avatar: item.avatar,
			content: item.content,
			createdAt: item.created_at,
			path: item.page_url,
		}),
	);
}

function normalizeComment(input: {
	id: string;
	nick?: string;
	avatar?: string;
	avatarHash?: string;
	content?: string;
	createdAt?: number | string;
	path?: string;
}): RecentComment {
	const nick = input.nick?.trim() || i18n(I18nKey.sponsorAnonymous);
	const page = getCommentPage(input.path);
	// Twikoo 1.x 常返回空 avatar，但带 mailMd5，可据此拼出 Gravatar 头像
	const gravatar = input.avatarHash
		? `https://cravatar.cn/avatar/${input.avatarHash}?s=96&d=mp&forceSet=1`
		: "";

	return {
		id: input.id,
		nick,
		avatar: safeHttpUrl(input.avatar || gravatar),
		content: toPlainText(input.content || ""),
		createdAt: toTimestamp(input.createdAt),
		pageLabel: page.label,
		targetUrl: appendCommentAnchor(page.href, input.id),
	};
}

/** 与 analytics 页一致：留言板/首页/文章/其它固定页面分别给出可读标签与链接 */
function getCommentPage(path?: string): { label: string; href: string } {
	const raw = (path || "").trim();
	if (!raw) {
		return { label: i18n(I18nKey.guestbook), href: url("/guestbook/") };
	}

	try {
		const parsed = new URL(raw, window.location.origin);
		if (parsed.origin !== window.location.origin) {
			return { label: parsed.hostname, href: parsed.href };
		}

		const pathname = parsed.pathname || "/";
		if (/^\/guestbook\/?$/u.test(pathname)) {
			return { label: i18n(I18nKey.guestbook), href: url("/guestbook/") };
		}
		if (pathname === "/") {
			return { label: i18n(I18nKey.home), href: url("/") };
		}
		if (/^\/posts\//u.test(pathname)) {
			const slug = decodeURIComponent(
				pathname.replace(/^\/posts\//u, "").replace(/\/+$/u, ""),
			);
			return {
				label: slug || pathname,
				href: url(`${pathname.replace(/\/+$/u, "")}/`),
			};
		}

		const label =
			pathname.length > 26 ? `${pathname.slice(0, 25)}…` : pathname;
		return {
			label,
			href: url(`${pathname}${parsed.search}${parsed.hash}`),
		};
	} catch {
		return { label: i18n(I18nKey.guestbook), href: url("/guestbook/") };
	}
}

function appendCommentAnchor(href: string, id?: string): string {
	if (!id) return href;
	const [base] = href.split("#");
	return `${base}#${id}`;
}

/** 将评论 HTML 转为纯文本，避免在侧栏里渲染任意标签 */
function toPlainText(html: string): string {
	if (!html) return "";
	const doc = new DOMParser().parseFromString(html, "text/html");
	return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
}

function toTimestamp(value?: number | string): number {
	if (typeof value === "number") return Number.isFinite(value) ? value : 0;
	if (!value) return 0;
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? 0 : parsed;
}

function safeHttpUrl(value?: string): string | undefined {
	if (!value) return undefined;
	try {
		const parsed = new URL(value, window.location.origin);
		return parsed.protocol === "http:" || parsed.protocol === "https:"
			? parsed.href
			: undefined;
	} catch {
		return undefined;
	}
}

function getInitial(nick: string): string {
	return nick.trim().charAt(0).toUpperCase() || "?";
}

function formatCommentTime(timestamp: number): string {
	if (!timestamp) return "";

	const elapsed = Date.now() - timestamp;
	if (elapsed < 7 * 24 * 60 * 60 * 1000) {
		if (elapsed < 60_000) return relativeTimeFormat.format(0, "second");
		if (elapsed < 3_600_000) {
			return relativeTimeFormat.format(-Math.floor(elapsed / 60_000), "minute");
		}
		if (elapsed < 86_400_000) {
			return relativeTimeFormat.format(-Math.floor(elapsed / 3_600_000), "hour");
		}
		return relativeTimeFormat.format(-Math.floor(elapsed / 86_400_000), "day");
	}
	return formatDateToYYYYMMDD(new Date(timestamp));
}

function toDateTimeAttr(timestamp: number): string | undefined {
	return timestamp ? new Date(timestamp).toISOString() : undefined;
}

function hideBrokenAvatar(event: Event) {
	(event.currentTarget as HTMLImageElement).style.display = "none";
}
</script>

<div class="flex flex-col gap-1">
	{#if loading}
		<div class="flex justify-center p-3">
			<svg
				class="size-5 animate-spin text-(--primary)"
				viewBox="0 0 24 24"
				fill="none"
				aria-hidden="true"
			>
				<circle
					cx="12"
					cy="12"
					r="10"
					stroke="currentColor"
					stroke-width="3"
					opacity="0.25"
				/>
				<path
					d="M4 12a8 8 0 018-8"
					stroke="currentColor"
					stroke-width="3"
					stroke-linecap="round"
				/>
			</svg>
		</div>
	{:else if comments.length === 0}
		<p class="m-0 p-3 text-center text-sm text-neutral-500">
			{i18n(I18nKey.commentsEmpty)}
		</p>
	{:else}
		{#each comments as comment (comment.id)}
			<a
				href={comment.targetUrl}
				class="group flex min-w-0 items-start gap-2.5 rounded-lg p-2
					text-neutral-700/75 dark:text-neutral-300/75
					hover:bg-(--btn-plain-bg-hover) hover:text-(--primary)
					active:bg-(--btn-plain-bg-active) transition-colors duration-150"
			>
				<span
					class="relative flex size-7 shrink-0 items-center justify-center overflow-hidden
						rounded-full bg-(--btn-regular-bg) text-xs font-medium text-(--primary)"
				>
					{getInitial(comment.nick)}
					{#if comment.avatar}
						<img
							src={comment.avatar}
							alt=""
							class="absolute inset-0 size-full object-cover"
							loading="lazy"
							decoding="async"
							referrerpolicy="no-referrer"
							onerror={hideBrokenAvatar}
						/>
					{/if}
				</span>
				<div class="min-w-0 flex-1">
					<div class="flex min-w-0 items-center gap-1.5">
						<span class="truncate text-sm font-medium leading-5">
							{comment.nick}
						</span>
						{#if authorName && comment.nick === authorName}
							<span
								class="shrink-0 rounded bg-(--primary)/10 px-1 py-0.5
									text-[10px] font-medium text-(--primary)"
							>
								{i18n(I18nKey.author)}
							</span>
						{/if}
					</div>
					<div
						class="mt-0.5 flex min-w-0 items-center gap-1 text-[11px]
							text-neutral-500 dark:text-neutral-400"
					>
						<span class="truncate">
							{i18n(I18nKey.commentOn)} {comment.pageLabel}
						</span>
						{#if comment.createdAt}
							<time
								class="ml-auto shrink-0"
								datetime={toDateTimeAttr(comment.createdAt)}
							>
								{formatCommentTime(comment.createdAt)}
							</time>
						{/if}
					</div>
					<p
						class="m-0 mt-0.5 line-clamp-2 break-words text-xs leading-5
							text-neutral-600 dark:text-neutral-400"
					>
						{comment.content}
					</p>
				</div>
			</a>
		{/each}
	{/if}
</div>
