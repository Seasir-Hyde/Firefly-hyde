import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import sanitizeHtml from "sanitize-html";
import { siteConfig } from "@/config";
import type {
	FriendLink,
	FriendUpdateEntry,
	RemoteFriendLink,
} from "@/types/friendsConfig";
import { formatDateToYYYYMMDD } from "@/utils/date-utils";
import { normalizeFriendUrl } from "@/utils/friend-url";
import { getPostUrlBySlug } from "@/utils/url-utils";

/**
 * 本站 feed 使用当前构建的文章列表。
 * content-utils 顶层依赖 astro:content，纯 Node 环境下不可用，
 * 因此这里惰性加载：只有真正需要本站 feed 时才会引入该依赖。
 */
async function loadOwnSiteFeedItems(): Promise<
	Array<{
		title: string;
		link: string;
		description: string;
		publishedAt: Date | null;
	}>
> {
	try {
		const { getSortedPostsList } = await import("@/utils/content-utils");
		const posts = await getSortedPostsList();
		return posts.slice(0, MAX_ITEMS_PER_FRIEND).map((post) => ({
			title: post.data.title,
			link: new URL(getPostUrlBySlug(post.id), siteConfig.site_url).href,
			description: cleanText(post.data.description),
			publishedAt: post.data.published,
		}));
	} catch {
		// 纯 Node 环境（快照刷新脚本）下无法读取文章集合，返回空列表即可
		return [];
	}
}

const FETCH_TIMEOUT_MS = 8000;
const FETCH_RETRY_ATTEMPTS = 3;
const FETCH_RETRY_DELAY_MS = 350;
const MAX_FEED_LENGTH = 1_500_000;
const MAX_ITEMS_PER_FRIEND = 6;
const FRIENDS_FEED_SNAPSHOT_FILE = join(
	process.cwd(),
	"src/data/friends-feed-snapshot.json",
);
const DEFAULT_FEED_PATHS = [
	"rss.xml",
	"feed.xml",
	"feed/",
	"atom.xml",
	"index.xml",
	"?feed=rss2",
];

/**
 * 远程友链接口（Supabase 边缘函数，见 scripts/hyde-Supabase-friends.js）。
 * 与本地友链的区别：数据在运行时由该接口下发，字段为驼峰命名。
 */
export const REMOTE_FRIENDS_API_URL = "https://seasir.top/api/friends";

export type FriendFeedItem = {
	friendTitle: string;
	friendUrl: string;
	avatar: string;
	title: string;
	link: string;
	description: string;
	publishedAt: Date | null;
	feedUrl: string;
};

export type FriendsFeedSnapshot = {
	items: FriendFeedItem[];
	sources: Array<{
		title: string;
		friendUrl: string;
		feedUrl: string;
		feedUrls?: string[];
		itemCount: number;
		stale: boolean;
	}>;
	checkedCount: number;
	freshSources: number;
	staleSources: number;
};

export type FriendsFeedOptions = {
	/** 只读快照缓存，不发起网络请求（本地开发用） */
	cachedOnly?: boolean;
	/** 单次请求超时（毫秒），远程友链批量抓取时可收紧以控制构建耗时 */
	timeoutMs?: number;
	/** 单个 feed 的最大尝试次数（含首次） */
	attempts?: number;
	/** 是否把本次抓取结果写入快照文件 */
	writeSnapshot?: boolean;
};

type FeedDocument = {
	url: string;
	text: string;
};

type ParsedFeedItem = {
	title: string;
	link: string;
	description: string;
	publishedAt: Date | null;
};

type FeedRecord = {
	friend: FriendLink;
	feedUrls: string[];
	items: ParsedFeedItem[];
	stale: boolean;
};

type StoredFeedItem = Omit<ParsedFeedItem, "publishedAt"> & {
	publishedAt: string | null;
};

type StoredFeedRecord = {
	friendUrl: string;
	feedUrl: string;
	feedUrls?: string[];
	items: StoredFeedItem[];
};

type StoredFeedSnapshot = {
	version: 1 | 2;
	sources: StoredFeedRecord[];
};

/**
 * 友链键归一化：统一走主机名口径，与页面查表、延迟快照保持一致。
 * 详见 utils/friend-url.ts。
 */
function normalizeSiteUrl(url: string): string {
	return normalizeFriendUrl(url);
}

/**
 * 把时间字段规整为 ISO 字符串。
 * 兼容 Unix 毫秒、Unix 秒与 ISO 字符串三种写法（边缘函数写的是 Date.now() 毫秒），
 * 无法解析时返回 null，交由调用方走兜底逻辑。
 */
