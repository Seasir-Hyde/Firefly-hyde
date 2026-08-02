/**
 * GET / PUT /api/config
 * 站点配置读写通道（Cloud Functions，Node.js 20）：
 *   GET：Promise.all 并行 fetch CNB raw 读 src/config/settings/<domain>.json（22 个域，
 *        读 main 分支，push 后即刻可读，不必等构建）。单域读取/解析失败该域返回 null
 *        并附 errors，不整体失败。
 *   PUT：body { changes: { [domain]: object }, commitMessage? }，把 N 个域文件写进
 *        同一个 commit 并 git push（一次构建生效，约 3-5 分钟，决策 4 批量保存）。
 *
 * 与 posts/data/spec 读写同一套通道（读走 _shared/cnb.js，写走 _shared/git.js）。
 *
 * 校验（方案 5.3 的服务端两层，不引入 zod）：
 *   结构层：changes 为非空对象、domain 在白名单（防任意路径写入）、每域值是纯对象
 *           （拒 null / 数组 / 标量顶层）；
 *   字段层：极简校验表 RULES，只查「写错会炸构建或炸页面」的关键字段，未知字段一律
 *           放行（决策 7：前端读-改-写整对象，服务端不剔除未知字段，防 schema 漂移丢数据）。
 *
 * 序列化：JSON.stringify(data, null, "\t") + "\n"（tab 缩进 + LF + 末尾换行）。
 * 注意与方案文本的 2 空格不同：阶段 1 提交的 settings/*.json 实际经 biome format
 * 成 tab 缩进，写回以仓库现存格式为准，保证零格式 diff（风险 7.10）。
 *
 * 鉴权：middleware.js 只做 cookie 存在性检查（坑 6），此处调 requireAuth 真正验签 JWT。
 */

import { CnbError, getRaw } from "../../_shared/cnb.js";
import { commitAndPush, GitOpError, writeRepoFile } from "../../_shared/git.js";
import { requireAuth } from "../../_shared/requireAuth.js";
import { jsonResponse } from "../../_shared/response.js";

const SETTINGS_DIR = "src/config/settings";

// 配置域白名单：域名 = settings/ 目录下 JSON 文件名 = API key（22 个，以目录实际文件为准）。
// 中文名用于默认 commit message「配置: 更新 <域中文名列表>」。
const DOMAINS = {
	site: "站点",
	sidebar: "侧边栏",
	wallpaper: "壁纸",
	music: "音乐播放器",
	pio: "看板娘",
	effects: "樱花特效",
	announcement: "公告",
	comment: "评论",
	cover: "封面图",
	profile: "个人资料",
	sponsor: "赞助",
	license: "许可证",
	footer: "页脚",
	"friends-page": "友链页面",
	relationship: "恋爱计时",
	"expressive-code": "代码高亮",
	mermaid: "Mermaid",
	plantuml: "PlantUML",
	ad: "广告",
	dynamic: "动态页",
	gallery: "相册",
	font: "字体",
};

/**
 * 极简字段校验表（5.3 字段层）。
 * 键为域内点路径；段 "*" 表示该层对象的全部自有键；前缀 "!" 表示必填——仅用于
 * 「缺了必炸构建」的路径（被派生逻辑 / getStaticPaths / paginate / TS 按 key 断言
 * 导出直接消费的对象与数组）。规则值：
 *   "boolean" | "string" | "number" | "array" | "object"
 *   { enum: [...] } | { number: [min, max?] } | { int: [min, max?] }
 * 路径不存在时（除必填外）不校验；表外字段一律放行。
 */
