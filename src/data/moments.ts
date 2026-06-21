/**
 * 外部朋友圈数据获取脚本
 * 从 GitHub Gist 加载朋友圈数据并动态插入页面
 */

const cacheKey = "__externalMomentsCache";
const MARKER = "data-ext-inserted";

// ========== 配置获取函数 ==========

function getConfig() {
	const configScript = document.getElementById("moments-config");
	if (!configScript) {
		console.warn("[外部说说] 未找到配置脚本 #moments-config");
		return null;
	}

	const gistId = configScript.getAttribute("data-gist") || "";
	const fileName = configScript.getAttribute("data-file") || "";
	const defaultAuthor = configScript.getAttribute("data-author") || "";
	const defaultAvatar = configScript.getAttribute("data-avatar") || "";

	if (!gistId || !fileName) {
		console.warn("[外部说说] 配置不完整，跳过加载");
		return null;
	}

	return { gistId, fileName, defaultAuthor, defaultAvatar };
}

// ========== 工具函数 ==========

function formatTimeAgo(date: Date): string {
	const now = new Date();
	const diff = now.getTime() - date.getTime();
	const minutes = Math.floor(diff / 60000);
	const hours = Math.floor(diff / 3600000);
	const days = Math.floor(diff / 86400000);
	if (minutes < 1) return "刚刚";
	if (minutes < 60) return minutes + "分钟前";
	if (hours < 24) return hours + "小时前";
	if (days < 30) return days + "天前";
	return (
		date.getFullYear() +
		"-" +
		String(date.getMonth() + 1).padStart(2, "0") +
		"-" +
		String(date.getDate()).padStart(2, "0")
	);
}

function escapeHtml(text: string): string {
	const div = document.createElement("div");
	div.textContent = text;
	return div.innerHTML;
}

function renderMarkdown(text: string): string {
	return escapeHtml(text)
		.replace(/\n/g, "<br>")
		.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
		.replace(/\*(.*?)\*/g, "<em>$1</em>")
		.replace(
			/(https?:\/\/[^\s<]+)/g,
			'<a href="$1" target="_blank" rel="noopener" style="color:var(--primary);text-decoration:underline;">$1</a>',
		);
}

function getGridCols(count: number): number {
	if (count === 1) return 1;
	if (count === 2 || count === 4) return 2;
	return 3;
}

function parseImages(raw: unknown): string[] {
	if (!raw) return [];
	if (Array.isArray(raw)) return raw.filter(Boolean) as string[];
	if (typeof raw === "string" && raw.trim()) {
		return raw
			.split(/[,;]/)
			.map((s) => s.trim())
			.filter(Boolean);
	}
	return [];
}

// ========== DOM 创建函数 ==========