function toIsoTimestamp(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	if (typeof value === "number") {
		// 0 与负数视为无效时间，避免被当成 1970 年
		if (!Number.isFinite(value) || value <= 0) return null;
		// 小于 1e11 的值按 Unix 秒处理（1e11 毫秒约等于 1973 年）
		const date = new Date(value < 1e11 ? value * 1000 : value);
		return Number.isNaN(date.getTime()) ? null : date.toISOString();
	}
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (!trimmed) return null;
		const numeric = Number(trimmed);
		if (Number.isFinite(numeric)) return toIsoTimestamp(numeric);
		const parsed = new Date(trimmed);
		return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
	}
	return null;
}

function pickString(source: Record<string, unknown>, keys: string[]): string {
	for (const key of keys) {
		const value = source[key];
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	return "";
}

function pickTags(source: Record<string, unknown>): string[] {
	const raw = source.tags;
	const normalize = (list: unknown[]): string[] =>
		list
			.filter(
				(tag): tag is string =>
					typeof tag === "string" && tag.trim().length > 0,
			)
			.map((tag) => tag.trim());
	if (Array.isArray(raw)) return normalize(raw);
	if (typeof raw === "string" && raw.trim()) {
		try {
			const parsed: unknown = JSON.parse(raw);
			if (Array.isArray(parsed)) return normalize(parsed);
		} catch {
			// 不是合法 JSON 时按逗号切分兜底
		}
		return normalize(raw.split(","));
	}
	return [];
}

/**
 * 规整远程接口下发的单条友链数据。
 * 接口字段为驼峰命名（siteUrl / imgUrl），与本地配置（siteurl / imgurl）不同，
 * 这里同时兼容两种写法，避免接口换实现后前端直接失效。
 */
export function normalizeRemoteFriend(raw: unknown): RemoteFriendLink | null {
	if (!raw || typeof raw !== "object") return null;
	const source = raw as Record<string, unknown>;
	const title = pickString(source, ["title", "name"]);
	const siteUrl = pickString(source, ["siteUrl", "siteurl", "url"]);
	if (!title || !siteUrl) return null;
	return {
		title,
		desc: pickString(source, ["desc", "description"]),
		siteUrl,
		imgUrl: pickString(source, ["imgUrl", "imgurl", "avatar", "image"]),
		tags: pickTags(source),
		weight: Number(source.weight) || 0,
		updatedAt: toIsoTimestamp(
			source.updatedAt ??
				source.updated_at ??
				source.lastUpdate ??
				source.last_update,
		),
		createdAt: toIsoTimestamp(source.createdAt ?? source.created_at),
	};
}

/**
 * 拉取远程友链列表。
 * 失败时返回空列表：页面退化为只展示本地友链，不阻塞构建与渲染。
 */
export async function fetchRemoteFriends(
	apiUrl: string = REMOTE_FRIENDS_API_URL,
	options: { timeoutMs?: number } = {},
): Promise<RemoteFriendLink[]> {
	const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetch(apiUrl, {
			signal: controller.signal,
			redirect: "follow",
			headers: {
				Accept: "application/json",
				"Cache-Control": "no-cache",
			},
		});
		if (!response.ok) return [];
		const payload: unknown = await response.json();
		const list = Array.isArray(payload)
			? payload
			: Array.isArray((payload as { items?: unknown })?.items)
				? (payload as { items: unknown[] }).items
				: Array.isArray((payload as { friends?: unknown })?.friends)
					? (payload as { friends: unknown[] }).friends
					: [];
		return list
			.map((item) => normalizeRemoteFriend(item))
			.filter((item): item is RemoteFriendLink => item !== null);
	} catch {
		return [];
	} finally {
		clearTimeout(timer);
	}
}

/** 远程友链转换为本地友链结构，以便复用同一套 RSS 抓取管线 */
export function remoteFriendToFriendLink(remote: RemoteFriendLink): FriendLink {
	return {
		title: remote.title,
		desc: remote.desc,
		siteurl: remote.siteUrl,
		imgurl: remote.imgUrl,
		tags: remote.tags,
		weight: remote.weight,
		enabled: true,
	};
}

/**
 * 汇总每个友链的最新文章时间，键为归一化后的站点域名。
 * 本地友链与远程友链共用同一份结构，前端按 URL 查表即可。
 */
