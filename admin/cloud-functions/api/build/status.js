/**
 * GET /api/build/status
 * 读取 CNB 最近构建记录（main 分支 push 事件）。
 */
import { CnbError, getBuildLogs } from "../../_shared/cnb.js";
import { requireAuth } from "../../_shared/requireAuth.js";
import { errorResponse, jsonResponse, methodNotAllowed } from "../../_shared/response.js";

export async function onRequestGet(context) {
	const auth = await requireAuth(context);
	if (auth instanceof Response) return auth;

	const url = new URL(context.request.url);
	const pageSize = Number.parseInt(url.searchParams.get("page_size") || "20", 10);

	try {
		const result = await getBuildLogs(context.env, {
			event: "push",
			pageSize: Number.isFinite(pageSize) ? Math.min(Math.max(pageSize, 1), 100) : 20,
		});
		const builds = (result.data ?? []).map((it) => ({
			sn: it.sn,
			status: it.status,
			commitTitle: it.commitTitle || it.title || "",
			createTime: it.createTime || "",
			duration: it.duration ?? 0,
			sha: it.sha || "",
			targetRef: it.targetRef || "",
			buildLogUrl: it.buildLogUrl || "",
			userName: it.userName || "",
		}));
		return jsonResponse({ builds, total: result.total ?? builds.length }, { cache: "no-store" });
	} catch (err) {
		if (err instanceof CnbError) {
			return errorResponse(err.status, err.message);
		}
		return errorResponse(500, "读取构建记录失败");
	}
}

export async function onRequest(context) {
	if (context.request.method !== "GET") {
		return methodNotAllowed(["GET"]);
	}
	return onRequestGet(context);
}
