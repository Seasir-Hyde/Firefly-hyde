import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import sanitizeHtml from "sanitize-html";
import { siteConfig } from "@/config";
import type { FriendLink } from "@/types/friendsConfig";
import { formatDateToYYYYMMDD } from "@/utils/date-utils";
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

function normalizeSiteUrl(url: string): string {
	return url
		.trim()
		.replace(/^https?:\/\//i, "")
		.replace(/^www\./i, "")
		.replace(/\/+$/, "")
		.toLowerCase();
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
	return (
		head.includes("<rss") ||
		head.includes("<feed") ||
		head.includes("<rdf:rdf") ||
		head.includes("<channel") ||
		head.includes("<?xml")
	);
}

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
			const publishedAt = parseDate(
				extractTag(block, ["pubDate", "published", "updated", "date"]),
			);

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

	const payload: StoredFeedSnapshot = {
		version: 2,
		sources: records
			.filter((record) => record.feedUrls.length > 0 && record.items.length > 0)
			.map((record) => ({
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
): Promise<FeedDocument | null> {
	for (let attempt = 1; attempt <= FETCH_RETRY_ATTEMPTS; attempt += 1) {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
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

		if (attempt < FETCH_RETRY_ATTEMPTS) {
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

async function tryFeedUrls(urls: string[]): Promise<{
	documents: FeedDocument[];
	items: ParsedFeedItem[];
} | null> {
	const results = await Promise.all(
		urls.map(async (url) => {
			const document = await fetchText(
				url,
				"application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8",
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

async function discoverFriendFeed(friend: FriendLink) {
	const explicitUrls = friend.rss
		? (Array.isArray(friend.rss) ? friend.rss : [friend.rss])
				.map((feedUrl) => resolveUrl(feedUrl, friend.siteurl))
				.filter(Boolean)
		: [];

	const directCandidates = explicitUrls.length
		? explicitUrls
		: DEFAULT_FEED_PATHS.map((path) => resolveUrl(path, friend.siteurl));
	const directResult = await tryFeedUrls([...new Set(directCandidates)]);
	if (directResult) return directResult;

	const homepage = await fetchText(
		friend.siteurl,
		"text/html, application/xhtml+xml;q=0.9",
	);
	if (!homepage) return null;
	const alternateUrls = findAlternateFeedUrls(homepage.text, homepage.url);
	return alternateUrls.length > 0 ? tryFeedUrls(alternateUrls) : null;
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
	cachedOnly = false,
): Promise<FriendsFeedSnapshot> {
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
			const result = cachedOnly ? null : await discoverFriendFeed(friend);
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

	if (!cachedOnly) await writeFriendsFeedSnapshot(records);

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
	options: { cachedOnly?: boolean } = {},
): Promise<FriendsFeedSnapshot> {
	const key = `${Boolean(options.cachedOnly)}:${JSON.stringify(
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
	const result = refreshFriendsFeed(friends, options.cachedOnly).catch(
		(error) => {
			feedLoads.delete(key);
			throw error;
		},
	);
	feedLoads.set(key, { expiresAt: now + 5 * 60_000, result });
	return result;
}
