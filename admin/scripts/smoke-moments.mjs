// 阶段 3a 说说链路真机 smoke test（Node，无第三方依赖）
//
// 用法：
//   node scripts/smoke-moments.mjs <BASE_URL> <EO_TOKEN> [USERNAME] [PASSWORD]
// 例：
//   node scripts/smoke-moments.mjs https://firefly-admin-xxxx.edgeone.cool ey... zane '密码'
//
// 覆盖记忆里的「curl 测试要点」，用 fetch 手动控制重定向落地：
//   ① 先 warm up：带 ?eo_token= 访问首页，跟随 302 拿 eo cookie（EdgeOne 访问保护）
//   ② 登录 POST /api/auth/login，拿 JWT cookie（不跟随 302，直接读 Set-Cookie）
//   ③ 合并 eo + jwt cookie 调后续接口；写请求(POST/PUT/DELETE)不带 ?eo_token= 查询参数
//   ④ 逐项验证：seed → 管理端 GET/POST/PUT/DELETE → 公开只读 GET
//
// 验证重点（阶段 3a 三件套）：
//   A. Edge 能否验 Cloud Functions(node:crypto) 签发的 JWT（登录后调受保护接口不 401/545）
//   B. Edge 能否用 firefly_kv 读写 KV（seed / CRUD 返回 200 而非「KV 未绑定」500）
//   C. 按月分片逻辑（seed 后 months 含 202605；CRUD 后 total 增减正确）

const [, , BASE_RAW, EO_TOKEN, USERNAME = "zane", PASSWORD] = process.argv;

if (!BASE_RAW || !EO_TOKEN || !PASSWORD) {
	console.error(
		"用法: node scripts/smoke-moments.mjs <BASE_URL> <EO_TOKEN> [USERNAME] <PASSWORD>",
	);
	process.exit(1);
}

const BASE = BASE_RAW.replace(/\/+$/, "");

// ---------- cookie jar（极简） ----------
const jar = new Map(); // name -> value

function mergeSetCookie(res) {
	// Node fetch 的 Headers.getSetCookie() 返回数组（Node 18.14+）
	const list =
		typeof res.headers.getSetCookie === "function"
			? res.headers.getSetCookie()
			: [res.headers.get("set-cookie")].filter(Boolean);
	for (const line of list) {
		const first = line.split(";")[0];
		const idx = first.indexOf("=");
		if (idx > 0) {
			const name = first.slice(0, idx).trim();
			const value = first.slice(idx + 1).trim();
			if (value) jar.set(name, value);
			else jar.delete(name);
		}
	}
}

function cookieHeader() {
	return Array.from(jar.entries())
		.map(([k, v]) => `${k}=${v}`)
		.join("; ");
}

// 手动跟随重定向：每一跳都收集 Set-Cookie（EdgeOne 访问保护靠 302 下发 eo cookie）
async function fetchFollow(url, init = {}, maxHops = 5) {
	let current = url;
	for (let hop = 0; hop < maxHops; hop++) {
		const res = await fetch(current, {
			...init,
			redirect: "manual",
			headers: { ...(init.headers || {}), cookie: cookieHeader() },
		});
		mergeSetCookie(res);
		if (res.status >= 300 && res.status < 400) {
			const loc = res.headers.get("location");
			if (!loc) return res;
			current = new URL(loc, current).toString();
			continue;
		}
		return res;
	}
	throw new Error(`重定向过多：${url}`);
}

// 不跟随重定向（写请求用：避免 302 丢 body）
async function fetchNoRedirect(url, init = {}) {
	const res = await fetch(url, {
		...init,
		redirect: "manual",
		headers: { ...(init.headers || {}), cookie: cookieHeader() },
	});
	mergeSetCookie(res);
	return res;
}