export function buildFriendUpdateMap(
	feed: FriendsFeedSnapshot,
): Record<string, FriendUpdateEntry> {
	const staleFeeds = new Set(
		feed.sources
			.filter((source) => source.stale)
			.map((source) => normalizeSiteUrl(source.friendUrl)),
	);
	const updates: Record<string, FriendUpdateEntry> = {};
	for (const entry of feed.items) {
		if (!entry.publishedAt) continue;
		const key = normalizeSiteUrl(entry.friendUrl);
		const previous = updates[key];
		if (
			previous &&
			new Date(previous.date).getTime() >= entry.publishedAt.getTime()
		) {
			continue;
		}
		updates[key] = {
			date: entry.publishedAt.toISOString(),
			title: entry.title,
			stale: staleFeeds.has(key),
		};
	}
	return updates;
}

function decodeXmlEntities(value: string): string {
	const namedEntities: Record<string, string> = {
		amp: "&",
		apos: "'",
		gt: ">",
		lt: "<",
		nbsp: " ",
		quot: '"',
	};

	return value.replace(
		/&(#x[\da-f]+|#\d+|[a-z][\da-z]+);/gi,
		(_, entity: string) => {
			const normalized = entity.toLowerCase();
			if (normalized.startsWith("#x")) {
				return String.fromCodePoint(Number.parseInt(normalized.slice(2), 16));
			}
			if (normalized.startsWith("#")) {
				return String.fromCodePoint(Number.parseInt(normalized.slice(1), 10));
			}
			return namedEntities[normalized] ?? `&${entity};`;
		},
	);
}

function cleanText(value: string): string {
	const withoutCdata = value
		.replace(/^\s*<!\[CDATA\[/i, "")
		.replace(/\]\]>\s*$/i, "")
		.replace(/<script[\s\S]*?<\/script>/gi, "")
		.replace(/<style[\s\S]*?<\/style>/gi, "");
	const sanitized = sanitizeHtml(withoutCdata, {
		allowedTags: [],
		allowedAttributes: {},
	});
	return decodeXmlEntities(sanitized).replace(/\s+/g, " ").trim();
}

function extractTag(block: string, names: string[]): string {
	for (const name of names) {
		const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const match = block.match(
			new RegExp(
				`<${escapedName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapedName}>`,
				"i",
			),
		);
		if (match?.[1]) return match[1];
	}
	return "";
}

function extractAttribute(tag: string, name: string): string {
	const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const match = tag.match(
		new RegExp(`${escapedName}\\s*=\\s*["']([^"']+)["']`, "i"),
	);
	return match?.[1] ? decodeXmlEntities(match[1]) : "";
}

function resolveUrl(value: string, baseUrl: string): string {
	try {
		return new URL(decodeXmlEntities(value.trim()), baseUrl).href;
	} catch {
		return "";
	}
}

function parseDate(value: string): Date | null {
	if (!value.trim()) return null;
	const parsed = new Date(cleanText(value));
	if (Number.isNaN(parsed.getTime())) return null;
	// 排除被误解析的纪元附近时间（年份早于 2000 的日期基本是解析错误）
	if (parsed.getUTCFullYear() < 2000) return null;
	return parsed;
}

function extractItemLink(block: string, baseUrl: string): string {
	const linkTags = Array.from(block.matchAll(/<link\b[^>]*>/gi));
	for (const match of linkTags) {
		const tag = match[0];
		const href = extractAttribute(tag, "href");
		const rel = extractAttribute(tag, "rel").toLowerCase();
		if (href && rel !== "self") return resolveUrl(href, baseUrl);
	}

	const textLink = extractTag(block, ["link"]);
	if (textLink) return resolveUrl(cleanText(textLink), baseUrl);

	const guid = extractTag(block, ["guid", "id"]);
	return guid ? resolveUrl(cleanText(guid), baseUrl) : "";
}

/**
 * 判断响应体是否真的是 XML feed。
 * 部分站点探测到的 rss.xml 会返回 HTML 错误页（如 VitePress 404），
 * 直接解析会产出垃圾条目与异常时间戳，必须先排除。
 */
function looksLikeFeedDocument(text: string): boolean {
	const head = text.slice(0, 2000).toLowerCase();
	if (!head.trim()) return false;
	// 明确是 HTML 文档的响应直接排除
	if (head.includes("<!doctype html") || head.includes("<html")) return false;
	// 必须有 feed 根元素才算 feed：
	// 某些站点把 404 错误页做成 XML（如 EdgeOne 的 <Error><Tip>404 Not Found</Tip>），
	// 之前仅凭 "<?xml" 会把它当成 feed 继续解析。
	return (
		head.includes("<rss") ||
		head.includes("<feed") ||
		head.includes("<rdf:rdf") ||
		head.includes("<channel")
	);
}

/**
 * 条目时间字段的候选标签。
 * 除 RSS 2.0 的 pubDate、Atom 的 published/updated 外，
 * 还有 Dublin Core / DCTerms 命名空间写法（部分博客主题默认输出这些），
 * 之前只认无命名空间的标签，导致这类 feed 解析出条目却全部没有时间。
 */
const FEED_DATE_TAGS = [
	"pubDate",
	"published",
	"updated",
	"date",
	"dc:date",
	"dc:issued",
	"dcterms.created",
	"dcterms.modified",
];

function parseFeed(text: string, baseUrl: string): ParsedFeedItem[] {
	if (!looksLikeFeedDocument(text)) return [];

	const blocks = Array.from(
		text.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi),
	).map((match) => match[2]);

	return blocks
		.map((block) => {
			const title = cleanText(extractTag(block, ["title"]));
			const link = extractItemLink(block, baseUrl);
			const description = cleanText(
				extractTag(block, [
					"description",
					"summary",
					"content:encoded",
					"content",
				]),
			).slice(0, 320);
			const publishedAt = parseDate(extractTag(block, FEED_DATE_TAGS));

			return { title, link, description, publishedAt };
		})
		.filter((item) => item.title && item.link);
}