function createCard(m: {
	author?: string;
	avatar?: string;
	published: string;
	content?: string;
	images?: unknown;
	tags?: string[];
	location?: string;
	pinned?: boolean;
}): HTMLElement {
	const config = getConfig();
	const defaultAuthor = config?.defaultAuthor || "";
	const defaultAvatar = config?.defaultAvatar || "";

	const author = m.author || defaultAuthor;
	const avatar = m.avatar || defaultAvatar;
	const date = new Date(m.published);
	const timeStr = formatTimeAgo(date);
	const content = renderMarkdown(m.content || "");
	const images = parseImages(m.images);
	const tags = m.tags || [];
	const location = m.location || "";

	const item = document.createElement("div");
	item.className = "wx-feed-item";
	item.setAttribute("data-published", date.toISOString());
	item.setAttribute(MARKER, "1");

	const card = document.createElement("div");
	card.className = "moment-card";

	const accent = document.createElement("div");
	accent.className = "card-accent-bar";
	card.appendChild(accent);

	const header = document.createElement("div");
	header.className = "card-header";

	const avatarDiv = document.createElement("div");
	avatarDiv.className = "card-avatar";
	const avatarImg = document.createElement("img");
	avatarImg.src = avatar;
	avatarImg.alt = author;
	avatarImg.className = "avatar-img";
	avatarImg.loading = "lazy";
	avatarDiv.appendChild(avatarImg);

	const userInfo = document.createElement("div");
	userInfo.className = "card-user-info";

	const userRow = document.createElement("div");
	userRow.className = "user-row";
	const userName = document.createElement("span");
	userName.className = "user-name";
	userName.textContent = author;
	userRow.appendChild(userName);

	if (m.pinned) {
		const badge = document.createElement("span");
		badge.className = "pinned-badge";
		badge.innerHTML =
			'<svg t="1781845121920" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1661" width="14" height="14"><path d="M829.31 607.6L548.07 234.1c-12.93-19.17-41.01-19.61-54.82-0.89L197.3 606.71c-16.05 22.28-0.45 53.49 27.19 53.49h139.06v173.38c0 26.3 21.39 48.14 48.14 48.14H612.7c26.29 0 48.13-21.39 48.13-48.14V660.2h140.4c27.19 0 43.24-30.31 28.08-52.6z" p-id="1662" fill="var(--primary)"></path><path d="M226.72 218.06h570.5c20.95 0 37.89-16.94 37.89-37.88s-16.94-37.88-37.89-37.88h-570.5c-20.95 0-37.88 16.94-37.88 37.88s16.94 37.88 37.88 37.88z" p-id="1663" fill="var(--primary)"></path></svg>';
		const badgeText = document.createElement("span");
		badgeText.textContent = "置顶";
		badge.appendChild(badgeText);
		userRow.appendChild(badge);
	}

	const metaRow = document.createElement("div");
	metaRow.className = "meta-row";
	const time = document.createElement("time");
	time.textContent = timeStr;
	metaRow.appendChild(time);

	if (location) {
		const dot = document.createElement("span");
		dot.className = "meta-dot";
		dot.textContent = "·";
		metaRow.appendChild(dot);
		const loc = document.createElement("span");
		loc.className = "location";
		loc.innerHTML =
			'<svg class="location-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
		const locText = document.createTextNode(location);
		loc.appendChild(locText);
		metaRow.appendChild(loc);
	}

	userInfo.appendChild(userRow);
	userInfo.appendChild(metaRow);
	header.appendChild(avatarDiv);
	header.appendChild(userInfo);
	card.appendChild(header);

	const contentDiv = document.createElement("div");
	contentDiv.className = "card-content";
	const markdownDiv = document.createElement("div");
	markdownDiv.className = "moment-markdown dark:text-neutral-100";
	markdownDiv.innerHTML = content;
	contentDiv.appendChild(markdownDiv);
	card.appendChild(contentDiv);

	if (images.length > 0) {
		const grid = document.createElement("div");
		grid.className = "card-images image-cols-" + getGridCols(images.length);
		images.forEach((src) => {
			const imgWrap = document.createElement("div");
			imgWrap.className = "image-item";
			const img = document.createElement("img");
			img.src = src;
			img.loading = "lazy";
			img.alt = "";
			img.className = "image-img";
			img.setAttribute("data-fancybox", "ext-moment");
			imgWrap.appendChild(img);
			grid.appendChild(imgWrap);
		});
		card.appendChild(grid);
	}

	if (tags.length > 0) {
		const tagDiv = document.createElement("div");
		tagDiv.className = "card-tags";
		tags.forEach((t) => {
			const a = document.createElement("a");
			a.href = "/archive/?tag=" + encodeURIComponent(t.trim());
			a.className = "tag-item";
			a.textContent = "#" + t.trim();
			a.style.textDecoration = "none";
			tagDiv.appendChild(a);
		});
		card.appendChild(tagDiv);
	}

	item.appendChild(card);
	return item;
}

function createPinnedPreview(m: {
	content?: string;
	images?: unknown;
	published?: string;
}): HTMLElement {
	const body = (m.content || "").trim();
	const images = parseImages(m.images);
	const preview = document.createElement("div");
	preview.className = "wx-pinned-preview";
	preview.setAttribute("data-published", m.published || "");

	if (images.length > 0) {
		const grid = document.createElement("div");
		const count = Math.min(images.length, 9);
		grid.className = "wx-pimgs wx-pimgs-" + count;
		images.forEach((src) => {
			const img = document.createElement("img");
			img.src = src;
			img.className = "wx-pinned-img";
			img.alt = "";
			img.loading = "lazy";
			grid.appendChild(img);
		});
		preview.appendChild(grid);
	} else {
		const p = document.createElement("p");
		p.className = "wx-ptxt";
		let text = body.slice(0, 60);
		if (body.length > 60) text += "...";
		p.textContent = text;
		preview.appendChild(p);
	}
	return preview;
}

