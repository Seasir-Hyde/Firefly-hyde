import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { getEnabledFriends } from "../src/config/friendsConfig";
import type {
	FriendLatencySnapshot,
	FriendProbeResult,
} from "../src/types/friendLatency";
import { normalizeFriendLatencyUrl } from "../src/utils/friend-latency";

const REQUEST_TIMEOUT_MS = 6000;
const MAX_CONCURRENT_CHECKS = 4;
const snapshotUrl = new URL(
	"../src/data/friends-latency-snapshot.json",
	import.meta.url,
);

export async function measureFriend(
	siteUrl: string,
	timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<FriendProbeResult> {
	const checkedAt = new Date().toISOString();
	const startedAt = performance.now();
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const url = new URL(siteUrl);
		if (!/^https?:$/u.test(url.protocol))
			throw new Error("Unsupported protocol");
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

async function probeFriends(): Promise<void> {
	const args = process.argv.slice(2);
	const selectedSite = args.find((arg) => arg.startsWith("--site="))?.slice(7);
	const queue = getEnabledFriends().filter(
		(friend) =>
			!selectedSite ||
			normalizeFriendLatencyUrl(friend.siteurl) ===
				normalizeFriendLatencyUrl(selectedSite),
	);
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
			results[normalizeFriendLatencyUrl(friend.siteurl)] = await measureFriend(
				friend.siteurl,
			);
			completed++;
			if (completed % 10 === 0 || completed === total)
				console.info(`[友链探测] 进度 ${completed}/${total}`);
		}
	}
	await Promise.all(
		Array.from({ length: Math.min(MAX_CONCURRENT_CHECKS, total) }, worker),
	);
	const diagnosticOnly = args.includes("--diagnostic-only");
	const probeLocation =
		process.env.GITHUB_ACTIONS === "true"
			? "GitHub Actions 探测节点"
			: "本地探测节点";
	if (!diagnosticOnly) {
		const previous = selectedSite
			? (JSON.parse(
					await readFile(snapshotUrl, "utf8"),
				) as FriendLatencySnapshot)
			: null;
		const snapshot: FriendLatencySnapshot = {
			version: 1,
			generatedAt: new Date().toISOString(),
			probeLocation,
			results: {
				...(previous?.probeLocation === probeLocation ? previous.results : {}),
				...results,
			},
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
		`[友链探测] 完成 ${total} 个站点（${elapsed}s）：快 ${summary.fast} / 正常 ${summary.normal} / 慢 ${summary.slow} / 不可达 ${summary.down}`,
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