async function readFriendsFeedSnapshot(): Promise<
	Map<string, { feedUrls: string[]; items: ParsedFeedItem[] }>
> {
	try {
		const raw = await readFile(FRIENDS_FEED_SNAPSHOT_FILE, "utf8");
		const parsed = JSON.parse(raw) as Partial<StoredFeedSnapshot>;
		if (
			![1, 2].includes(parsed.version ?? 0) ||
			!Array.isArray(parsed.sources)
		) {
			return new Map();
		}

		return new Map(
			parsed.sources
				.filter(
					(source): source is StoredFeedRecord =>
						typeof source?.friendUrl === "string" &&
						typeof source.feedUrl === "string" &&
						Array.isArray(source.items),
				)
				.map((source) => [
					normalizeSiteUrl(source.friendUrl),
					{
						feedUrls: [
							...(Array.isArray(source.feedUrls) ? source.feedUrls : []),
							...(source.feedUrl ? [source.feedUrl] : []),
						].filter((url, index, urls) => url && urls.indexOf(url) === index),
						items: source.items
							.map((item) => ({
								title: String(item.title ?? "").trim(),
								link: String(item.link ?? "").trim(),
								description: String(item.description ?? "").trim(),
								publishedAt: item.publishedAt
									? parseDate(item.publishedAt)
									: null,
							}))
							.filter((item) => item.title && item.link),
					},
				]),
		);
	} catch {
		return new Map();
	}
}

async function writeFriendsFeedSnapshot(records: FeedRecord[]): Promise<void> {
	if (process.env.FRIENDS_FEED_WRITE_SNAPSHOT !== "1") return;

	// 同一个站点可能同时出现在本地配置与远程列表里，按归一化域名去重
	const deduped = new Map<string, FeedRecord>();
	for (const record of records) {
		if (record.feedUrls.length === 0 || record.items.length === 0) continue;
		const key = normalizeSiteUrl(record.friend.siteurl);
		const previous = deduped.get(key);
		if (!previous || record.items.length > previous.items.length) {
			deduped.set(key, record);
		}
	}

	const payload: StoredFeedSnapshot = {
		version: 2,
		sources: [...deduped.values()].map((record) => ({
			friendUrl: record.friend.siteurl,
			feedUrl: record.feedUrls[0],
			feedUrls: record.feedUrls,
			items: record.items.map((item) => ({
				title: item.title,
				link: item.link,
				description: item.description,
				publishedAt: item.publishedAt?.toISOString() ?? null,
			})),
		})),
	};
	const serialized = `${JSON.stringify(payload, null, 2)}\n`;

	let previous = "";
	try {
		previous = await readFile(FRIENDS_FEED_SNAPSHOT_FILE, "utf8");
	} catch {
		// The first refresh creates the snapshot file.
	}
	if (previous === serialized) return;

	await mkdir(dirname(FRIENDS_FEED_SNAPSHOT_FILE), { recursive: true });
	await writeFile(FRIENDS_FEED_SNAPSHOT_FILE, serialized, "utf8");
}