// ========== 数据插入函数 ==========

interface ExternalMoment {
	id: string;
	content: string;
	published: string;
	images?: string[];
	tags?: string[];
	location?: string;
	pinned?: boolean;
	author?: string;
	avatar?: string;
}

function insertExternalMoments(extMoments: ExternalMoment[]): void {
	const feed = document.getElementById("moments-feed");
	if (!feed || !extMoments || extMoments.length === 0) return;

	extMoments.sort(
		(a, b) => new Date(b.published).getTime() - new Date(a.published).getTime(),
	);

	const pinned: ExternalMoment[] = [];
	const normal: ExternalMoment[] = [];
	extMoments.forEach((m) => {
		if (m.pinned) {
			pinned.push(m);
		} else {
			normal.push(m);
		}
	});

	// 插入置顶说说预览
	if (pinned.length > 0) {
		const pinnedBlock = document.getElementById("pinned-block");
		const pinnedItems = document.getElementById("pinned-items");
		if (pinnedBlock && pinnedItems) {
			pinnedBlock.style.display = "";
			pinned.forEach((m) => {
				const el = createPinnedPreview(m);
				el.setAttribute(MARKER, "1");
				pinnedItems.appendChild(el);
			});
		}
	}

	// 移除空状态
	const emptyEl = document.getElementById("moments-empty");
	if (emptyEl) emptyEl.remove();

	// 获取本地说说时间列表
	const localItems = feed.querySelectorAll(".wx-feed-item[data-published]");
	const localTimes: { el: Element; time: number }[] = [];
	localItems.forEach((el) => {
		localTimes.push({
			el: el,
			time: new Date(el.getAttribute("data-published") || "").getTime(),
		});
	});

	// 按时间顺序插入外部说说
	normal.forEach((m) => {
		const card = createCard(m);
		const extTime = new Date(m.published).getTime();
		let inserted = false;
		for (let i = 0; i < localTimes.length; i++) {
			if (localTimes[i].time < extTime) {
				feed.insertBefore(card, localTimes[i].el);
				inserted = true;
				break;
			}
		}
		if (!inserted) {
			feed.appendChild(card);
		}
	});

	// 触发事件通知 Fancybox 重新绑定
	document.dispatchEvent(new Event("moments:loaded"));
}

function hasExternalMoments(): boolean {
	const feed = document.getElementById("moments-feed");
	if (!feed) return false;
	return (
		feed.hasAttribute(MARKER) || feed.querySelector("[" + MARKER + "]") !== null
	);
}

// ========== 置顶说说页面处理 ==========

function insertPinnedExternal(extMoments: ExternalMoment[]): void {
	const feed = document.getElementById("pinned-feed");
	if (!feed || !extMoments || extMoments.length === 0) return;

	const pinned = extMoments.filter((m) => m.pinned);
	if (pinned.length === 0) return;

	// 移除空状态
	const emptyEl = feed.querySelector(".empty-state");
	if (emptyEl) emptyEl.remove();

	pinned.sort(
		(a, b) => new Date(b.published).getTime() - new Date(a.published).getTime(),
	);
	pinned.forEach((m) => {
		const el = createCard(m);
		el.setAttribute(MARKER, "1");
		feed.appendChild(el);
	});
	feed.setAttribute(MARKER, "1");

	// 更新计数
	const countEl = document.querySelector(".pinned-count");
	if (countEl) {
		const existing = Number.parseInt(countEl.textContent || "0") || 0;
		countEl.textContent = existing + pinned.length + " 条";
	}

	// 触发事件
	document.dispatchEvent(new Event("moments:loaded"));
}

