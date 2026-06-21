import { type CollectionEntry, getCollection } from "astro:content";
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import { getCategoryUrl, getPostUrlBySlug } from "@utils/url-utils";
import { siteConfig } from "@/config/siteConfig";
import { getDiaryList } from "@/data/diary";
import type { UserSubjectCollection } from "@/types/bangumi";

async function getRawSortedPosts() {
	const allBlogPosts = await getCollection("posts", ({ data }) => {
		return import.meta.env.PROD ? data.draft !== true : true;
	});

	const sorted = allBlogPosts.sort((a, b) => {
		// 首先按置顶状态排序，置顶文章在前
		if (a.data.pinned && !b.data.pinned) return -1;
		if (!a.data.pinned && b.data.pinned) return 1;

		// 如果置顶状态相同，则按发布日期排序
		const dateA = new Date(a.data.published);
		const dateB = new Date(b.data.published);
		return dateA > dateB ? -1 : 1;
	});
	return sorted;
}

export async function getSortedPosts() {
	const sorted = await getRawSortedPosts();

	for (let i = 1; i < sorted.length; i++) {
		sorted[i].data.nextSlug = sorted[i - 1].id;
		sorted[i].data.nextTitle = sorted[i - 1].data.title;
	}
	for (let i = 0; i < sorted.length - 1; i++) {
		sorted[i].data.prevSlug = sorted[i + 1].id;
		sorted[i].data.prevTitle = sorted[i + 1].data.title;
	}

	return sorted;
}
export type PostForList = {
	id: string;
	data: CollectionEntry<"posts">["data"];
};
export async function getSortedPostsList(): Promise<PostForList[]> {
	const sortedFullPosts = await getRawSortedPosts();

	// delete post.body
	const sortedPostsList = sortedFullPosts.map((post) => ({
		id: post.id,
		data: post.data,
	}));

	return sortedPostsList;
}
export type Tag = {
	name: string;
	count: number;
};

export async function getTagList(): Promise<Tag[]> {
	const allBlogPosts = await getCollection<"posts">("posts", ({ data }) => {
		return import.meta.env.PROD ? data.draft !== true : true;
	});

	const countMap: { [key: string]: number } = {};
	allBlogPosts.forEach((post: { data: { tags: string[] } }) => {
		post.data.tags.forEach((tag: string) => {
			if (!countMap[tag]) countMap[tag] = 0;
			countMap[tag]++;
		});
	});

	// 从 moments collection 获取标签
	const momentsCollection = await getCollection("moments");
	momentsCollection.forEach((moment) => {
		moment.data.tags?.forEach((tag: string) => {
			if (!countMap[tag]) countMap[tag] = 0;
			countMap[tag]++;
		});
	});

	// 从远程说说获取标签
	try {
		const { externalMomentsConfig } = await import(
			"@/config/externalMomentsConfig"
		);
		if (externalMomentsConfig.enable && externalMomentsConfig.gistId) {
			// 使用 raw URL 直接获取，不需要认证（更可靠的 URL 格式）
			const rawUrl = `https://gist.githubusercontent.com/raw/${externalMomentsConfig.gistId}/${externalMomentsConfig.fileName}`;
			const response = await fetch(rawUrl);
			if (response.ok) {
				const moments = await response.json();
				moments.forEach((m: { tags?: string[] }) => {
					m.tags?.forEach((tag: string) => {
						if (!countMap[tag]) countMap[tag] = 0;
						countMap[tag]++;
					});
				});
			}
		}
	} catch (e) {
		console.warn("[Tags] 获取远程说说标签失败:", e);
	}

	// sort tags
	const keys: string[] = Object.keys(countMap).sort((a, b) => {
		return a.toLowerCase().localeCompare(b.toLowerCase());
	});

	return keys.map((key) => ({ name: key, count: countMap[key] }));
}

export interface ArchiveItem {
	id: string;
	type: "post" | "moment" | "bangumi" | "life";
	link?: string;
	data: {
		title: string;
		published: Date;
		tags: string[];
		category?: string | null;
	};
}

