import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
		// Stop timing at the headers; do not download whole homepages.
		const milliseconds = Math.max(1, Math.round(performance.now() - startedAt));
		try {
			await response.body?.cancel();
		} catch {
			/* Headers already received. */
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

	// 整轮健康度判定：失败率过高或成功数过低，说明是探测端（网络/机器）出问题，
	// 而不是友链集体失联。这种情况下本轮结果整体作废、不写入快照，
	// 并以非零退出码让 CI 触发告警，避免把「探测器故障」写成「全站失联」推上线。
	const failedCount = Object.values(results).filter(
		(result) => result.state === "down",
	).length;
	const successCount = total - failedCount;
	const failureRatio = total > 0 ? failedCount / total : 0;
	const degraded =
		total > 0 &&
		(failureRatio > failureRatioThreshold || successCount < minSuccessCount);
	if (degraded) {
		console.error(
			`[友链探测] 探测端异常：失败 ${failedCount}/${total}（${(failureRatio * 100).toFixed(1)}%），成功 ${successCount}，` +
				`超过阈值（失败率 ${(failureRatioThreshold * 100).toFixed(0)}% / 最少成功 ${minSuccessCount}）`,
		);
		console.error("[友链探测] 本轮结果作废，不写入快照（避免误报全站失联）");
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
		Object.assign(merged, results);
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
	const elapsed = ((performance.now() - startedAt) / 1000).toFixed(1);
	console.info(
		`[友链探测] 完成 ${total} 个站点（${elapsed}s）：快 ${summary.fast} / 正常 ${summary.normal} / 慢 ${summary.slow} / 不可达 ${summary.down}（失败率 ${(failureRatio * 100).toFixed(1)}%）`,
	);
	console.info(
		`[友链探测] summary total=${total} fast=${summary.fast} normal=${summary.normal} slow=${summary.slow} down=${summary.down} degraded=${degraded}`,
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
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	await probeFriends();
}