function hasExternalPinned(): boolean {
	const feed = document.getElementById("pinned-feed");
	if (!feed) return false;
	return (
		feed.hasAttribute(MARKER) || feed.querySelector("[" + MARKER + "]") !== null
	);
}

// ========== 数据获取函数 ==========

interface MomentsCache {
	data: ExternalMoment[];
	time: number;
}

function fetchMoments(): void {
	const feed = document.getElementById("moments-feed");
	if (!feed) return;
	if (hasExternalMoments()) return;

	const config = getConfig();
	if (!config) return;

	// 使用缓存（5分钟有效期）
	const cache = (window as unknown as Record<string, MomentsCache>)[cacheKey];
	if (cache && cache.time > Date.now() - 300000) {
		insertExternalMoments(cache.data);
		feed.setAttribute(MARKER, "1");
		return;
	}

	// 获取 GitHub Token（可选）
	const token = localStorage.getItem("gh_moments_token") || "";
	const headers: Record<string, string> = {
		Accept: "application/vnd.github+json",
	};
	if (token) headers["Authorization"] = "Bearer " + token;

	fetch("https://api.github.com/gists/" + config.gistId, { headers })
		.then((r) => {
			if (!r.ok) throw new Error("HTTP " + r.status);
			return r.json();
		})
		.then((gist) => {
			const file = gist.files[config.fileName];
			if (!file) return;
			const moments = JSON.parse(file.content || "[]") as ExternalMoment[];
			if (!moments.length) return;
			(window as unknown as Record<string, MomentsCache>)[cacheKey] = {
				data: moments,
				time: Date.now(),
			};
			insertExternalMoments(moments);
			feed.setAttribute(MARKER, "1");
		})
		.catch((e) => {
			console.warn("[外部说说] 加载失败:", e.message);
		});
}

function fetchPinned(): void {
	const feed = document.getElementById("pinned-feed");
	if (!feed) return;
	if (hasExternalPinned()) return;

	const config = getConfig();
	if (!config) return;

	// 使用缓存
	const cache = (window as unknown as Record<string, MomentsCache>)[cacheKey];
	if (cache && cache.time > Date.now() - 300000) {
		insertPinnedExternal(cache.data);
		return;
	}

	const token = localStorage.getItem("gh_moments_token") || "";
	const headers: Record<string, string> = {
		Accept: "application/vnd.github+json",
	};
	if (token) headers["Authorization"] = "Bearer " + token;

	fetch("https://api.github.com/gists/" + config.gistId, { headers })
		.then((r) => {
			if (!r.ok) throw new Error("HTTP " + r.status);
			return r.json();
		})
		.then((gist) => {
			const file = gist.files[config.fileName];
			if (!file) return;
			const moments = JSON.parse(file.content || "[]") as ExternalMoment[];
			if (!moments.length) return;
			(window as unknown as Record<string, MomentsCache>)[cacheKey] = {
				data: moments,
				time: Date.now(),
			};
			insertPinnedExternal(moments);
		})
		.catch((e) => {
			console.warn("[外部置顶说说] 加载失败:", e.message);
		});
}

// ========== 初始化 ==========

// 确保 DOM 加载完成后再执行
function initMoments() {
	if (document.getElementById("moments-feed")) {
		fetchMoments();
	}
	if (document.getElementById("pinned-feed")) {
		fetchPinned();
	}
}

// 首次页面加载
if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", initMoments);
} else {
	// DOM 已经加载完成
	initMoments();
}

// Swup 页面切换后重新加载（监听两种事件名称）
document.addEventListener("swup:content:replace", () => {
	setTimeout(() => {
		if (document.getElementById("moments-feed") && !hasExternalMoments()) {
			fetchMoments();
		}
		if (document.getElementById("pinned-feed") && !hasExternalPinned()) {
			fetchPinned();
		}
	}, 50);
});

document.addEventListener("swup:contentReplaced", () => {
	setTimeout(() => {
		if (document.getElementById("moments-feed") && !hasExternalMoments()) {
			fetchMoments();
		}
		if (document.getElementById("pinned-feed") && !hasExternalPinned()) {
			fetchPinned();
		}
	}, 50);
});
