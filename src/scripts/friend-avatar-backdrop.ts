/**
 * 友链卡片头像取景背景的降级运行时。
 *
 * 背景层复用友链头像图（imgurl）作为卡片底纹。头像地址多为外链，
 * 存在 404、防盗链、CORS/网络不可达等导致图片加载失败的情况；
 * 此时若不做处理，浏览器会渲染破图图标，破坏卡片观感。
 *
 * 处理策略：
 * 1. 监听图片 error 事件，打上 data-friend-backdrop-failed 标记；
 * 2. 样式层据此隐藏背景层，卡片回退为纯底色，视觉上与"无背景"一致；
 * 3. 同步对头像本体做兜底：加载失败时移出图片，保留头像容器的占位底色；
 * 4. 兼容 Swup 页面替换与 Astro 客户端路由，重新扫描已插入的节点。
 */

/** 背景层选择器。 */
const BACKDROP_SELECTOR = "img[data-friend-avatar-backdrop]";
/** 头像本体选择器。 */
const AVATAR_SELECTOR = "img[data-friend-avatar]";

/** 标记背景层加载失败，供样式层隐藏。 */
function markBackdropFailed(image: HTMLImageElement): void {
	image.setAttribute("data-friend-backdrop-failed", "");
}

/**
 * 头像本体加载失败时移除图片节点。
 * 头像容器本身带有 bg-zinc-100 / dark:bg-zinc-800 占位底色，
 * 移除破图后容器仍是一个干净的圆形色块。
 */
function handleAvatarFailure(image: HTMLImageElement): void {
	image.setAttribute("data-friend-avatar-failed", "");
}

/**
 * 统一处理加载失败。
 * background 与 avatar 共用同一张图，两者会同时失败，需一并标记。
 */
function handleFailure(image: HTMLImageElement): void {
	if (image.matches(BACKDROP_SELECTOR)) markBackdropFailed(image);
	if (image.matches(AVATAR_SELECTOR)) handleAvatarFailure(image);
}

/** 判断一个 <img> 是否已经加载失败（自然宽度为 0）。 */
function hasAlreadyFailed(image: HTMLImageElement): boolean {
	return image.complete && image.naturalWidth === 0;
}

/**
 * 为单张图片绑定错误处理。
 * error 事件不会冒泡，需在捕获阶段监听。
 */
function bindImage(image: HTMLImageElement): void {
	if (image.dataset.friendBackdropBound === "true") return;
	image.dataset.friendBackdropBound = "true";

	// 已缓存的失败图片不会再次触发 error，需主动检查。
	if (hasAlreadyFailed(image)) {
		handleFailure(image);
		return;
	}

	image.addEventListener("error", () => handleFailure(image));
}

/** 扫描文档内所有友链头像图片并绑定降级处理。 */
function scanBackdrops(root: ParentNode = document): void {
	for (const image of root.querySelectorAll<HTMLImageElement>(
		`${BACKDROP_SELECTOR}, ${AVATAR_SELECTOR}`,
	)) {
		bindImage(image);
	}
}

/** 头像本体失败时的兜底样式：移出破图，保留容器底色。 */
const AVATAR_FAILURE_STYLE = `
.friend-card-avatar img[data-friend-avatar-failed] {
	display: none;
}
`;

function installStyle(): void {
	if (document.getElementById("friend-avatar-backdrop-fallback-style")) return;
	const style = document.createElement("style");
	style.id = "friend-avatar-backdrop-fallback-style";
	style.textContent = AVATAR_FAILURE_STYLE;
	document.head.appendChild(style);
}

// 页面内联样式由 Astro 打包，无需注入；此处保留以兼容外部调用场景。
if (typeof document !== "undefined" && document.head) {
	installStyle();
}

scanBackdrops();

/**
 * document 捕获阶段兜底监听。
 *
 * 远程友链（api/friends 动态插入）与静态卡片走的是两套渲染路径，
 * 动态插入的时机无法保证早于 MutationObserver 回调，
 * 图片可能在绑定监听之前就已触发 error。
 * error 事件虽不冒泡，但在捕获阶段可被 document 捕获，
 * 因此这层兜底能覆盖所有漏网场景，无需依赖逐元素绑定。
 */
document.addEventListener(
	"error",
	(event) => {
		const target = event.target;
		if (
			target instanceof HTMLImageElement &&
			(target.matches(`${BACKDROP_SELECTOR}, ${AVATAR_SELECTOR}`) ||
				target.closest(".friend-card") !== null)
		) {
			handleFailure(target);
		}
	},
	true,
);

// Swup / Astro 客户端导航替换内容后，扫描新插入的节点。
for (const event of [
	"astro:page-load",
	"astro:after-swap",
	"swup:contentReplaced",
	"swup:page:view",
]) {
	document.addEventListener(event, () => scanBackdrops());
}

// 动态插入的卡片（如筛选、懒加载）同样需要绑定。
if (typeof MutationObserver !== "undefined") {
	new MutationObserver((mutations) => {
		const hasImages = mutations.some((mutation) =>
			[...mutation.addedNodes].some(
				(node) =>
					node instanceof Element &&
					(node.matches(`${BACKDROP_SELECTOR}, ${AVATAR_SELECTOR}`) ||
						node.querySelector(`${BACKDROP_SELECTOR}, ${AVATAR_SELECTOR}`)),
			),
		);
		if (hasImages) scanBackdrops();
	}).observe(document.body, { childList: true, subtree: true });
}