async function readBody(res) {
	const text = await res.text();
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

let passed = 0;
let failed = 0;
function check(name, cond, detail) {
	if (cond) {
		passed++;
		console.log(`  ✅ ${name}`);
	} else {
		failed++;
		console.log(`  ❌ ${name}  ${detail != null ? `→ ${JSON.stringify(detail)}` : ""}`);
	}
}

async function main() {
	console.log(`\n[smoke] BASE=${BASE}`);

	// ① warm up：拿 eo cookie
	console.log("\n① warm up（拿 eo cookie）");
	await fetchFollow(`${BASE}/?eo_token=${encodeURIComponent(EO_TOKEN)}`);
	check("eo cookie 已获取", jar.size > 0, Array.from(jar.keys()));

	// ② 登录
	console.log("\n② 登录 /api/auth/login");
	const loginRes = await fetchNoRedirect(`${BASE}/api/auth/login`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
	});
	const loginBody = await readBody(loginRes);
	check("登录 200", loginRes.status === 200, { status: loginRes.status, body: loginBody });
	check("拿到 JWT cookie", jar.has("firefly_admin_token"), Array.from(jar.keys()));
	if (loginRes.status !== 200) {
		console.log("\n登录失败，终止。");
		return finish();
	}

	// A. Edge 验 Cloud 签的 JWT：调受保护的管理端 GET
	console.log("\n③ 管理端 GET /api/moments（验证 Edge 能验 Cloud 签的 JWT + KV 可读）");
	const listRes = await fetchFollow(`${BASE}/api/moments`);
	const listBody = await readBody(listRes);
	check("GET 200（非 401/545/500）", listRes.status === 200, { status: listRes.status, body: listBody });
	check("KV 已绑定（无「KV 未绑定」错误）", listRes.status !== 500, listBody);

	// ④ seed 种子导入
	console.log("\n④ seed POST /api/moments/seed?force=1（KV 写 + 分片）");
	const seedRes = await fetchNoRedirect(`${BASE}/api/moments/seed?force=1`, { method: "POST" });
	const seedBody = await readBody(seedRes);
	check("seed 200", seedRes.status === 200, { status: seedRes.status, body: seedBody });
	check("seed 写入 4 条", seedBody?.seeded === 4 || seedBody?.total === 4, seedBody);
	check("分片含 202605", Array.isArray(seedBody?.months) && seedBody.months.includes("202605"), seedBody?.months);

	// ⑤ 列表回读
	console.log("\n⑤ 管理端 GET 回读");
	const list2 = await readBody(await fetchFollow(`${BASE}/api/moments`));
	check("列表 total ≥ 4", (list2?.total ?? 0) >= 4, list2?.total);
	const firstId = list2?.moments?.[0]?.id;

	// ⑥ 新建
	console.log("\n⑥ 新建 POST /api/moments");
	const createRes = await fetchNoRedirect(`${BASE}/api/moments`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ content: "smoke 测试说说", date: new Date().toISOString(), tags: ["smoke"] }),
	});
	const createBody = await readBody(createRes);
	check("新建 201", createRes.status === 201, { status: createRes.status, body: createBody });
	const newId = createBody?.moment?.id;

	// ⑦ 更新
	console.log("\n⑦ 更新 PUT /api/moments");
	if (newId) {
		const updRes = await fetchNoRedirect(`${BASE}/api/moments`, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ id: newId, content: "smoke 已更新", date: new Date().toISOString(), tags: ["smoke", "updated"] }),
		});
		const updBody = await readBody(updRes);
		check("更新 200", updRes.status === 200, { status: updRes.status, body: updBody });
		check("内容已更新", updBody?.moment?.content === "smoke 已更新", updBody?.moment?.content);
	} else {
		check("更新 200", false, "无 newId，跳过");
	}

	// ⑧ 公开只读
	console.log("\n⑧ 公开只读 GET /api/public/moments");
	const pubRes = await fetchFollow(`${BASE}/api/public/moments`);
	const pubBody = await readBody(pubRes);
	check("公开 200", pubRes.status === 200, { status: pubRes.status });
	check("公开返回列表", Array.isArray(pubBody?.moments), pubBody);
	check("CORS 头存在", pubRes.headers.has("access-control-allow-origin"), null);

	// ⑨ 删除（清理 smoke 新建的那条）
	console.log("\n⑨ 删除 DELETE /api/moments（清理）");
	if (newId) {
		const delRes = await fetchNoRedirect(`${BASE}/api/moments?id=${encodeURIComponent(newId)}`, { method: "DELETE" });
		const delBody = await readBody(delRes);
		check("删除 200", delRes.status === 200, { status: delRes.status, body: delBody });
	}

	return finish();
}

function finish() {
	console.log(`\n[smoke] 完成：${passed} 通过 / ${failed} 失败`);
	process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
	console.error("\n[smoke] 异常：", err);
	process.exit(1);
});