async function fetchText(
	url: string,
	accept: string,
	requestOptions: { timeoutMs: number; attempts: number },
): Promise<FeedDocument | null> {
	for (let attempt = 1; attempt <= requestOptions.attempts; attempt += 1) {
		const controller = new AbortController();
		const timeout = setTimeout(
			() => controller.abort(),
			requestOptions.timeoutMs,
		);
		try {
			const response = await fetch(url, {
				signal: controller.signal,
				redirect: "follow",
				headers: {
					Accept: accept,
					"Cache-Control": "no-cache",
					"User-Agent": `Firefly-Friends/1.0 (+${siteConfig.site_url}/)`,
				},
			});
			if (response.ok) {
				const text = await response.text();
				return {
					url: response.url || url,
					text: text.slice(0, MAX_FEED_LENGTH),
				};
			}

			const retryable =
				response.status === 408 ||
				response.status === 425 ||
				response.status === 429 ||
				response.status >= 500;
			if (!retryable) return null;
		} catch {
			// Network errors and timeouts are retried below, then fall back to the
			// last successful snapshot if one is available.
		} finally {
			clearTimeout(timeout);
		}

		if (attempt < requestOptions.attempts) {
			await new Promise((resolve) =>
				setTimeout(resolve, FETCH_RETRY_DELAY_MS * attempt),
			);
		}
	}

	return null;
}

function findAlternateFeedUrls(html: string, siteUrl: string): string[] {
	const urls: string[] = [];
	for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
		const tag = match[0];
		const rel = extractAttribute(tag, "rel").toLowerCase();
		const type = extractAttribute(tag, "type").toLowerCase();
		const href = extractAttribute(tag, "href");
		if (!href || !rel.split(/\s+/).includes("alternate")) continue;
		if (
			type.includes("rss") ||
			type.includes("atom") ||
			href.toLowerCase().match(/(?:rss|atom|feed|\.xml)/)
		) {
			const resolved = resolveUrl(href, siteUrl);
			if (resolved) urls.push(resolved);
		}
	}
	return [...new Set(urls)];
}

async function tryFeedUrls(
	urls: string[],
	requestOptions: { timeoutMs: number; attempts: number },
): Promise<{
	documents: FeedDocument[];
	items: ParsedFeedItem[];
} | null> {
	const results = await Promise.all(
		urls.map(async (url) => {
			const document = await fetchText(
				url,
				"application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8",
				requestOptions,
			);
			if (!document) return null;
			const items = parseFeed(document.text, document.url);
			return items.length > 0 ? { document, items } : null;
		}),
	);
	const successful = results.filter(
		(result): result is { document: FeedDocument; items: ParsedFeedItem[] } =>
			result !== null,
	);
	if (successful.length === 0) return null;

	const seenLinks = new Set<string>();
	const items: ParsedFeedItem[] = [];
	for (const result of successful) {
		for (const item of result.items) {
			if (seenLinks.has(item.link)) continue;
			seenLinks.add(item.link);
			items.push(item);
		}
	}

	return {
		documents: successful.map((result) => result.document),
		items,
	};
}

async function discoverFriendFeed(
	friend: FriendLink,
	requestOptions: { timeoutMs: number; attempts: number },
) {
	const explicitUrls = friend.rss
		? (Array.isArray(friend.rss) ? friend.rss : [friend.rss])
				.map((feedUrl) => resolveUrl(feedUrl, friend.siteurl))
				.filter(Boolean)
		: [];

	const directCandidates = explicitUrls.length
		? explicitUrls
		: DEFAULT_FEED_PATHS.map((path) => resolveUrl(path, friend.siteurl));
	const directResult = await tryFeedUrls(
		[...new Set(directCandidates)],
		requestOptions,
	);
	if (directResult) return directResult;

	const homepage = await fetchText(
		friend.siteurl,
		"text/html, application/xhtml+xml;q=0.9",
		requestOptions,
	);
	if (!homepage) return null;
	const alternateUrls = findAlternateFeedUrls(homepage.text, homepage.url);
	return alternateUrls.length > 0
		? tryFeedUrls(alternateUrls, requestOptions)
		: null;
}

async function mapWithConcurrency<T, R>(
	items: T[],
	limit: number,
	task: (item: T) => Promise<R>,
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let nextIndex = 0;

	const worker = async () => {
		while (nextIndex < items.length) {
			const index = nextIndex++;
			results[index] = await task(items[index]);
		}
	};

	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, () => worker()),
	);
	return results;
}

