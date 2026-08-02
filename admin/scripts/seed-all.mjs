// 一次性给四类动态内容（说说 / 公告 / 一言 / 设备）灌入初始种子数据（Node，无第三方依赖）
//
// 用途：阶段 4 前台改造后，博客首屏读的是构建快照、访客侧运行时刷新读的是 KV。
// 若 KV 是空的（真机联调测完曾清空），前台就没有动态内容可显示。本脚本登录后台、
// 依次 POST 受保护的 seed 端点，把存量数据一次性写进 KV。
//
// 与 smoke-*.mjs 的区别：smoke 脚本会新建 / 更新 / 删除测试数据（验证 CRUD），
// 跑完不适合留在生产；本脚本只做「登录 → seed」，不碰任何 CRUD，跑完 KV 即干净初始态。
//
// 用法：
//   node scripts/seed-all.mjs <BASE_URL> <USERNAME> <PASSWORD> [EO_TOKEN] [--force]
// 例（已绑自定义域名，无需 eo_token）：
//   node scripts/seed-all.mjs https://astro-admin.cchaoka.cn zane '你的密码'
// 例（仍用预设域名的过渡期，需带 eo_token warm up）：
//   node scripts/seed-all.mjs https://firefly-admin-xxxx.edgeone.cool zane '密码' <EO_TOKEN>
//
// 幂等：默认不带 force，seed 端点见已有数据会跳过（返回 skipped）。
//   加 --force：无视已有数据强制重种（会先清空再写，慎用于生产）。
//
// cookie / 重定向处理沿用 smoke-moments.mjs 的验证过的做法：
//   ① （可选）warm up：带 ?eo_token= 访问首页，跟随 302 拿 eo cookie（预设域名的访问保护）
//   ② 登录 POST /api/auth/login 拿 JWT cookie（不跟随 302，直接读 Set-Cookie）
//   ③ 合并 cookie 调 seed 端点；写请求不带 ?eo_token= 查询参数（避免 302 丢 body）

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const positional = args.filter((a) => a !== "--force");
const [BASE_RAW, USERNAME = "zane", PASSWORD, EO_TOKEN] = positional;

if (!BASE_RAW || !PASSWORD) {
	console.error(
		"用法: node scripts/seed-all.mjs <BASE_URL> <USERNAME> <PASSWORD> [EO_TOKEN] [--force]",
	);
	process.exit(1);
}

const BASE = BASE_RAW.replace(/\/+$/, "");
const FORCE_QS = FORCE ? "?force=1" : "";

// ---------- cookie jar（极简） ----------
const jar = new Map(); // name -> value

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

// 跟随重定向：每一跳都收集 Set-Cookie（预设域名访问保护靠 302 下发 eo cookie）
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

let ok = 0;
let bad = 0;

async function main() {
	console.log(`\n[seed] BASE=${BASE}  force=${FORCE}`);

	// ① （可选）warm up 拿 eo cookie —— 仅预设域名需要；绑了自定义域名可省略
	if (EO_TOKEN) {
		console.log("\n① warm up（预设域名访问保护，拿 eo cookie）");
		await fetchFollow(`${BASE}/?eo_token=${encodeURIComponent(EO_TOKEN)}`);
		console.log(`   eo cookie: ${jar.size > 0 ? "已获取" : "未获取（可能已绑自定义域名，可忽略）"}`);
	} else {
		console.log("\n① 跳过 warm up（未传 eo_token，假定已绑自定义域名）");
	}

	// ② 登录拿 JWT cookie
	console.log("\n② 登录 /api/auth/login");
	const loginRes = await fetchNoRedirect(`${BASE}/api/auth/login`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
	});
	const loginBody = await readBody(loginRes);
	if (loginRes.status !== 200 || !jar.has("firefly_admin_token")) {
		console.error(`   ❌ 登录失败：status=${loginRes.status}`, loginBody);
		console.error("   终止（未登录无法 seed）。");
		process.exit(1);
	}
	console.log("   ✅ 登录成功，已拿到 JWT cookie");

	// ③ 依次 seed
	const targets = [
		{ name: "说说 moments", path: "/api/moments/seed" },
		{ name: "公告 announcements", path: "/api/announcements/seed" },
		{ name: "一言 quotes", path: "/api/quotes/seed" },
		{ name: "设备 devices", path: "/api/devices/seed" },
	];

	console.log("\n③ seed 动态内容");
	for (const t of targets) {
		const res = await fetchNoRedirect(`${BASE}${t.path}${FORCE_QS}`, {
			method: "POST",
		});
		const body = await readBody(res);
		if (res.status === 200 && body?.ok) {
			ok++;
			if (body.skipped) {
				console.log(`   ⏭️  ${t.name} 已有数据，跳过（total=${body.total}）。要覆盖请加 --force`);
			} else {
				const detail = body.months
					? `seeded=${body.seeded}，分片=${JSON.stringify(body.months)}`
					: `seeded=${body.seeded}`;
				console.log(`   ✅ ${t.name} 已导入（${detail}）`);
			}
		} else {
			bad++;
			console.log(`   ❌ ${t.name} 失败：status=${res.status}`, body);
		}
	}

	console.log(`\n[seed] 完成：${ok} 成功 / ${bad} 失败`);
	if (bad === 0) {
		console.log("提示：可 curl 公开 API 确认前台可读：");
		console.log(`  ${BASE}/api/public/moments`);
		console.log(`  ${BASE}/api/public/announcements`);
		console.log(`  ${BASE}/api/public/quotes`);
		console.log(`  ${BASE}/api/public/devices`);
	}
	process.exit(bad > 0 ? 1 : 0);
}

main().catch((err) => {
	console.error("\n[seed] 异常：", err);
	process.exit(1);
});