// 获取 Bangumi 数据的辅助函数
async function fetchBangumiArchiveData(): Promise<ArchiveItem[]> {
	const bangumiConfig = siteConfig.bangumi;
	if (!bangumiConfig) return [];

	const username = bangumiConfig.userId;
	const apiUrl = bangumiConfig.apiUrl || "https://api.bangumi.one";

	// 检查是否已配置用户ID
	if (!username || username === "you-user-id" || username.trim() === "") {
		console.log("[Archive] Bangumi 用户ID未配置，跳过获取");
		return [];
	}

	// 分类映射
	const categoryMap: Record<string, { name: string; subjectType: number }> = {
		anime: { name: i18n(I18nKey.bangumiCategoryAnime), subjectType: 2 },
		book: { name: i18n(I18nKey.bangumiCategoryBook), subjectType: 1 },
		music: { name: i18n(I18nKey.bangumiCategoryMusic), subjectType: 3 },
		game: { name: i18n(I18nKey.bangumiCategoryGame), subjectType: 4 },
	};

	const subjectBaseUrl =
		bangumiConfig.subjectBaseUrl || "https://bangumi.one/subject/";
	const bangumiItems: ArchiveItem[] = [];

	for (const [key, info] of Object.entries(categoryMap)) {
		try {
			const url = `${apiUrl}/v0/users/${username}/collections?subject_type=${info.subjectType}&limit=50&offset=0`;
			const response = await fetch(url, {
				headers: {
					"User-Agent": "YuuOuRou Blog",
					Accept: "application/json",
				},
			});

			if (!response.ok) {
				console.warn(
					`[Archive] 获取 Bangumi ${info.name} 数据失败: ${response.status}`,
				);
				continue;
			}

			const data = (await response.json()) as { data: UserSubjectCollection[] };
			const collections = data.data || [];

			for (const item of collections) {
				bangumiItems.push({
					id: `bangumi-${item.subject.id}`,
					type: "bangumi",
					link: `${subjectBaseUrl}${item.subject.id}`,
					data: {
						title: item.subject.name,
						published: item.subject.date
							? new Date(item.subject.date)
							: new Date(),
						tags: item.subject.tags?.map((t) => t.name) || [],
						category: info.name,
					},
				});
			}
		} catch (error) {
			console.error(`[Archive] 获取 Bangumi ${info.name} 数据异常:`, error);
		}
	}

	return bangumiItems;
}

