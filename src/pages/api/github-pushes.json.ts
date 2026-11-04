import { execFileSync } from "node:child_process";
import type { APIRoute } from "astro";

export const prerender = true;

const repository = "qwc-ch/Firefly";

const readCommitDates = () => {
	try {
		return execFileSync(
			"git",
			["log", "HEAD", "--since=53 weeks ago", "--format=%cI"],
			{
				cwd: process.cwd(),
				encoding: "utf8",
			},
		)
			.split(/\r?\n/)
			.map((value) => value.trim())
			.filter(Boolean);
	} catch {
		return [];
	}
};

export const GET: APIRoute = () =>
	new Response(
		JSON.stringify({
			ok: true,
			source: "github-main-commits",
			repository,
			branch: "main",
			generatedAt: new Date().toISOString(),
			commits: readCommitDates(),
		}),
		{
			headers: {
				"Content-Type": "application/json; charset=utf-8",
				"Cache-Control": "public, max-age=300",
			},
		},
	);
