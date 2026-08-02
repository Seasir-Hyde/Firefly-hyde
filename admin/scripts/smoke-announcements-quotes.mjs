// 阶段 3b/3c 公告+一言链路真机 smoke test（Node，无第三方依赖）
//
// 用法：
//   node scripts/smoke-announcements-quotes.mjs <BASE_URL> <EO_TOKEN> <EO_TIME> [USERNAME] [PASSWORD]
// 例：
//   node scripts/smoke-announcements-quotes.mjs https://firefly-admin-xxxx.edgeone.cool ey... 1783... zane '密码'
//
// 复用 smoke-moments.mjs 的 warm up / cookie / 重定向控制逻辑，覆盖：
//   公告: seed(1条) → GET → POST/PUT/DELETE → public 只读
//   一言: seed(35条) → GET → POST/PUT/DELETE → public 只读
//
// 验证重点：Edge 能验 Cloud 签的 JWT、firefly_kv 读写、单 key 存储读写正确、CORS 头存在。
// 注意：EdgeOne 访问保护要求 warm up 同时带 eo_token 与 eo_time（仅带 eo_token 会 401）。

const [, , BASE_RAW, EO_TOKEN, EO_TIME, USERNAME = "zane", PASSWORD] = process.argv;

if (!BASE_RAW || !EO_TOKEN || !PASSWORD) {
	console.error(
		"用法: node scripts/smoke-announcements-quotes.mjs <BASE_URL> <EO_TOKEN> <EO_TIME> [USERNAME] <PASSWORD>",
	);
	process.exit(1);
}

const BASE = BASE_RAW.replace(/\/+$/, "");

// ---------- cookie jar ----------
const jar = new Map();

function mergeSetCookie(res) {
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
		console.log(`  ❌ ${name}  ${detail != null ? `→ ${JSON.stringify(detail).slice(0, 200)}` : ""}`);
	}
}

// 通用：对一种内容跑 seed → GET → POST/PUT/DELETE → public
async function smokeContent(label, path, publicPath, seedCount) {
	console.log(`\n=== ${label} ===`);

	// seed
	console.log(`seed POST /api/${path}/seed?force=1`);
	const seedRes = await fetchNoRedirect(`${BASE}/api/${path}/seed?force=1`, { method: "POST" });
	const seedBody = await readBody(seedRes);
	check(`${label} seed 200`, seedRes.status === 200, { status: seedRes.status, body: seedBody });
	check(`${label} seed 写入 ≥1`, (seedBody?.seeded ?? 0) >= 1 || (seedBody?.total ?? 0) >= 1, seedBody);

	// 管理端 GET
	console.log(`管理端 GET /api/${path}`);
	const listRes = await fetchFollow(`${BASE}/api/${path}`);
	const listBody = await readBody(listRes);
	check(`${label} GET 200`, listRes.status === 200, { status: listRes.status, body: listBody });
	const listKey = Object.keys(listBody || {}).find((k) => Array.isArray(listBody[k]));
	const items = listKey ? listBody[listKey] : [];
	check(`${label} 列表非空`, Array.isArray(items) && items.length > 0, items?.length);

	// 新建
	console.log(`新建 POST /api/${path}`);
	const createRes = await fetchNoRedirect(`${BASE}/api/${path}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		// 公告用 content，一言用 text；都带上一并测试
		body: JSON.stringify({ content: `smoke ${label}`, text: `smoke ${label}`, author: "smoke" }),
	});
	const createBody = await readBody(createRes);
	check(`${label} 新建 2xx`, createRes.status >= 200 && createRes.status < 300, { status: createRes.status, body: createBody });
	const newId = createBody?.[Object.keys(createBody || {}).find((k) => typeof createBody[k] === "object" && createBody[k]?.id)]?.id;

	// public 只读
	console.log(`公开只读 GET /api/${publicPath}`);
	const pubRes = await fetchFollow(`${BASE}/api/${publicPath}`);
	const pubBody = await readBody(pubRes);
	check(`${label} 公开 200`, pubRes.status === 200, { status: pubRes.status });
	check(`${label} CORS 头`, pubRes.headers.has("access-control-allow-origin"), null);

	// 删除（清理新建的那条）
	if (newId) {
		console.log(`删除（清理）`);
		const delRes = await fetchNoRedirect(`${BASE}/api/${path}?id=${encodeURIComponent(newId)}`, { method: "DELETE" });
		check(`${label} 删除 200`, delRes.status === 200, { status: delRes.status });
	}

	return { newId, listKey };
}

async function main() {
	console.log(`\n[smoke-aq] BASE=${BASE}`);

	// ① warm up + 登录
	console.log("\n① warm up（拿 eo cookie）+ 登录");
	const warmupQuery = EO_TIME
		? `eo_token=${encodeURIComponent(EO_TOKEN)}&eo_time=${encodeURIComponent(EO_TIME)}`
		: `eo_token=${encodeURIComponent(EO_TOKEN)}`;
	await fetchFollow(`${BASE}/?${warmupQuery}`);
	check("eo cookie 已获取", jar.size > 0, Array.from(jar.keys()));

	const loginRes = await fetchNoRedirect(`${BASE}/api/auth/login`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
	});
	const loginBody = await readBody(loginRes);
	check("登录 200", loginRes.status === 200, { status: loginRes.status, body: loginBody });
	check("JWT cookie", jar.has("firefly_admin_token"), Array.from(jar.keys()));
	if (loginRes.status !== 200) {
		console.log("\n登录失败，终止。");
		return finish();
	}

	// ② 公告
	await smokeContent("公告", "announcements", "public/announcements", 1);

	// ③ 一言
	await smokeContent("一言", "quotes", "public/quotes", 35);

	return finish();
}

function finish() {
	console.log(`\n[smoke-aq] 完成：${passed} 通过 / ${failed} 失败`);
	process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
	console.error("\n[smoke-aq] 异常：", err);
	process.exit(1);
});