const RULES = {
	site: {
		title: "string",
		subtitle: "string",
		site_url: "string",
		description: "string",
		keywords: "array",
		lang: { enum: ["zh_CN", "zh_TW", "en", "ja", "ru"] },
		themeColor: "object",
		"themeColor.hue": { number: [0, 360] },
		"themeColor.fixed": "boolean",
		"themeColor.defaultMode": { enum: ["light", "dark", "system"] },
		pageWidth: "number",
		favicon: "array",
		navbar: "object",
		"navbar.menuAlign": { enum: ["left", "center"] },
		// pages 被 navBarConfig 派生逻辑与十几个页面 frontmatter / sitemap filter 直接点访问，缺失必炸构建
		"!pages": "object",
		"pages.*": "boolean",
		"postListLayout.defaultMode": { enum: ["list", "grid"] },
		"postListLayout.mobileDefaultMode": { enum: ["list", "grid"] },
		// paginate 的 pageSize，非正整数炸构建
		"!pagination.postsPerPage": { int: [1] },
		"imageOptimization.formats": { enum: ["avif", "webp", "both"] },
		"imageOptimization.quality": { int: [1, 100] },
		"imageOptimization.noReferrerDomains": "array",
		// 进 astro.config.mjs 的 import 路径 rehype-callouts/theme/<theme>
		"rehypeCallouts.theme": "string",
		"bangumi.categoryOrder": "array",
		"aiSummary.enable": "boolean",
		outdatedThreshold: "number",
	},
	sidebar: {
		enable: "boolean",
		position: { enum: ["left", "right", "both"] },
		tabletSidebar: { enum: ["left", "right"] },
		hideSidebarOnPostPage: "boolean",
		showBothSidebarsOnPostPage: "boolean",
		// 三个组件数组被布局遍历，缺失/非数组炸构建
		"!leftComponents": "array",
		"!rightComponents": "array",
		"!mobileBottomComponents": "array",
	},
	wallpaper: {
		mode: { enum: ["banner", "fullscreen", "overlay", "none"] },
		switchable: "boolean",
		src: "object",
		common: "object",
		"common.dimOpacity": { number: [0, 1] },
		"overlay.opacity": { number: [0, 1] },
		"overlay.cardOpacity": { number: [0, 1] },
	},
	music: {
		showInNavbar: "boolean",
		mode: { enum: ["meting", "local"] },
		volume: { number: [0, 1] },
		playMode: { enum: ["list", "one", "random"] },
		showLyrics: "boolean",
		meting: "object",
		"local.playlist": "array",
	},
	pio: {
		// TS 层按 key 断言导出（pioSettings.spine / pioSettings.live2d），缺 key 导出 undefined 炸消费方
		"!spine": "object",
		"!live2d": "object",
		"spine.enable": "boolean",
		"live2d.enable": "boolean",
		"live2d.model": "array",
	},
	effects: {
		enable: "boolean",
		switchable: "boolean",
		sakuraNum: "number",
		zIndex: "number",
	},
	announcement: {
		title: "string",
		content: "string",
		closable: "boolean",
		link: "object",
	},
	comment: {
		type: { enum: ["none", "twikoo", "waline", "giscus", "disqus", "artalk"] },
	},
	cover: {
		enableInPost: "boolean",
		"randomCoverImage.enable": "boolean",
		"randomCoverImage.apis": "array",
	},
	profile: {
		avatar: "string",
		name: "string",
		bio: "string",
		links: "array",
	},
	sponsor: {
		showSponsorsList: "boolean",
		showComment: "boolean",
		showButtonInPost: "boolean",
		methods: "array",
		sponsors: "array",
	},
	license: { enable: "boolean", name: "string", url: "string", icon: "string" },
	footer: { enable: "boolean" },
	"friends-page": {
		title: "string",
		description: "string",
		showCustomContent: "boolean",
		showComment: "boolean",
		randomizeSort: "boolean",
	},
	relationship: {
		startDate: "string",
		name1: "string",
		name2: "string",
		avatar1: "string",
		avatar2: "string",
		title: "string",
	},
	"expressive-code": {
		// 主题名进 astro.config.mjs 的 expressiveCode themes，类型错炸构建
		darkTheme: "string",
		lightTheme: "string",
		"pluginCollapsible.enable": "boolean",
		"pluginCollapsible.lineThreshold": "number",
		"pluginCollapsible.previewLines": "number",
		"pluginCollapsible.defaultCollapsed": "boolean",
		"pluginLanguageBadge.enable": "boolean",
	},
	mermaid: { lightTheme: "string", darkTheme: "string" },
	plantuml: {
		enable: "boolean",
		server: "string",
		lightTheme: "string",
		darkTheme: "string",
	},
	ad: {
		// TS 层按 key 断言导出（adSettings.ad1 / adSettings.ad2）
		"!ad1": "object",
		"!ad2": "object",
		"ad1.closable": "boolean",
		"ad2.closable": "boolean",
		"ad1.displayCount": "number",
		"ad2.displayCount": "number",
	},
	dynamic: {
		title: "string",
		description: "string",
		showComment: "boolean",
		itemsPerPage: { int: [1] },
	},
	gallery: {
		// getStaticPaths 遍历 albums 生成相册路由，缺失/非数组炸构建
		"!albums": "array",
		columnWidth: "number",
	},
		// Astro Font API：{ fontConfig, fontsList }（旧 preload/fonts 表结构已废弃）
		font: {
			"!fontConfig": "object",
			"!fontsList": "array",
			"fontConfig.enable": "boolean",
			"fontConfig.selected": "array",
			"fontConfig.bannerTitleFont": "string",
			"fontConfig.bannerSubtitleFont": "string",
			"fontConfig.navbarTitleFont": "string",
			"fontConfig.codeFont": "string",
			"fontConfig.subsetFonts": "object",
		},
	};

function isPlainObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

// 按点路径收集值；"*" 段展开该层全部自有键；祖先缺失或非对象时按「缺失」传播（类型
// 错误由祖先自身的规则负责报，避免同一处错重复报两条）。返回 [{ label, found, value }]。
function collectPath(root, domain, path) {
	let items = [{ label: domain, value: root, found: true }];
	for (const seg of path.split(".")) {
		const next = [];
		for (const item of items) {
			if (!item.found) {
				next.push(item);
				continue;
			}
			if (!isPlainObject(item.value)) {
				next.push({ label: `${item.label}.${seg}`, found: false });
				continue;
			}
			if (seg === "*") {
				for (const key of Object.keys(item.value)) {
					next.push({ label: `${item.label}.${key}`, value: item.value[key], found: true });
				}
			} else if (Object.hasOwn(item.value, seg)) {
				next.push({ label: `${item.label}.${seg}`, value: item.value[seg], found: true });
			} else {
				next.push({ label: `${item.label}.${seg}`, found: false });
			}
		}
		items = next;
	}
	return items;
}

// 校验单个值，返回错误描述或 null
function ruleError(value, rule) {
	if (rule === "boolean") return typeof value === "boolean" ? null : "应为布尔值";
	if (rule === "string") return typeof value === "string" ? null : "应为字符串";
	if (rule === "number") {
		return typeof value === "number" && Number.isFinite(value) ? null : "应为数字";
	}
	if (rule === "array") return Array.isArray(value) ? null : "应为数组";
	if (rule === "object") return isPlainObject(value) ? null : "应为对象";
	if (rule.enum) {
		return rule.enum.includes(value) ? null : `应为 ${rule.enum.join(" / ")} 之一`;
	}
	const range = rule.number || rule.int;
	if (range) {
		const [min, max] = range;
		if (typeof value !== "number" || !Number.isFinite(value)) return "应为数字";
		if (rule.int && !Number.isInteger(value)) return "应为整数";
		if (max !== undefined && (value < min || value > max)) return `应在 ${min} ~ ${max} 范围内`;
		if (value < min) return `应不小于 ${min}`;
		return null;
	}
	return null;
}

