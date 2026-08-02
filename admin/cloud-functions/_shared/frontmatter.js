/**
 * frontmatter 序列化（写侧，Node.js 20，Cloud Functions）
 *
 * 关键：必须与仓库现有文章的真实序列化格式一致（详见 docs/admin-console-plan.md 六章），
 * 而不是 new-post.js 模板。真实格式规律：
 *   - title / category / image / slug：裸值不带引号
 *   - published / updated：裸值 YYYY-MM-DD（不带引号、无时间部分）
 *   - description：双引号包裹（JSON.stringify 保证中文/引号安全）
 *   - tags：行内 JSON 数组，如 ["Astro","旅游"]
 *   - pinned / draft / comment：裸布尔
 *   - 空值字段省略（无 lang 就不写 lang）
 *
 * 字段固定顺序，未识别字段原样追加在后，避免写回丢字段。
 */

// 已知字段的输出顺序，与真实文章一致
const FIELD_ORDER = [
	"title",
	"published",
	"updated",
	"pinned",
	"description",
	"image",
	"slug",
	"tags",
	"category",
	"draft",
	"lang",
	"author",
	"sourceLink",
	"licenseName",
	"licenseUrl",
	"comment",
	"password",
	"passwordHint",
];

// 裸值输出（不带引号）的字符串字段
const BARE_STRING_FIELDS = new Set(["title", "published", "updated", "image", "slug", "category", "lang"]);
// 双引号包裹的字符串字段
const QUOTED_STRING_FIELDS = new Set([
	"description",
	"author",
	"sourceLink",
	"licenseName",
	"licenseUrl",
	"password",
	"passwordHint",
]);
// 布尔字段
const BOOL_FIELDS = new Set(["pinned", "draft", "comment"]);
// 行内数组字段
const ARRAY_FIELDS = new Set(["tags"]);

// 日期归一化为 YYYY-MM-DD（容忍传入 ISO 串 / Date）
function normalizeDate(value) {
	if (value == null || value === "") return "";
	const str = String(value).trim();
	// 已是 YYYY-MM-DD
	if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
	const d = new Date(str);
	if (Number.isNaN(d.getTime())) return str;
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

// 判断某字段是否应省略（空字符串 / 空数组 / undefined / null）
function isEmpty(value) {
	if (value == null) return true;
	if (typeof value === "string") return value.trim() === "";
	if (Array.isArray(value)) return value.length === 0;
	return false;
}

// 序列化单个已知字段为一行 YAML；返回 null 表示省略
function serializeKnownField(key, value) {
	if (BOOL_FIELDS.has(key)) {
		// 布尔字段仅在显式为 true/false 时输出；draft 默认 false 也写出以对齐真实文章
		if (typeof value !== "boolean") return null;
		return `${key}: ${value ? "true" : "false"}`;
	}
	if (ARRAY_FIELDS.has(key)) {
		if (!Array.isArray(value) || value.length === 0) return null;
		// 行内 JSON 数组，元素双引号
		const inner = value.map((v) => JSON.stringify(String(v))).join(",");
		return `${key}: [${inner}]`;
	}
	if (key === "published" || key === "updated") {
		const d = normalizeDate(value);
		if (!d) return null;
		return `${key}: ${d}`;
	}
	if (BARE_STRING_FIELDS.has(key)) {
		if (isEmpty(value)) return null;
		return `${key}: ${String(value)}`;
	}
	if (QUOTED_STRING_FIELDS.has(key)) {
		if (isEmpty(value)) return null;
		return `${key}: ${JSON.stringify(String(value))}`;
	}
	return null;
}

// 序列化未识别字段（尽量安全：字符串加引号、布尔/数字裸值、数组走 JSON）
function serializeUnknownField(key, value) {
	if (isEmpty(value)) return null;
	if (typeof value === "boolean" || typeof value === "number") {
		return `${key}: ${value}`;
	}
	if (Array.isArray(value)) {
		const inner = value.map((v) => JSON.stringify(String(v))).join(",");
		return `${key}: [${inner}]`;
	}
	if (typeof value === "object") {
		return `${key}: ${JSON.stringify(value)}`;
	}
	return `${key}: ${JSON.stringify(String(value))}`;
}

/**
 * 把 frontmatter 对象 + 正文拼成完整 markdown 文件内容。
 * @param {Record<string, unknown>} frontmatter
 * @param {string} body 正文（不含 frontmatter）
 * @returns {string}
 */
export function serializePost(frontmatter, body) {
	const lines = [];
	const seen = new Set();

	// 先按固定顺序输出已知字段
	for (const key of FIELD_ORDER) {
		if (!(key in frontmatter)) continue;
		seen.add(key);
		const line = serializeKnownField(key, frontmatter[key]);
		if (line !== null) lines.push(line);
	}

	// 未识别字段原样追加，保持写回不丢字段
	for (const key of Object.keys(frontmatter)) {
		if (seen.has(key) || FIELD_ORDER.includes(key)) continue;
		const line = serializeUnknownField(key, frontmatter[key]);
		if (line !== null) lines.push(line);
	}

	const normalizedBody = String(body ?? "").replace(/\r\n/g, "\n");
	// frontmatter 与正文之间保留一个空行，正文末尾保证一个换行
	const trimmedBody = normalizedBody.replace(/^\n+/, "").replace(/\n+$/, "");
	return `---\n${lines.join("\n")}\n---\n\n${trimmedBody}\n`;
}

/* ----------------------------------------------------------------
 * 读侧：parsePost / extractExcerpt（从 markdown 还原 frontmatter 对象）
 * 覆盖本项目文章实际用到的 YAML 子集，与上方序列化器互为逆操作。
 * ---------------------------------------------------------------- */

function parseScalar(raw) {
	const value = raw.trim();
	if (value === "") return "";
	if (value.startsWith("[")) {
		try {
			return JSON.parse(value);
		} catch {
			return value
				.slice(1, -1)
				.split(",")
				.map((s) => s.trim().replace(/^["']|["']$/g, ""))
				.filter(Boolean);
		}
	}
	if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
		if (value.startsWith('"')) {
			try {
				return JSON.parse(value);
			} catch {
				return value.slice(1, -1);
			}
		}
		return value.slice(1, -1);
	}
	if (value === "true") return true;
	if (value === "false") return false;
	return value;
}

export function parsePost(raw) {
	const text = raw.replace(/\r\n/g, "\n");
	if (!text.startsWith("---\n")) {
		return { frontmatter: { title: "", published: "" }, body: text };
	}
	const end = text.indexOf("\n---", 4);
	if (end === -1) {
		return { frontmatter: { title: "", published: "" }, body: text };
	}
	const fmBlock = text.slice(4, end);
	const afterFence = text.indexOf("\n", end + 1);
	const body = afterFence === -1 ? "" : text.slice(afterFence + 1);

	const fm = { title: "", published: "" };
	for (const line of fmBlock.split("\n")) {
		if (!line.trim() || line.trimStart().startsWith("#")) continue;
		const colon = line.indexOf(":");
		if (colon === -1) continue;
		const key = line.slice(0, colon).trim();
		const value = line.slice(colon + 1);
		if (key) fm[key] = parseScalar(value);
	}

	return { frontmatter: fm, body: body.replace(/^\n+/, "") };
}

export function extractExcerpt(body, maxLen = 120) {
	const plain = body
		.replace(/```[\s\S]*?```/g, "")
		.replace(/^#+\s+/gm, "")
		.replace(/[*_`>#-]/g, "")
		.replace(/\s+/g, " ")
		.trim();
	return plain.length > maxLen ? `${plain.slice(0, maxLen)}…` : plain;
}