async function refreshFriendsFeed(
	friends: FriendLink[],
	options: FriendsFeedOptions = {},
): Promise<FriendsFeedSnapshot> {
	const { cachedOnly = false, writeSnapshot = true } = options;
	const requestOptions = {
		timeoutMs: options.timeoutMs ?? FETCH_TIMEOUT_MS,
		attempts: options.attempts ?? FETCH_RETRY_ATTEMPTS,
	};
	const previousSnapshot = await readFriendsFeedSnapshot();
	// 朋友圈按“日历日期”过滤未来文章：构建当天的文章全部保留，
	// 只有日期晚于构建当天的文章才隐藏。这样不会误伤当天稍晚发布的文章。
	const todayKey = formatDateToYYYYMMDD(new Date());
	const records = await mapWithConcurrency<FriendLink, FeedRecord>(
		friends,
		5,
		async (friend) => {
			// Use this release's posts for our own feed; the live RSS may still
			// contain a deleted article until this build has been published.
			if (
				normalizeSiteUrl(friend.siteurl) ===
				normalizeSiteUrl(siteConfig.site_url)
			) {
				const ownItems = await loadOwnSiteFeedItems();
				return {
					friend,
					feedUrls: [new URL("rss.xml", siteConfig.site_url).href],
					items: ownItems,
					stale: false,
				};
			}
			const result = cachedOnly
				? null
				: await discoverFriendFeed(friend, requestOptions);
			if (result) {
				return {
					friend,
					feedUrls: result.documents.map((document) => document.url),
					items: result.items.slice(0, MAX_ITEMS_PER_FRIEND),
					stale: false,
				};
			}

			const cached = previousSnapshot.get(normalizeSiteUrl(friend.siteurl));
			if (cached?.items.length) {
				return {
					friend,
					feedUrls: cached.feedUrls,
					items: cached.items.slice(0, MAX_ITEMS_PER_FRIEND),
					stale: true,
				};
			}

			return {
				friend,
				feedUrls: [],
				items: [],
				stale: false,
			};
		},
	);

	const seenLinks = new Set<string>();
	const items: FriendFeedItem[] = [];
	for (const record of records) {
		if (record.feedUrls.length === 0) continue;
		for (const item of record.items) {
			if (
				item.publishedAt &&
				formatDateToYYYYMMDD(item.publishedAt) > todayKey
			) {
				continue;
			}
			if (seenLinks.has(item.link)) continue;
			seenLinks.add(item.link);
			items.push({
				friendTitle: record.friend.title,
				friendUrl: record.friend.siteurl,
				avatar: record.friend.imgurl,
				title: item.title,
				link: item.link,
				description: item.description,
				publishedAt: item.publishedAt,
				feedUrl: record.feedUrls[0],
			});
		}
	}

	items.sort(
		(a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
	);

	if (!cachedOnly && writeSnapshot) await writeFriendsFeedSnapshot(records);

	const sources = records
		.filter((record) => record.feedUrls.length > 0)
		.map((record) => ({
			title: record.friend.title,
			friendUrl: record.friend.siteurl,
			feedUrl: record.feedUrls[0],
			feedUrls: record.feedUrls,
			itemCount: record.items.length,
			stale: record.stale,
		}));

	return {
		items,
		sources,
		checkedCount: friends.length,
		freshSources: sources.filter((source) => !source.stale).length,
		staleSources: sources.filter((source) => source.stale).length,
	};
}

// The friends cards and moments page share one refresh, including requests in flight.
const feedLoads = new Map<
	string,
	{ expiresAt: number; result: Promise<FriendsFeedSnapshot> }
>();
export function loadFriendsFeed(
	friends: FriendLink[],
	options: FriendsFeedOptions = {},
): Promise<FriendsFeedSnapshot> {
	const key = `${Boolean(options.cachedOnly)}:${options.timeoutMs ?? ""}:${
		options.attempts ?? ""
	}:${JSON.stringify(
		friends.map((friend) => [
			friend.siteurl,
			friend.rss,
			friend.title,
			friend.imgurl,
		]),
	)}`;
	const now = Date.now();
	for (const [cachedKey, cached] of feedLoads) {
		if (cached.expiresAt <= now) feedLoads.delete(cachedKey);
	}
	const existing = feedLoads.get(key);
	if (existing) return existing.result;
	const result = refreshFriendsFeed(friends, options).catch((error) => {
		feedLoads.delete(key);
		throw error;
	});
	feedLoads.set(key, { expiresAt: now + 5 * 60_000, result });
	return result;
}
