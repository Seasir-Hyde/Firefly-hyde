import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { siteConfig } from "../src/config";
import { getEnabledFriends } from "../src/config/friendsConfig";
import { friendsProbeConfig } from "../src/config/friendsProbeConfig";
import type {
	FriendLatencySnapshot,
	FriendProbeResult,
} from "../src/types/friendLatency";
import { normalizeFriendLatencyUrl } from "../src/utils/friend-latency";
import {
	fetchRemoteFriends,
	REMOTE_FRIENDS_API_URL,
} from "../src/utils/friends-feed";

const {
	timeoutMs: REQUEST_TIMEOUT_MS,
	retries: PROBE_RETRIES,
	retryBackoffMs,
	concurrency: MAX_CONCURRENT_CHECKS,
	intervalMs: REQUEST_INTERVAL_MS,
	failureRatioThreshold,
	minSuccessCount,
	snapshotRetentionDays,
} = friendsProbeConfig;

/** 快照中保留旧记录的上限：超过该天数的条目直接丢弃，避免陈旧数据长期占位 */
const STALE_ENTRY_MAX_AGE_MS = snapshotRetentionDays * 24 * 3600_000;
const snapshotUrl = new URL(
	"../src/data/friends-latency-snapshot.json",
	import.meta.url,
);

/**
 * 探测摘要文件路径。
 * CI（Linux 容器）默认落在 /tmp，流水线用同一个路径读取并注入通知内容。
 */
const summaryFile =
	process.env.PROBE_SUMMARY_FILE ??
	join(tmpdir(), "firefly-friend-probe-summary.txt");

/** 互链检测：单站页面最多读取的 HTML 字节数，避免把整个大文件下载下来。
 * 部分友链页体积超过 1MB 且友链列表靠后，留 2MB 余量避免漏判。 */
const MUTUAL_SCAN_MAX_BYTES = 2 * 1024 * 1024;
/** 首页未发现回链时，额外检查的友链页数量上限 */
const MUTUAL_FALLBACK_MAX_PAGES = 3;
/** 友链页二次检查的超时（毫秒）；部分友链页体积大、加载慢，需要比主探测更宽松 */
const MUTUAL_FALLBACK_TIMEOUT_MS = 8000;
/** 友链 JSON 接口通常体积小，但慢站可能数十 KB 且响应波动，保留 8s 上限 */
const MUTUAL_API_TIMEOUT_MS = 8000;
/** 首页未显式链接时，直接尝试的常见友链路径（/friends 最常见，其次 /friend） */
const DEFAULT_FRIEND_PAGE_PATHS = ["/friends", "/friend", "/links"];
type LinkApiProbe = {
	method: "GET" | "POST";
	path: string;
	/** 分页接口最多尝试的页数（page 参数从 1 开始） */
	pages?: number;
	body?: Record<string, unknown>;
};

