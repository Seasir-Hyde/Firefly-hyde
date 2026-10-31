//友链延迟检测逻辑
import { writeFile } from "node:fs/promises";
import { analyticsConfig } from "../src/config/analyticsConfig.ts";
import {
	friendsPageConfig,
	getEnabledFriends,
} from "../src/config/friendsConfig.ts";

const TIME_ZONE = "Asia/Shanghai";
const REQUEST_TIMEOUT_MS = 6000;
const MAX_CONCURRENT_CHECKS = 4;
const SNAPSHOT_URL = new URL(
	"../src/data/friends-latency-snapshot.json",
	import.meta.url,
);

type FriendLatencyState = "fast" | "normal" | "slow" | "down";

// 单站点的延迟 + 点击次数快照条目
type LatencyEntry = {
	state: FriendLatencyState;
	milliseconds?: number;
	checkedAt: string;
	httpStatus?: number | null;
	failureReason?: string | null;
	// 来自 Umami 的 friend-link-click / outbound-link-click 事件聚合（按归一化域名求和）
	clicks?: number;
};

const normalizeFriendUrl = (url: string) =>
	url
		.trim()
		.replace(/^https?:\/\//i, "")
		.replace(/^www\./i, "")
		.replace(/\/+$/, "")
		.toLowerCase();

const classifyLatency = (
	milliseconds: number,
): Exclude<FriendLatencyState, "down"> => {
	if (milliseconds < 500) return "fast";
	if (milliseconds < 1000) return "normal";
	return "slow";
};

const getBeijingSlot = () => {
	const parts = new Intl.DateTimeFormat("en-GB", {
		timeZone: TIME_ZONE,
		hour: "2-digit",
		hourCycle: "h23",
	}).formatToParts(new Date());
	const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
	return hour < 14 ? "08:17" : "20:17";
};

const measureFriend = async (siteUrl: string) => {
	const checkedAt = new Date().toISOString();
	const startedAt = Date.now();
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

	try {
		const pingUrl = new URL(siteUrl);
		if (!/^https?:$/.test(pingUrl.protocol)) {
			return {
				state: "down" as const,
				checkedAt,
				httpStatus: null,
				failureReason: `不支持的协议 ${pingUrl.protocol}`,
			};
		}
		pingUrl.searchParams.set(
			"_friend_ping",
			`${Date.now()}-${Math.random().toString(36).slice(2)}`,
		);

		const response = await fetch(pingUrl, {
			method: "GET",
			cache: "no-store",
			redirect: "follow",
			headers: { "user-agent": "rainzt.cn-friend-latency-probe/1.0" },
			signal: controller.signal,
		});
		await response.body?.cancel();

		const milliseconds = Math.max(1, Date.now() - startedAt);
		// HTTP 4xx/5xx means the site is reachable but not healthy.
		if (!response.ok) {
			return {
				state: "down" as const,
				checkedAt,
				httpStatus: response.status,
				failureReason: `HTTP ${response.status}`,
			};
		}
		return {
			state: classifyLatency(milliseconds),
			milliseconds,
			checkedAt,
			httpStatus: response.status,
			failureReason: null,
		};
	} catch (error) {
		const timedOut =
			controller.signal.aborted ||
			(error instanceof Error && error.name === "AbortError");
		return {
			state: "down" as const,
			checkedAt,
			httpStatus: null,
			failureReason: timedOut
				? `Timeout after ${REQUEST_TIMEOUT_MS}ms`
				: error instanceof Error
					? error.message
					: "Unknown error",
		};
	} finally {
		clearTimeout(timeoutId);
	}
};

// ---------- Umami 点击次数采集 ----------
const fetchUmamiShare = async (apiBase: string, shareId: string) => {
	const res = await fetch(
		`${apiBase}/api/share/${encodeURIComponent(shareId)}`,
		{
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		},
	);
	if (!res.ok) throw new Error(`Umami share ${res.status}`);
	const json: unknown = await res.json();
	const websiteId = (json as { websiteId?: string })?.websiteId;
	const token = (json as { token?: string })?.token;
	if (!websiteId || !token)
		throw new Error("Umami share 响应缺少 websiteId/token");
	return { websiteId, token };
};

const fetchUmamiEventValues = async (
	apiBase: string,
	websiteId: string,
	token: string,
	eventName: string,
	propertyName: string,
): Promise<Array<{ value?: unknown; total?: unknown }>> => {
	const url = new URL(`${apiBase}/api/websites/${websiteId}/event-data/values`);
	url.searchParams.set("startAt", "0");
	url.searchParams.set("endAt", String(Date.now()));
	url.searchParams.set("eventName", eventName);
	url.searchParams.set("propertyName", propertyName);
	url.searchParams.set("limit", "1000");
	const res = await fetch(url, {
		headers: { "x-umami-share-token": token, "x-umami-share-context": "1" },
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});
	if (!res.ok) throw new Error(`Umami event-data ${res.status}`);
	const json: unknown = await res.json();
	const rows = Array.isArray(json)
		? json
		: ((json as { data?: unknown[] })?.data ?? []);
	return rows as Array<{ value?: unknown; total?: unknown }>;
};

const fetchAllUmamiClicks = async (): Promise<Map<string, number>> => {
	const umami = analyticsConfig.umamiAnalytics;
	if (!umami?.shareId) {
		console.warn("umamiAnalytics.shareId 未配置，跳过点击次数采集");
		return new Map();
	}
	const apiBase = umami.scriptUrl ? new URL(umami.scriptUrl).origin : "";
	if (!apiBase) {
		console.warn("umamiAnalytics.scriptUrl 未配置，跳过点击次数采集");
		return new Map();
	}
	try {
		const { websiteId, token } = await fetchUmamiShare(apiBase, umami.shareId);
		const [friendClicks, outboundClicks] = await Promise.allSettled([
			fetchUmamiEventValues(
				apiBase,
				websiteId,
				token,
				"friend-link-click",
				"site",
			),
			fetchUmamiEventValues(
				apiBase,
				websiteId,
				token,
				"outbound-link-click",
				"url",
			),
		]);
		const counts = new Map<string, number>();
		const addRows = (
			rows: Array<{ value?: unknown; total?: unknown }> | undefined,
		) => {
			for (const row of rows ?? []) {
				const site = normalizeFriendUrl(String(row?.value ?? ""));
				if (!site) continue;
				counts.set(site, (counts.get(site) ?? 0) + (Number(row?.total) || 0));
			}
		};
		if (friendClicks.status === "fulfilled") addRows(friendClicks.value);
		if (outboundClicks.status === "fulfilled") addRows(outboundClicks.value);
		console.log(`Umami 点击次数采集完成：${counts.size} 个站点有点击记录`);
		return counts;
	} catch (error) {
		console.warn(
			`Umami 点击次数采集失败（${apiBase}）：${error instanceof Error ? error.message : error}`,
		);
		return new Map();
	}
};

// 远程友链接口（与 friends.astro 的 loadDynamicFriends 同源）：探测其友链，
// 动态卡片才能在浏览器端查到延迟快照
const fetchRemoteFriendUrls = async (): Promise<string[]> => {
	const siteUrl = friendsPageConfig.site?.url;
	if (!siteUrl) {
		console.warn("friendsPageConfig.site.url 未配置，跳过远程友链探测");
		return [];
	}
	const endpoint = `${siteUrl.replace(/\/+$/, "")}/api/friends`;
	try {
		const response = await fetch(endpoint, {
			cache: "no-store",
			headers: { accept: "application/json" },
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		const data: unknown = await response.json();
		const items = Array.isArray(data)
			? data
			: (data as { items?: unknown })?.items;
		if (!Array.isArray(items)) return [];
		return items
			.map((item) =>
				typeof (item as { siteUrl?: unknown })?.siteUrl === "string"
					? (item as { siteUrl: string }).siteUrl
					: "",
			)
			.filter(Boolean);
	} catch (error) {
		console.warn(
			`Remote friend list unavailable (${endpoint}): ${error instanceof Error ? error.message : error}`,
		);
		return [];
	}
};

const probeFriends = async () => {
	// 本地配置与远程接口的友链合并探测，按归一化域名去重
	const [configUrls, remoteUrls] = await Promise.all([
		Promise.resolve(getEnabledFriends().map((friend) => friend.siteurl)),
		fetchRemoteFriendUrls(),
	]);
	const seen = new Set<string>();
	const queue: string[] = [];
	for (const siteUrl of [...configUrls, ...remoteUrls]) {
		const key = normalizeFriendUrl(siteUrl);
		if (!key || seen.has(key)) continue;
		seen.add(key);
		queue.push(siteUrl);
	}
	const results: Record<string, LatencyEntry> = {};

	const worker = async () => {
		while (queue.length > 0) {
			const siteUrl = queue.shift();
			if (!siteUrl) return;
			results[normalizeFriendUrl(siteUrl)] = await measureFriend(siteUrl);
		}
	};

	await Promise.all(
		Array.from({ length: Math.min(MAX_CONCURRENT_CHECKS, queue.length) }, () =>
			worker(),
		),
	);

	// 把 Umami 点击次数并入延迟快照条目（按归一化域名对齐），缺失则不写 clicks
	const clickCounts = await fetchAllUmamiClicks();
	for (const [key, entry] of Object.entries(results)) {
		const clicks = clickCounts.get(key);
		if (typeof clicks === "number" && clicks > 0) entry.clicks = clicks;
	}

	const snapshot = {
		version: 1,
		generatedAt: new Date().toISOString(),
		probeLocation:
			process.env.GITHUB_ACTIONS === "true"
				? "GitHub Actions 探测节点"
				: "本地探测节点",
		timezone: TIME_ZONE,
		slot: getBeijingSlot(),
		results,
	};
	await writeFile(
		SNAPSHOT_URL,
		`${JSON.stringify(snapshot, null, 2)}\n`,
		"utf8",
	);
	console.log(
		`Friend latency snapshot updated: ${Object.keys(results).length} sites, ${snapshot.slot} ${TIME_ZONE}`,
	);
};

await probeFriends();
