<script lang="ts">
/**
 * 侧边栏动态组件 - 从 API 获取数据
 * 支持自定义 API 地址，方便接入第三方后端
 */
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import { onMount } from "svelte";
import { formatDynamicDate } from "@/utils/date-utils";
import { url } from "@/utils/url-utils";

interface DynamicEntry {
	id: string;
	published: number;
	html: string;
	images?: Array<{ alt: string; src: string; title?: string }>;
	searchText?: string;
}

interface Props {
	apiUrl: string;
	limit: number;
}

let { apiUrl, limit }: Props = $props();

let entries: DynamicEntry[] = $state([]);
let totalCount = $state(0);
let loading = $state(true);
let error = $state(false);

const CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

onMount(async () => {
	try {
		const cacheKey = `dynamic-cache:${apiUrl}`;
		const cached = sessionStorage.getItem(cacheKey);
		if (cached) {
			const { data, time } = JSON.parse(cached) as {
				data: DynamicEntry[];
				time: number;
			};
			if (Date.now() - time < CACHE_TTL) {
				totalCount = data.length;
				entries = data.slice(0, limit);
				loading = false;
				updateCountBadge();
				return;
			}
		}
		const response = await fetch(apiUrl);
		if (!response.ok) throw new Error("Failed to fetch");
		const data = (await response.json()) as DynamicEntry[];
		sessionStorage.setItem(
			cacheKey,
			JSON.stringify({ data, time: Date.now() }),
		);
		totalCount = data.length;
		entries = data.slice(0, limit);
		updateCountBadge();
	} catch {
		error = true;
	} finally {
		loading = false;
	}
});

function updateCountBadge() {
	const badge = document.querySelector("[data-dynamic-count]");
	if (badge && totalCount > 0) {
		badge.textContent = `(${totalCount})`;
	}
}

// 从 HTML 中提取纯文本摘要
function getPlainText(html: string): string {
	const div = document.createElement("div");
	div.innerHTML = html;
	return div.textContent?.trim() || "";
}

// 格式化日期
// 本地 API 使用 formatDynamicDate（带时区转换）
// 第三方 API 使用浏览器本地时区，不做额外转换
function formatDate(timestamp: number): string {
	if (apiUrl.startsWith("http")) {
		return new Date(timestamp).toLocaleDateString("zh-CN", {
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
		});
	}
	return formatDynamicDate(new Date(timestamp));
}
</script>

<div class="flex flex-col gap-1.5">
	{#if loading}
		<div class="flex justify-center p-3">
			<svg class="size-5 animate-spin text-(--primary)" viewBox="0 0 24 24" fill="none">
				<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" opacity="0.25"/>
				<path d="M4 12a8 8 0 018-8" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
			</svg>
		</div>
	{:else if error || entries.length === 0}
		<p class="m-0 p-3 text-center text-sm text-neutral-500">
			{i18n(I18nKey.dynamicEmpty)}
		</p>
	{:else}
		{#each entries as entry (entry.id)}
			{@const text = getPlainText(entry.html)}
			{@const image = entry.images?.[0]}
			<a
				href={url(`/dynamic/#dynamic-${entry.id}`)}
				class="group flex min-w-0 min-h-16 items-center gap-3 rounded-lg p-2
					text-neutral-700/75 dark:text-neutral-300/75
					hover:bg-(--btn-plain-bg-hover) hover:text-(--primary)
					active:bg-(--btn-plain-bg-active) transition-colors duration-150"
				aria-label={`${i18n(I18nKey.dynamic)}: ${text}`}
			>
				<div class="min-w-0 flex-1">
					<div class="mb-1 flex items-center gap-1 text-xs leading-4 text-(--primary)">
						<svg class="size-4 shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
							<path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
						</svg>
						<time datetime={new Date(entry.published).toISOString()}>
							{formatDate(entry.published)}
						</time>
					</div>
					<p class="m-0 line-clamp-3 text-sm leading-[1.35rem]">
						{text}
					</p>
				</div>
				{#if image}
					<img
						src={image.src}
						alt={image.alt}
						class="size-14 shrink-0 rounded-lg bg-(--btn-plain-bg-hover) object-cover"
						loading="lazy"
						decoding="async"
					/>
				{/if}
			</a>
		{/each}
	{/if}
</div>