// 按 RULES 校验一个域，返回错误描述列表（空数组 = 通过）
function checkDomain(domain, data) {
	const rules = RULES[domain];
	if (!rules) return [];
	const errors = [];
	for (const [rawPath, rule] of Object.entries(rules)) {
		const required = rawPath.startsWith("!");
		const path = required ? rawPath.slice(1) : rawPath;
		const items = collectPath(data, domain, path);
		for (const item of items) {
			if (!item.found) {
				if (required) errors.push(`${item.label} 缺失（必填）`);
				continue;
			}
			const err = ruleError(item.value, rule);
			if (err) errors.push(`${item.label} ${err}`);
		}
		// 通配路径展开为空不触发必填；必填路径整链缺失时 items 可能为空
		if (required && items.length === 0) {
			errors.push(`${domain}.${path} 缺失（必填）`);
		}
	}
	return errors;
}

// 与仓库 settings/*.json 现存格式一致：tab 缩进 + 末尾换行（见文件头说明）
function serialize(data) {
	return `${JSON.stringify(data, null, "\t")}\n`;
}

// GET：并行读 22 个域，单域失败不影响整体
async function handleGet(context) {
	const auth = await requireAuth(context);
	if (auth instanceof Response) return auth;

	const names = Object.keys(DOMAINS);
	const results = await Promise.all(
		names.map(async (name) => {
			try {
				const raw = await getRaw(context.env, `${SETTINGS_DIR}/${name}.json`);
				return [name, JSON.parse(raw), null];
			} catch (err) {
				const message = err instanceof CnbError ? err.message : `解析 ${name}.json 失败`;
				return [name, null, message];
			}
		}),
	);

	const domains = {};
	const errors = {};
	for (const [name, data, error] of results) {
		domains[name] = data;
		if (error) errors[name] = error;
	}
	const payload = { domains };
	if (Object.keys(errors).length > 0) payload.errors = errors;
	return jsonResponse(payload, { cache: "no-store" });
}

// PUT：校验通过后把 N 个域写进同一个 commit 并 push
async function handlePut(context) {
	const auth = await requireAuth(context);
	if (auth instanceof Response) return auth;

	let body;
	try {
		body = await context.request.json();
	} catch {
		return jsonResponse({ error: "请求体解析失败" }, { status: 400, cache: "no-store" });
	}

	const changes = body?.changes;
	if (!isPlainObject(changes) || Object.keys(changes).length === 0) {
		return jsonResponse(
			{ error: "缺少 changes 字段（需为非空对象）" },
			{ status: 400, cache: "no-store" },
		);
	}

	const names = Object.keys(changes);
	const unknown = names.filter((name) => !Object.hasOwn(DOMAINS, name));
	if (unknown.length > 0) {
		return jsonResponse(
			{ error: `不支持的配置域：${unknown.join("、")}` },
			{ status: 400, cache: "no-store" },
		);
	}

	const details = [];
	for (const name of names) {
		const data = changes[name];
		if (!isPlainObject(data)) {
			details.push(`${name} 的值应为对象`);
			continue;
		}
		details.push(...checkDomain(name, data));
	}
	if (details.length > 0) {
		return jsonResponse(
			{ error: "配置校验未通过", details },
			{ status: 400, cache: "no-store" },
		);
	}

	const message =
		(typeof body.commitMessage === "string" && body.commitMessage.trim()) ||
		`配置: 更新 ${names.map((name) => DOMAINS[name]).join("、")}`;

	try {
		const result = await commitAndPush(context.env, message, async (dir) => {
			for (const name of names) {
				await writeRepoFile(dir, `${SETTINGS_DIR}/${name}.json`, serialize(changes[name]));
			}
		});
		return jsonResponse(
			{ ok: true, domains: names, commit: result.commitOid, branch: result.branch },
			{ cache: "no-store" },
		);
	} catch (err) {
		const status = err instanceof GitOpError ? err.status : 500;
		return jsonResponse(
			{ error: err?.message || "保存失败" },
			{ status, cache: "no-store" },
		);
	}
}

export async function onRequest(context) {
	const method = context.request.method;
	if (method === "GET") return handleGet(context);
	if (method === "PUT") return handlePut(context);
	return jsonResponse({ error: "method_not_allowed" }, { status: 405, cache: "no-store" });
}
