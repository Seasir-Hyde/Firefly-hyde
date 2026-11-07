/**
 * 文章卡片背景水印图案分配。
 *
 * 卡片右下角的水印图案来自 styles/home-card-decor.css 中定义的 12 个内联 SVG
 * （blossom / parcel / cursor / clock / sun-cloud / quote / chat / orbit /
 * constellation / window / paper-plane / code），通过卡片根元素的
 * `data-card-decor` 属性选择对应图案。
 *
 * 分配策略分两步：
 * 1. 按文章语义（标题 → 分类 → 标签）匹配关键词规则，让图案与文章主题贴合；
 * 2. 未命中规则时按文章 id 哈希取模，保证同一篇文章每次构建结果稳定。
 *
 * 由于关键词规则天然会把同类文章归到同一图案（例如多篇「组件」类文章），
 * 因此在整页范围内再做一次去重：已被占用的图案不会重复分配给后面的卡片，
 * 保证同一列表页内每张卡片的水印图案互不相同。
 */

/** 可用的卡片装饰图案，取值需与 home-card-decor.css 中的 --home-card-mask-* 对应 */
export const CARD_DECOR_PATTERNS = [
	"blossom",
	"parcel",
	"cursor",
	"clock",
	"sun-cloud",
	"quote",
	"chat",
	"orbit",
	"constellation",
	"window",
	"paper-plane",
	"code",
] as const;

export type CardDecorPattern = (typeof CARD_DECOR_PATTERNS)[number];

/** 关键词 → 图案。规则按「更具体的关键词在前」排列，避免宽泛词抢占更贴切的图案 */
const CARD_DECOR_RULES: ReadonlyArray<{
	pattern: CardDecorPattern;
	keywords: readonly string[];
}> = [
	{
		pattern: "quote",
		keywords: ["今日一言", "每日一言", "一言", "句子", "quote"],
	},
	{
		pattern: "chat",
		keywords: ["欢迎提示", "欢迎弹窗", "欢迎语", "弹窗", "toast"],
	},
	{
		pattern: "clock",
		keywords: ["进度", "倒计时", "计时", "日历", "schedule", "归档"],
	},
	{
		pattern: "sun-cloud",
		keywords: [
			"time-greeting",
			"时间问候",
			"实时时钟",
			"天气",
			"早安",
			"午安",
			"晚安",
			"greeting",
		],
	},
	{
		pattern: "constellation",
		keywords: [
			"ai-",
			"ai ",
			"ai摘要",
			"智能体",
			"agents",
			"gpt",
			"无限画布",
			"人工智能",
			"图像生成",
		],
	},
	{
		pattern: "code",
		keywords: [
			"源码",
			"代码",
			"前端",
			"pnpm",
			"构建",
			"部署",
			"安全策略",
			"开发",
			"astro",
			"javascript",
			"typescript",
		],
	},
	{
		pattern: "window",
		keywords: ["导航栏", "页脚", "站点", "网站", "主题"],
	},
	{
		pattern: "orbit",
		keywords: ["动画", "动效", "滚动", "过渡", "animation", "展示"],
	},
	{
		pattern: "cursor",
		keywords: ["鼠标", "光标", "cursor", "指针"],
	},
	{
		pattern: "parcel",
		keywords: [
			"友链",
			"自建链接",
			"链接申请",
			"申请",
			"打包",
			"包裹",
			"跨境电商",
			"上架",
			"订单",
		],
	},
	{
		pattern: "paper-plane",
		keywords: ["随笔", "感悟", "思考", "记录", "生活", "旅行", "写作", "日记"],
	},
	{
		pattern: "blossom",
		keywords: [
			"个人创作",
			"回到自己的博客",
			"重新打开",
			"分类",
			"封面",
			"隐藏封面",
		],
	},
];

/**
 * 过于通用的标签值：几乎每篇文章都会带上，若参与匹配会让大量文章撞同一个图案。
 * 这类标签只作为兜底补充，且在补充匹配时被排除。
 */
const CARD_DECOR_GENERIC_TAGS = new Set([
	"firefly",
	"astro",
	"博客",
	"blog",
	"随笔",
	"记录",
	"生活",
]);

const normalizeDecorSource = (value: string) => value.trim().toLowerCase();

/** 文章的元数据，用于计算水印图案 */
export type CardDecorSource = {
	/** 文章 id（内容集合中的相对路径），用于哈希兜底 */
	id: string;
	/** 文章标题 */
	title: string;
	/** 文章分类 */
	category?: string | null;
	/** 文章标签 */
	tags?: readonly string[];
};

const matchCardDecorRule = (source: string) =>
	source
		? CARD_DECOR_RULES.find((rule) =>
				rule.keywords.some((keyword) => source.includes(keyword)),
			)
		: undefined;

/**
 * 计算单篇文章的「首选」图案：优先按语义匹配，命中不了再按 id 哈希兜底。
 * 该结果可能与其他文章重复，整页分配时还会再做去重。
 */
export function getPreferredCardDecor(post: CardDecorSource): CardDecorPattern {
	const titleSource = normalizeDecorSource(post.title);
	const metaSource = [post.category || "", ...(post.tags ?? [])]
		.map(normalizeDecorSource)
		.filter((value) => value && !CARD_DECOR_GENERIC_TAGS.has(value))
		.join(" ");

	const matched =
		matchCardDecorRule(titleSource) ?? matchCardDecorRule(metaSource);
	if (matched) return matched.pattern;

	const hash = Array.from(post.id).reduce(
		(total, character) => (total * 31 + (character.codePointAt(0) ?? 0)) >>> 0,
		7,
	);
	return CARD_DECOR_PATTERNS[hash % CARD_DECOR_PATTERNS.length];
}

/**
 * 为一整页文章分配互不相同的水印图案。
 *
 * 先按每篇文章的「首选」图案依次落位；若某个图案已被前面的卡片占用，
 * 则按 CARD_DECOR_PATTERNS 的顺序向后寻找一个尚未使用的图案。
 * 图案用尽（文章数超过 12 篇）时允许复用，以保证分配始终有结果。
 */
export function assignCardDecors(
	posts: readonly CardDecorSource[],
): Map<string, CardDecorPattern> {
	const result = new Map<string, CardDecorPattern>();
	const used = new Set<CardDecorPattern>();

	for (const post of posts) {
		const preferred = getPreferredCardDecor(post);
		let assigned = preferred;
		if (used.has(preferred)) {
			const spare = CARD_DECOR_PATTERNS.find((pattern) => !used.has(pattern));
			// 图案全部用尽时退回首选图案，保证一定有结果
			assigned = spare ?? preferred;
		}
		used.add(assigned);
		result.set(post.id, assigned);
	}

	return result;
}