/** 前端渲染站点的友链数据接口，按顺序尝试；POST 项为只读资源列表接口 */
const LINK_API_FALLBACK_PROBES: LinkApiProbe[] = [
	{ method: "GET", path: "/api/links" },
	{ method: "GET", path: "/api/public/links?pageSize=100", pages: 3 },
	{ method: "GET", path: "/api/v1/friends" },
	{ method: "GET", path: "/api/v1/friend-links" },
	{ method: "GET", path: "/api/friends" },
	{ method: "GET", path: "/api/v1/public/links/list" },
	{ method: "GET", path: "/links.json" },
	{
		method: "POST",
		path: "/api/webInfo/listResourcePath",
		body: { resourceType: "friendUrl", noPagination: true, isAdmin: false },
	},
];
/** 页面使用 Supabase 时，从内联脚本提取友链表接口 */
function getSupabaseFriendsUrl(html: string): string | null {
	const baseUrl = html.match(/SUPABASE_URL\s*=\s*["']([^"']+)["']/u)?.[1];
	const key = html.match(/SUPABASE_KEY\s*=\s*["']([^"']+)["']/u)?.[1];
	const query = html.match(/supabaseFetch\(["'](friends[^"']*)["']/u)?.[1];
	if (!baseUrl || !key || !query) return null;
	const separator = query.includes("?") ? "&" : "?";
	return `${baseUrl}/rest/v1/${query}${separator}apikey=${key}`;
}
/** 本站主机名（互链检测目标），归一化口径与页面查表保持一致 */
const OWN_SITE_KEY = normalizeFriendLatencyUrl(siteConfig.site_url);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 解码 href 中常见的 HTML 实体，保证带参数的链接也能被正确比对 */
function decodeHtmlEntities(value: string): string {
	return value
		.replace(/&#x([0-9a-f]+);/giu, (_, hex: string) =>
			String.fromCodePoint(Number.parseInt(hex, 16)),
		)
		.replace(/&#(\d+);/gu, (_, dec: string) =>
			String.fromCodePoint(Number.parseInt(dec, 10)),
		)
		.replace(/&amp;/giu, "&")
		.replace(/&quot;/giu, '"')
		.replace(/&#39;|&apos;/giu, "'")
		.replace(/&lt;/giu, "<")
		.replace(/&gt;/giu, ">");
}

/** 提取页面内所有带 href 的 <a> 标签（含锚文本，供友链页识别使用） */
function collectAnchorHrefs(
	html: string,
): Array<{ href: string; text: string }> {
	const anchors: Array<{ href: string; text: string }> = [];
	const pattern =
		/<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/giu;
	for (const match of html.matchAll(pattern)) {
		const href = decodeHtmlEntities(
			match[1] ?? match[2] ?? match[3] ?? "",
		).trim();
		if (href) anchors.push({ href, text: match[4] ?? "" });
	}
	return anchors;
}

/**
 * 提取页面中所有可能指向本站的链接值。
 * 除常规 <a href> 外，也覆盖卡片式友链页使用的
 * data-href / data-siteurl / data-url / data-link 属性。
 */
function collectLinkHrefs(html: string): string[] {
	const hrefs = collectAnchorHrefs(html).map((anchor) => anchor.href);
	const attributePattern =
		/\b(?:data-href|data-siteurl|data-url|data-link)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/giu;
	for (const match of html.matchAll(attributePattern)) {
		const href = decodeHtmlEntities(
			match[1] ?? match[2] ?? match[3] ?? "",
		).trim();
		if (href) hrefs.push(href);
	}
	return hrefs;
}

function resolveAnchorUrl(href: string, baseUrl: string): URL | null {
	try {
		return new URL(href, baseUrl);
	} catch {
		return null;
	}
}

/**
 * 判断页面 HTML 中是否包含指回本站的友链。
 * 只比对链接类属性（<a href> / data-href 等），不扫描纯文本，
 * 避免把正文里提到本站域名误判成互链。
 */
export function hasMutualLink(
	html: string,
	ownSiteUrl: string = siteConfig.site_url,
	baseUrl: string = ownSiteUrl,
): boolean {
	const ownKey = normalizeFriendLatencyUrl(ownSiteUrl);
	if (!ownKey) return false;
	for (const href of collectLinkHrefs(html)) {
		if (/^(?:mailto|tel|javascript|data):/iu.test(href)) continue;
		const target = resolveAnchorUrl(href, baseUrl);
		if (
			target &&
			/^https?:$/u.test(target.protocol) &&
			normalizeFriendLatencyUrl(target.href) === ownKey
		) {
			return true;
		}
	}
	return false;
}

/** 明确指向友链列表的路径 / 锚文本特征（优先级最高） */
const FRIEND_PAGE_STRONG_HINT =
	/(?:friend|friends|links?|blogroll|友链|友情链接)/iu;
/** 友链可能附带的通用页面路径（仅在强特征候选不足时补充） */
const FRIEND_PAGE_WEAK_HINT = /(?:about|contact|关于|联系)/iu;

/**
 * 从首页里找出可能承载友链列表的同站页面。
 * 优先选择 friend / links 等明确路径，避免被 /about/homepage 之类的
 * 通用「关于」页面占满候选名额而漏掉真正的友链页。
 */
function findFriendPageCandidates(html: string, baseUrl: string): string[] {
	const base = resolveAnchorUrl(baseUrl, baseUrl);
	if (!base) return [];
	const baseHost = base.hostname.toLowerCase().replace(/^www\./u, "");
	// 路径本身命中 friend / links 的优先级最高；只有锚文本命中的次之；
	// about / contact 仅在候选不足时兜底。
	const strongPath: string[] = [];
	const strongText: string[] = [];
	const weak: string[] = [];
	const seen = new Set<string>();
	for (const anchor of collectAnchorHrefs(html)) {
		const target = resolveAnchorUrl(anchor.href, baseUrl);
		if (!target || !/^https?:$/u.test(target.protocol)) continue;
		if (target.hostname.toLowerCase().replace(/^www\./u, "") !== baseHost) {
			continue;
		}
		const key = target.href.replace(/[#?].*$/u, "");
		if (seen.has(key)) continue;
		if (FRIEND_PAGE_STRONG_HINT.test(target.pathname)) {
			seen.add(key);
			strongPath.push(target.href);
		} else if (FRIEND_PAGE_STRONG_HINT.test(anchor.text)) {
			seen.add(key);
			strongText.push(target.href);
		} else if (
			FRIEND_PAGE_WEAK_HINT.test(`${target.pathname} ${anchor.text}`)
		) {
			seen.add(key);
			weak.push(target.href);
		}
	}
	const candidates = [...strongPath, ...strongText];
	for (const path of DEFAULT_FRIEND_PAGE_PATHS) {
		const target = resolveAnchorUrl(path, base.origin);
		if (!target) continue;
		const key = target.href.replace(/[#?].*$/u, "");
		if (seen.has(key)) continue;
		seen.add(key);
		candidates.push(target.href);
	}
	candidates.push(...weak);
	return candidates.slice(0, MUTUAL_FALLBACK_MAX_PAGES);
}

/** 读取响应体（最多 MUTUAL_SCAN_MAX_BYTES），读取中断时保留已读内容 */
async function readHtmlBody(response: Response): Promise<string> {
	const reader = response.body?.getReader();
	if (!reader) return "";
	const decoder = new TextDecoder();
	let text = "";
	let received = 0;
	try {
		while (received < MUTUAL_SCAN_MAX_BYTES) {
			const { done, value } = await reader.read();
			if (done) break;
			received += value.byteLength;
			text += decoder.decode(value, { stream: true });
		}
	} catch {
		// 读取被超时或连接中断打断时，用已读取的部分继续判断
	} finally {
		try {
			await reader.cancel();
		} catch {
			/* 响应体已结束 */
		}
	}
	return `${text}${decoder.decode()}`;
}

/** 拉取友链页并检测回链（失败返回 null，不阻塞探测主流程） */
async function fetchFriendPageForMutual(
	url: string,
): Promise<{ html: string; url: string } | null> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await reserveRequestSlot();
		// 限速等待不计入请求超时，避免大页面因排队被误判为失败
		const controller = new AbortController();
		timer = setTimeout(() => controller.abort(), MUTUAL_FALLBACK_TIMEOUT_MS);
		const response = await fetch(url, {
			method: "GET",
			cache: "no-store",
			redirect: "follow",
			headers: { "user-agent": "Aemeath-friend-latency-probe/1.0" },
			signal: controller.signal,
		});
		if (!response.ok) {
			try {
				await response.body?.cancel();
			} catch {
				/* 无需读取错误页 */
			}
			return null;
		}
		return { html: await readHtmlBody(response), url: response.url || url };
	} catch {
		return null;
	} finally {
		if (timer) clearTimeout(timer);
	}
}

/** 深度遍历 JSON，判断是否存在指向本站的 URL 字段 */
function hasOwnSiteUrlInJson(
	value: unknown,
	ownKey: string,
	baseUrl: string,
): boolean {
	if (typeof value === "string") {
		const candidate = value.trim();
		if (!/^(?:https?:)?\/\//iu.test(candidate)) return false;
		const target = resolveAnchorUrl(candidate, baseUrl);
		return (
			!!target &&
			/^https?:$/u.test(target.protocol) &&
			normalizeFriendLatencyUrl(target.href) === ownKey
		);
	}
	if (Array.isArray(value)) {
		return value.some((item) => hasOwnSiteUrlInJson(item, ownKey, baseUrl));
	}
	if (value && typeof value === "object") {
		return Object.values(value).some((item) =>
			hasOwnSiteUrlInJson(item, ownKey, baseUrl),
		);
	}
	return false;
}

/**
 * 读取前端友链数据接口；POST 仅用于只读的资源列表查询。
 * 静态 HTML 里没有友链链接的 Nuxt / Next / Vue 站点依赖这些接口。
 */
async function fetchMutualSource(
	url: string,
	method: "GET" | "POST",
	body?: Record<string, unknown>,
): Promise<string | null> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await reserveRequestSlot();
		const controller = new AbortController();
		timer = setTimeout(() => controller.abort(), MUTUAL_API_TIMEOUT_MS);
		const headers: Record<string, string> = {
			"user-agent": "Aemeath-friend-latency-probe/1.0",
			accept: "application/json",
		};
		if (body) headers["content-type"] = "application/json";
		const response = await fetch(url, {
			method,
			cache: "no-store",
			redirect: "follow",
			headers,
			body: body ? JSON.stringify(body) : undefined,
			signal: controller.signal,
		});
		if (!response.ok) {
			try {
				await response.body?.cancel();
			} catch {
				/* 无需读取错误响应 */
			}
			return null;
		}
		return await readHtmlBody(response);
	} catch {
		return null;
	} finally {
		if (timer) clearTimeout(timer);
	}
}

/** 接口返回 JSON 时，深度查找是否存在指向本站的 URL */
function jsonContainsOwnSite(text: string, baseUrl: string): boolean {
	try {
		return hasOwnSiteUrlInJson(JSON.parse(text), OWN_SITE_KEY, baseUrl);
	} catch {
		return false;
	}
}

/** 页面是否为前端渲染的友链列表（SPA 或动态友链容器） */
function hasClientRenderedFriendMarkup(html: string): boolean {
	return /__NUXT__|__NEXT_DATA__|\/_next\/|id=["']app["']|data-friend|正在加载友链/u.test(
		html,
	);
}

/**
 * 互链检测：复用延迟探测的同一次 GET 响应读取首页，避免重复请求友链站点。
 * 首页找不到时，再检查最多三个友链 / 链接页；仍找不到时读取常见友链接口，
 * 覆盖前端渲染友链列表、静态 HTML 不含链接的站点。
 */
async function detectMutualLink(response: Response): Promise<boolean> {
	const contentType = response.headers.get("content-type") ?? "";
	if (
		contentType &&
		!/^(?:text\/html|text\/plain|application\/xhtml\+xml)/iu.test(
			contentType.split(";")[0].trim(),
		)
	) {
		return false;
	}
	const pageUrl = response.url;
	const html = await readHtmlBody(response);
	if (hasMutualLink(html, siteConfig.site_url, pageUrl)) return true;
	let hasDynamicFriendPage = hasClientRenderedFriendMarkup(html);
	for (const candidate of findFriendPageCandidates(html, pageUrl)) {
		const page = await fetchFriendPageForMutual(candidate);
		if (!page) continue;
		if (hasMutualLink(page.html, siteConfig.site_url, page.url)) return true;
		hasDynamicFriendPage ||= hasClientRenderedFriendMarkup(page.html);
	}
	// 前端渲染的友链列表：链接只存在于接口返回的数据中，
	// 仅在首页或友链页面存在 SPA / 动态友链容器标记时尝试。
	if (hasDynamicFriendPage) {
		for (const probe of LINK_API_FALLBACK_PROBES) {
			const pageCount = probe.pages ?? 1;
			for (let page = 1; page <= pageCount; page += 1) {
				const path = pageCount > 1 ? `${probe.path}&page=${page}` : probe.path;
				const target = resolveAnchorUrl(path, pageUrl);
				if (!target) break;
				const apiText = await fetchMutualSource(
					target.href,
					probe.method,
					probe.body,
				);
				if (apiText && jsonContainsOwnSite(apiText, pageUrl)) return true;
			}
		}
	}
	// Supabase 模板：友链表接口与公开 anon key 内联在页面脚本中
	const supabaseUrl = getSupabaseFriendsUrl(html);
	if (supabaseUrl) {
		const apiText = await fetchMutualSource(supabaseUrl, "GET");
		if (apiText && jsonContainsOwnSite(apiText, pageUrl)) return true;
	}
	return false;
}

/**
 * 本次探测使用的节点标识。
 * CNB 定时任务与本地手动运行位于不同网络环境，标识分开便于页面提示溯源。
 */
function probeLocationOfRun(): string {
	if (process.env.CNB_EVENT) return "CNB 定时探测节点";
	if (process.env.GITHUB_ACTIONS === "true") return "GitHub Actions 探测节点";
	return "本地探测节点";
}

/**
 * 请求限速闸门：保证任意两次对友链站点的请求之间至少间隔 REQUEST_INTERVAL_MS，
 * 避免并发探测把人家小站打挂（也降低被限流后误判 down 的概率）。
 */
let nextRequestSlot = 0;
async function reserveRequestSlot(): Promise<void> {
	const now = Date.now();
	const wait = Math.max(0, nextRequestSlot - now);
	if (wait > 0) await sleep(wait);
	nextRequestSlot = Math.max(now, nextRequestSlot) + REQUEST_INTERVAL_MS;
}

/** 读取已有快照，文件缺失或损坏时返回 null */
async function readSnapshot(): Promise<FriendLatencySnapshot | null> {
	try {
		const parsed = JSON.parse(
			await readFile(snapshotUrl, "utf8"),
		) as FriendLatencySnapshot;
		return parsed && typeof parsed === "object" ? parsed : null;
	} catch {
		return null;
	}
}

export async function measureFriend(
	siteUrl: string,
	timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<FriendProbeResult> {
	const checkedAt = new Date().toISOString();
	const startedAt = performance.now();
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const url = new URL(siteUrl);
		if (!/^https?:$/u.test(url.protocol))
			throw new Error("Unsupported protocol");
		// 请求前先过限速闸门，避免并发把友链站点打挂
		await reserveRequestSlot();
		const response = await fetch(url, {
			method: "GET",
			cache: "no-store",
			redirect: "follow",
			headers: { "user-agent": "Aemeath-friend-latency-probe/1.0" },
			signal: controller.signal,
		});
		// Stop timing at the headers; the body is only read for the mutual-link scan.
		const milliseconds = Math.max(1, Math.round(performance.now() - startedAt));
		const isOwnSite = normalizeFriendLatencyUrl(siteUrl) === OWN_SITE_KEY;
		let mutual: boolean | undefined;
		if (response.ok && !isOwnSite) {
			// 互链检测与延迟探测共用同一次 GET 请求；检测异常时保持缺省，
			// 快照合并时沿用上一轮结论，不影响本次延迟结果。
			mutual = await detectMutualLink(response).catch(() => undefined);
		} else {
			try {
				await response.body?.cancel();
			} catch {
				/* Headers already received. */
			}
		}
		return {
			state: !response.ok
				? "down"
				: milliseconds < 500
					? "fast"
					: milliseconds < 1000
						? "normal"
						: "slow",
			milliseconds,
			checkedAt,
			httpStatus: response.status,
			failureReason: response.ok ? null : `HTTP ${response.status}`,
			...(mutual === undefined ? {} : { mutual, mutualCheckedAt: checkedAt }),
		};
	} catch (error) {
		return {
			state: "down",
			milliseconds: Math.max(1, Math.round(performance.now() - startedAt)),
			checkedAt,
			httpStatus: null,
			failureReason: controller.signal.aborted
				? `Timeout after ${timeoutMs}ms`
				: error instanceof Error
					? error.message
					: String(error),
		};
	} finally {
		clearTimeout(timer);
	}
}

/**
 * 单站探测（含重试）。
 *
 * 一次失败不立即判死：偶发抖动、限流、瞬时 5xx 都可能被重试救回来。
 * 重试次数耗尽才记 down，并在 failureReason 里注明尝试次数，便于页面提示。
 */
export async function probeSite(siteUrl: string): Promise<FriendProbeResult> {
	let lastResult: FriendProbeResult | null = null;
	for (let attempt = 0; attempt <= PROBE_RETRIES; attempt++) {
		if (attempt > 0) {
			// 指数退避：base * 2^(n-1)
			await sleep(retryBackoffMs * 2 ** (attempt - 1));
		}
		const result = await measureFriend(siteUrl, REQUEST_TIMEOUT_MS);
		lastResult = result;
		if (result.state !== "down") return result;
	}
	const finalResult = lastResult as FriendProbeResult;
	return {
		...finalResult,
		failureReason: `${finalResult.failureReason ?? "未知错误"}（已重试 ${PROBE_RETRIES} 次）`,
	};
}

type ProbeTarget = {
	siteurl: string;
	title: string;
	source: "local" | "remote";
};

type ProbeSummary = {
	status: "success" | "failed";
	total: number;
	failedCount: number;
	successCount: number;
	failureRatio: number;
	downList: string[];
	elapsedSeconds: string;
	probeLocation: string;
	reason: string | null;
	distribution?: { fast: number; normal: number; slow: number; down: number };
	mutualCount?: number;
};

/** 取出失联站点（最多 5 个），用于通知里点出具体对象 */
function collectDownList(results: Record<string, FriendProbeResult>): string[] {
	return Object.entries(results)
		.filter(([, result]) => result.state === "down")
		.map(([siteUrl]) => siteUrl)
		.slice(0, 5);
}

/**
 * 写出探测摘要文件。
 *
 * 第一行是给流水线通知用的一行摘要（CI 通过 exports 注入到消息模板），
 * 其后是明细，便于在流水线日志里排查。写入失败不影响探测本身。
 */
async function writeSummaryFile(summary: ProbeSummary): Promise<void> {
	const ratio = `${(summary.failureRatio * 100).toFixed(1)}%`;
	const down =
		summary.downList.length > 0
			? ` · 失联站点：${summary.downList.join("、")}${summary.failedCount > summary.downList.length ? " 等" : ""}`
			: "";
	const headline =
		summary.status === "success"
			? `成功｜${summary.total} 站 · 快 ${summary.distribution?.fast ?? 0} / 正常 ${summary.distribution?.normal ?? 0} / 慢 ${summary.distribution?.slow ?? 0} / 失联 ${summary.failedCount} · 互链 ${summary.mutualCount ?? 0} · 失败率 ${ratio} · 耗时 ${summary.elapsedSeconds}s · 快照已生成`
			: `失败｜${summary.total} 站 · 失联 ${summary.failedCount} · 互链 ${summary.mutualCount ?? 0} · 失败率 ${ratio} · 耗时 ${summary.elapsedSeconds}s · ${summary.reason ?? "探测未完成"}`;
	const detail = [
		`status=${summary.status}`,
		`total=${summary.total}`,
		`success=${summary.successCount}`,
		`failed=${summary.failedCount}`,
		`failureRatio=${ratio}`,
		`elapsed=${summary.elapsedSeconds}s`,
		`probeLocation=${summary.probeLocation}`,
		`reason=${summary.reason ?? "-"}`,
		`mutual=${summary.mutualCount ?? 0}`,
		`down=${summary.downList.join(",")}`,
	].join("\n");
	try {
		await writeFile(summaryFile, `${headline}${down}\n${detail}\n`, "utf8");
		console.info(`[友链探测] 摘要已写入 ${summaryFile}`);
		console.info(`[友链探测] 摘要：${headline}`);
	} catch (error) {
		console.warn(
			`[友链探测] 摘要写入失败：${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * 收集待探测站点：本地配置 + 远程接口（/api/friends）下发的动态友链。
 * 远程友链此前从未入队，卡片只能显示「未探测」。
 */
async function collectTargets(selectedSite?: string): Promise<ProbeTarget[]> {
	const targets: ProbeTarget[] = [];
	const seen = new Set<string>();
	const push = (
		siteurl: string,
		title: string,
		source: ProbeTarget["source"],
	) => {
		const key = normalizeFriendLatencyUrl(siteurl);
		if (!key || seen.has(key)) return;
		seen.add(key);
		targets.push({ siteurl, title, source });
	};

	for (const friend of getEnabledFriends())
		push(friend.siteurl, friend.title, "local");

	const remoteFriends = await fetchRemoteFriends(REMOTE_FRIENDS_API_URL);
	if (remoteFriends.length === 0) {
		console.warn(
			"[友链探测] 远程友链接口不可用，本次仅探测本地友链（远程卡片将显示「未探测」）",
		);
	}
	for (const friend of remoteFriends)
		push(friend.siteUrl, friend.title, "remote");

	if (!selectedSite) return targets;
	const key = normalizeFriendLatencyUrl(selectedSite);
	return targets.filter(
		(target) => normalizeFriendLatencyUrl(target.siteurl) === key,
	);
}

async function probeFriends(): Promise<void> {
	const args = process.argv.slice(2);
	const selectedSite = args.find((arg) => arg.startsWith("--site="))?.slice(7);
	const queue = await collectTargets(selectedSite);
	if (!queue.length)
		throw new Error("No enabled friends match the requested probe.");
	const total = queue.length;
	const startedAt = performance.now();
	const results: Record<string, FriendProbeResult> = {};
	let completed = 0;
	async function worker(): Promise<void> {
		while (queue.length) {
			const friend = queue.shift();
			if (!friend) return;
			results[normalizeFriendLatencyUrl(friend.siteurl)] = {
				...(await probeSite(friend.siteurl)),
				probeLocation: probeLocationOfRun(),
			};
			completed++;
			if (completed % 10 === 0 || completed === total)
				console.info(`[友链探测] 进度 ${completed}/${total}`);
		}
	}
	await Promise.all(
		Array.from({ length: Math.min(MAX_CONCURRENT_CHECKS, total) }, worker),
	);
	const diagnosticOnly = args.includes("--diagnostic-only");
	const probeLocation = probeLocationOfRun();
	const elapsedSeconds = ((performance.now() - startedAt) / 1000).toFixed(1);
	// 互链统计：本轮确认已回链本站的站点数（未检测到 / 探测失败的站点不计入）
	const mutualCount = Object.values(results).filter(
		(result) => result.mutual === true,
	).length;

	// 整轮健康度判定：失败率过高或成功数过低，说明是探测端（网络/机器）出问题，
	// 而不是友链集体失联。这种情况下本轮结果整体作废、不写入快照，
	// 并以非零退出码让 CI 触发告警，避免把「探测器故障」写成「全站失联」推上线。
	const failedCount = Object.values(results).filter(
		(result) => result.state === "down",
	).length;
	const successCount = total - failedCount;
	const failureRatio = total > 0 ? failedCount / total : 0;
	const degraded =
		// 仅整轮探测才做健康度判定：单站手动诊断（--site=）失败属于预期结果
		!selectedSite &&
		total > 0 &&
		(failureRatio > failureRatioThreshold || successCount < minSuccessCount);
	if (degraded) {
		console.error(
			`[友链探测] 探测端异常：失败 ${failedCount}/${total}（${(failureRatio * 100).toFixed(1)}%），成功 ${successCount}，` +
				`超过阈值（失败率 ${(failureRatioThreshold * 100).toFixed(0)}% / 最少成功 ${minSuccessCount}）`,
		);
		console.error("[友链探测] 本轮结果作废，不写入快照（避免误报全站失联）");
		// 失败也要留下摘要，流水线通知里才能说明失败原因与数据
		await writeSummaryFile({
			status: "failed",
			total,
			failedCount,
			successCount,
			failureRatio,
			downList: collectDownList(results),
			elapsedSeconds: elapsedSeconds,
			probeLocation,
			mutualCount,
			reason: `失败率 ${(failureRatio * 100).toFixed(1)}% 超过阈值 ${(failureRatioThreshold * 100).toFixed(0)}%，整轮结果作废，未写入快照`,
		});
		if (!diagnosticOnly) process.exit(1);
	}

	if (!diagnosticOnly) {
		// 按键合并：旧记录逐条保留（本次没探到的站点不至于整表丢失），
		// 本次探测结果覆盖同键条目。不同探测节点的结果可以共存，
		// 每条记录自带 probeLocation，页面上能看出数据来自哪个节点。
		const previous = await readSnapshot();
		const now = Date.now();
		const merged: Record<string, FriendProbeResult> = {};
		for (const [key, value] of Object.entries(previous?.results ?? {})) {
			const checkedAt = new Date(value.checkedAt ?? "").getTime();
			if (Number.isNaN(checkedAt) || now - checkedAt > STALE_ENTRY_MAX_AGE_MS)
				continue;
			merged[key] = value;
		}
		for (const [key, value] of Object.entries(results)) {
			// 本轮未完成互链检测（站点不可达 / 读取失败）时沿用上一轮结论，
			// 避免一次网络抖动把「互链」标识错误地抹掉。
			const previousResult = merged[key];
			merged[key] =
				value.mutual === undefined && previousResult?.mutual !== undefined
					? {
							...value,
							mutual: previousResult.mutual,
							mutualCheckedAt: previousResult.mutualCheckedAt,
						}
					: value;
		}
		const snapshot: FriendLatencySnapshot = {
			version: 1,
			generatedAt: new Date().toISOString(),
			probeLocation,
			results: merged,
		};
		await writeFile(
			snapshotUrl,
			`${JSON.stringify(snapshot, null, "\t")}\n`,
			"utf8",
		);
	}
	const summary = { fast: 0, normal: 0, slow: 0, down: 0 };
	for (const result of Object.values(results)) summary[result.state]++;
	console.info(
		`[友链探测] 完成 ${total} 个站点（${elapsedSeconds}s）：快 ${summary.fast} / 正常 ${summary.normal} / 慢 ${summary.slow} / 不可达 ${summary.down}（失败率 ${(failureRatio * 100).toFixed(1)}%）`,
	);
	console.info(`[友链探测] 互链检测：${mutualCount}/${total} 个站点已回链本站`);
	console.info(
		`[友链探测] summary total=${total} fast=${summary.fast} normal=${summary.normal} slow=${summary.slow} down=${summary.down} mutual=${mutualCount} degraded=${degraded}`,
	);
	console.info(
		diagnosticOnly
			? "[友链探测] 仅诊断模式，快照未改动"
			: `[友链探测] 快照已更新（${probeLocation}）`,
	);
	const problematic = Object.entries(results)
		.filter(([, result]) => result.state === "down" || result.state === "slow")
		.map(
			([siteUrl, result]) =>
				`${siteUrl}(${result.failureReason ?? (result.milliseconds ? `${result.milliseconds}ms` : "无耗时数据")})`,
		);
	if (problematic.length)
		console.warn(`[友链探测] 需关注：${problematic.join("、")}`);

	// 成功也写摘要：通知内容里的关键数字来自这里
	await writeSummaryFile({
		status: "success",
		total,
		failedCount,
		successCount,
		failureRatio,
		downList: collectDownList(results),
		elapsedSeconds,
		probeLocation,
		reason: null,
		distribution: summary,
		mutualCount,
	});
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	await probeFriends();
}
