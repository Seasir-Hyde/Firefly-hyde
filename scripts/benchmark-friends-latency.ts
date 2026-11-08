import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { getEnabledFriends } from "../src/config/friendsConfig";
import { friendsProbeConfig } from "../src/config/friendsProbeConfig";
import type { FriendLatencySnapshot } from "../src/types/friendLatency";
import { normalizeFriendLatencyUrl } from "../src/utils/friend-latency";
import { sampleFriendLatency } from "./probe-friends";

type BenchRow = {
	host: string;
	title: string;
	before: number | null;
	first: number | null;
	after: number | null;
	status: number | null;
	samples: number[];
};

function percentile(values: number[], percent: number): number {
	if (!values.length) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[
		Math.min(sorted.length - 1, Math.floor((percent / 100) * values.length))
	];
}

function average(values: number[]): number {
	if (!values.length) return 0;
	return Math.round(
		values.reduce((sum, value) => sum + value, 0) / values.length,
	);
}

function argValue(name: string): string | undefined {
	const prefix = `--${name}=`;
	const arg = process.argv
		.slice(2)
		.find((item: string) => item.startsWith(prefix));
	return arg?.slice(prefix.length);
}

async function loadSnapshot(): Promise<FriendLatencySnapshot | null> {
	try {
		const raw = await readFile(
			new URL("../src/data/friends-latency-snapshot.json", import.meta.url),
			"utf8",
		);
		return JSON.parse(raw) as FriendLatencySnapshot;
	} catch {
		return null;
	}
}

function summaryLine(label: string, values: number[]): string {
	return `| ${label} | ${values.length} | ${average(values)}ms | ${percentile(values, 50)}ms | ${percentile(values, 95)}ms | ${values.length ? Math.max(...values) : 0}ms |`;
}

async function main(): Promise<void> {
	const limit = Number(argValue("limit") ?? 0);
	const samples = Math.max(
		1,
		Number(argValue("samples") ?? friendsProbeConfig.samples),
	);
	const output = argValue("output");
	const snapshot = await loadSnapshot();
	const friends = getEnabledFriends();
	const targets = limit > 0 ? friends.slice(0, limit) : friends;

	console.info(
		`[延迟基准] 站点 ${targets.length} 个 · 采样 ${samples} 次/站 · 探测节点 ${process.env.CNB_EVENT ? "CNB" : process.env.GITHUB_ACTIONS === "true" ? "GitHub Actions" : "本地"}`,
	);

	const rows: BenchRow[] = [];
	for (const friend of targets) {
		const host = normalizeFriendLatencyUrl(friend.siteurl);
		const { samples: collected } = await sampleFriendLatency(friend.siteurl, {
			samples,
			timeoutMs: friendsProbeConfig.timeoutMs,
		});
		const ok = collected.filter((sample) => sample.ok);
		const okValues = ok.map((sample) => sample.milliseconds);
		const before = snapshot?.results[host]?.milliseconds ?? null;
		const row: BenchRow = {
			host,
			title: friend.title,
			before,
			first: okValues[0] ?? null,
			after: okValues.length
				? [...okValues].sort((a, b) => a - b)[Math.floor(okValues.length / 2)]
				: null,
			status: collected[collected.length - 1]?.httpStatus ?? null,
			samples: okValues,
		};
		rows.push(row);
		console.info(
			`  ${row.host}: before=${row.before ?? "-"} first=${row.first ?? "-"} after=${row.after ?? "-"} status=${row.status ?? "-"} samples=[${row.samples.join(",")}]`,
		);
	}

	// 只统计同时具备优化前/优化后数据的站点，保证对比口径一致
	const comparable = rows.filter(
		(row): row is BenchRow & { before: number; after: number } =>
			row.before !== null && row.after !== null,
	);
	const beforeValues = comparable.map((row) => row.before);
	const firstValues = rows
		.filter((row) => row.first !== null)
		.map((row) => row.first as number);
	const afterValues = rows
		.filter((row) => row.after !== null)
		.map((row) => row.after as number);

	const lines = [
		"# 友链探测延迟优化记录",
		"",
		`- 生成时间：${new Date().toISOString()}`,
		`- 探测节点：${process.env.CNB_EVENT ? "CNB 定时探测节点" : process.env.GITHUB_ACTIONS === "true" ? "GitHub Actions 探测节点" : "本地探测节点"}`,
		`- 采样口径：每站连续 ${samples} 次采样，取中位数`,
		`- 对比站点：${comparable.length} 个（同时存在优化前快照数据与本次测量数据）`,
		"",
		"## 整体对比",
		"",
		"| 口径 | 样本数 | 平均 | p50 | p95 | 最大 |",
		"| --- | --- | --- | --- | --- | --- |",
		summaryLine("优化前（快照 · 单次采样）", beforeValues),
		summaryLine("优化后（本次 · 中位数）", afterValues),
		summaryLine("对照（本次首次采样，旧口径）", firstValues),
		"",
		"## 逐站数据",
		"",
		"| 站点 | 优化前 | 首次采样 | 优化后（中位数） | 采样序列 |",
		"| --- | --- | --- | --- | --- |",
		...rows.map(
			(row) =>
				`| ${row.host} | ${row.before ?? "-"}ms | ${row.first ?? "-"}ms | ${row.after ?? "-"}ms | ${row.samples.join(", ")} |`,
		),
		"",
	];

	if (output) {
		await mkdir(dirname(output), { recursive: true });
		await writeFile(output, `${lines.join("\n")}\n`, "utf8");
		console.info(`[延迟基准] 报告已写入 ${output}`);
	} else {
		console.info(lines.join("\n"));
	}
}

await main();