export async function getArchiveList(): Promise<ArchiveItem[]> {
	const posts = await getCollection("posts", ({ data }) => {
		return import.meta.env.PROD ? data.draft !== true : true;
	});
	const diaryList = getDiaryList();

	const postItems: ArchiveItem[] = posts.map((post) => ({
		id: post.id,
		type: "post",
		link: getPostUrlBySlug(post.id),
		data: {
			title: post.data.title,
			published: post.data.published,
			tags: post.data.tags,
			category: post.data.category || null,
		},
	}));

	// 将日记数据转换为归档项
	const momentItems: ArchiveItem[] = diaryList.map((diary) => {
		let title = diary.content || "";
		title = title.replace(/[#*`]/g, "").trim();
		if (title.length > 50) title = `${title.substring(0, 50)}...`;
		if (!title) title = i18n(I18nKey.moments) || "日常动态";

		return {
			id: String(diary.id),
			type: "moment",
			link: "/diary/",
			data: {
				title: title,
				published: new Date(diary.date),
				tags: diary.tags || [],
				category: null,
			},
		};
	});

	// 从 moments collection 读取数据
	const momentsCollection = await getCollection("moments");
	const momentsFromCollection: ArchiveItem[] = momentsCollection.map(
		(moment) => {
			let title = moment.id || "";
			title = title.replace(/[#*`]/g, "").trim();
			if (title.length > 50) title = `${title.substring(0, 50)}...`;
			if (!title) title = i18n(I18nKey.moments) || "日常动态";

			return {
				id: `moment-${moment.id}`,
				type: "moment",
				link: "/moments/",
				data: {
					title: title,
					published: new Date(moment.data.published),
					tags: moment.data.tags || [],
					category: null,
				},
			};
		},
	);

	// 获取 Bangumi 数据
	const bangumiItems: ArchiveItem[] = await fetchBangumiArchiveData();
	const lifeItems: ArchiveItem[] = [];

	// 获取远程说说数据
	let externalMomentsItems: ArchiveItem[] = [];
	try {
		const { externalMomentsConfig } = await import(
			"@/config/externalMomentsConfig"
		);
		if (externalMomentsConfig.enable && externalMomentsConfig.gistId) {
			// 使用 raw URL 直接获取，不需要认证（更可靠的 URL 格式）
			const rawUrl = `https://gist.githubusercontent.com/raw/${externalMomentsConfig.gistId}/${externalMomentsConfig.fileName}`;
			const response = await fetch(rawUrl);
			if (response.ok) {
				const moments = (await response.json()) as Array<{
					id: string;
					content: string;
					published: string;
					tags?: string[];
					pinned?: boolean;
				}>;
				externalMomentsItems = moments.map((m) => {
					let title = m.content || "";
					title = title.replace(/[#*`]/g, "").trim();
					if (title.length > 50) title = `${title.substring(0, 50)}...`;
					if (!title) title = i18n(I18nKey.moments) || "日常动态";

					return {
						id: `ext-${m.id}`,
						type: "moment",
						link: "/moments/",
						data: {
							title: title,
							published: new Date(m.published),
							tags: m.tags || [],
							category: null,
						},
					};
				});
			}
		}
	} catch (e) {
		console.warn("[Archive] 获取远程说说数据失败:", e);
	}

	return [
		...postItems,
		...momentItems,
		...momentsFromCollection,
		...externalMomentsItems,
		...bangumiItems,
		...lifeItems,
	].sort((a, b) => {
		const timeA = a.data.published.getTime();
		const timeB = b.data.published.getTime();
		return timeB - timeA;
	});
}

export type Category = {
	name: string;
	count: number;
	url: string;
};

export async function getCategoryList(): Promise<Category[]> {
	const allBlogPosts = await getCollection<"posts">("posts", ({ data }) => {
		return import.meta.env.PROD ? data.draft !== true : true;
	});
	const count: { [key: string]: number } = {};
	allBlogPosts.forEach((post: { data: { category: string | null } }) => {
		if (!post.data.category) {
			const ucKey = i18n(I18nKey.uncategorized);
			count[ucKey] = count[ucKey] ? count[ucKey] + 1 : 1;
			return;
		}

		const categoryName =
			typeof post.data.category === "string"
				? post.data.category.trim()
				: String(post.data.category).trim();

		count[categoryName] = count[categoryName] ? count[categoryName] + 1 : 1;
	});

	const lst = Object.keys(count).sort((a, b) => {
		return (
			count[b] - count[a] || a.toLowerCase().localeCompare(b.toLowerCase())
		);
	});

	const ret: Category[] = [];
	for (const c of lst) {
		ret.push({
			name: c,
			count: count[c],
			url: getCategoryUrl(c),
		});
	}
	return ret;
}

/**
 * 对标题进行分词，支持中英文混合
 * 使用 Intl.Segmenter 对中文分词，英文按空格分词
 * 过滤标点和空白，英文统一小写
 */
function tokenizeTitle(title: string): Set<string> {
	const tokens = new Set<string>();
	const segmenter = new Intl.Segmenter("zh", { granularity: "word" });
	for (const { segment, isWordLike } of segmenter.segment(title)) {
		if (!isWordLike) continue;
		tokens.add(segment.toLowerCase());
	}
	return tokens;
}

/**
 * 计算两个集合的 Jaccard 相似度
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
	if (a.size === 0 && b.size === 0) return 0;
	let intersection = 0;
	for (const item of a) {
		if (b.has(item)) intersection++;
	}
	const union = a.size + b.size - intersection;
	return union === 0 ? 0 : intersection / union;
}

/**
 * 获取相关文章推荐
 * 评分公式: totalScore = tagMatchScore + titleSimilarityScore + timeFreshnessScore + categoryBonus
 * - tagMatchScore (0-100): 标签 Jaccard 相似度 × 100
 * - titleSimilarityScore (0-100): 标题分词 Jaccard 相似度 × 100
 * - timeFreshnessScore (0-30): 6 个月半衰期指数衰减
 * - categoryBonus (0 or 10): 同分类加 10 分
 */
export async function getRelatedPosts(
	currentPost: CollectionEntry<"posts">,
	maxCount = 5,
): Promise<PostForList[]> {
	const allPosts = await getCollection<"posts">("posts", ({ data }) => {
		return import.meta.env.PROD ? data.draft !== true : true;
	});

	// 排除自身和加密文章
	const candidates = allPosts.filter(
		(p) => p.id !== currentPost.id && !p.data.password,
	);

	const currentTags = new Set(currentPost.data.tags || []);
	const currentTokens = tokenizeTitle(currentPost.data.title);
	const currentCategory = currentPost.data.category || "";
	const now = Date.now();

	const scored = candidates.map((post) => {
		const postTags = new Set(post.data.tags || []);

		// tagMatchScore (0-100)
		const tagMatchScore = jaccardSimilarity(currentTags, postTags) * 100;

		// titleSimilarityScore (0-100)
		const postTokens = tokenizeTitle(post.data.title);
		const titleSimilarityScore =
			jaccardSimilarity(currentTokens, postTokens) * 100;

		// timeFreshnessScore (0-30): 6 个月半衰期
		const daysSincePublished =
			(now - new Date(post.data.published).getTime()) / (1000 * 60 * 60 * 24);
		const timeFreshnessScore =
			30 * Math.exp((-Math.LN2 * daysSincePublished) / 180);

		// categoryBonus (0 or 10)
		const postCategory = post.data.category || "";
		const categoryBonus =
			currentCategory && postCategory && currentCategory === postCategory
				? 10
				: 0;

		const totalScore =
			tagMatchScore + titleSimilarityScore + timeFreshnessScore + categoryBonus;

		return {
			post,
			totalScore,
			tagMatchScore,
			timeFreshnessScore,
			categoryBonus,
		};
	});

	// 按总分降序排列
	scored.sort((a, b) => b.totalScore - a.totalScore);

	// 优先取有标签匹配的
	const withTagMatch = scored.filter((s) => s.tagMatchScore > 0);
	const withoutTagMatch = scored.filter((s) => s.tagMatchScore === 0);

	const result: PostForList[] = [];

	for (const s of withTagMatch) {
		if (result.length >= maxCount) break;
		result.push({ id: s.post.id, data: s.post.data });
	}

	// 不足时从剩余候选中按 timeFreshnessScore + categoryBonus 降序补充
	if (result.length < maxCount) {
		withoutTagMatch.sort(
			(a, b) =>
				b.timeFreshnessScore +
				b.categoryBonus -
				(a.timeFreshnessScore + a.categoryBonus),
		);
		for (const s of withoutTagMatch) {
			if (result.length >= maxCount) break;
			result.push({ id: s.post.id, data: s.post.data });
		}
	}

	return result;
}
