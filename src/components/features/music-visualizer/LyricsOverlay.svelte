<script lang="ts">
import { onDestroy, onMount, tick } from "svelte";

interface LyricLine {
	time: number;
	text: string;
}

type LyricStatus = "loading" | "loaded" | "none" | "failed";

let containerEl: HTMLDivElement;
let trackEl: HTMLDivElement;
let lyrics: LyricLine[] = $state([]);
let currentIndex = $state(-1);
let lyricsStatus = $state<LyricStatus>("loading");
let offsetY = $state(0);
let statusLabels = $state({
	loading: "正在加载歌词",
	none: "暂无歌词",
	failed: "歌词加载失败",
});

const statusText = $derived(
	lyricsStatus === "failed"
		? statusLabels.failed
		: lyricsStatus === "none"
			? statusLabels.none
			: statusLabels.loading,
);
const hasLyrics = $derived(lyrics.length > 0);

function syncLyricOffset() {
	if (!containerEl || !trackEl || lyrics.length === 0) {
		offsetY = 0;
		return;
	}

	const nextIndex = currentIndex >= 0 ? currentIndex : 0;
	const activeEl = trackEl.querySelector<HTMLElement>(
		`[data-lyric-index="${nextIndex}"]`,
	);
	if (!activeEl) return;

	const lyricCenter = activeEl.offsetTop + activeEl.offsetHeight / 2;
	const targetCenter =
		containerEl.clientHeight * (currentIndex >= 0 ? 0.5 : 0.58);
	offsetY = targetCenter - lyricCenter;
}

async function queueLyricOffset() {
	await tick();
	syncLyricOffset();
}

function onLyrics(e: CustomEvent) {
	lyrics = e.detail.lyrics || [];
	lyricsStatus = e.detail.status || (lyrics.length > 0 ? "loaded" : "none");
	currentIndex = -1;
	void queueLyricOffset();
}

function onLrcIndex(e: CustomEvent) {
	currentIndex = e.detail.index;
	void queueLyricOffset();
}

onMount(() => {
	const mgr = window.__fireflyMusic;
	if (mgr) {
		const state = mgr.getState();
		lyrics = state.lyrics || [];
		currentIndex = state.currentLrcIndex;
		statusLabels = {
			loading: state.config?.i18n?.loadingLyrics || statusLabels.loading,
			none: state.config?.i18n?.noLyrics || statusLabels.none,
			failed: state.config?.i18n?.failedLyrics || statusLabels.failed,
		};
		lyricsStatus =
			state.lyricsStatus || (lyrics.length > 0 ? "loaded" : "loading");
	}
	void queueLyricOffset();

	window.addEventListener("fm:lyrics", onLyrics as EventListener);
	window.addEventListener("fm:lrc-index", onLrcIndex as EventListener);
});

onDestroy(() => {
	window.removeEventListener("fm:lyrics", onLyrics as EventListener);
	window.removeEventListener("fm:lrc-index", onLrcIndex as EventListener);
});
</script>

<div bind:this={containerEl} class="music-visualizer__lyrics">
	<div class="music-visualizer__lyrics-stage">
		<div class="music-visualizer__lyrics-timeline"></div>
		{#if hasLyrics}
		<div
			bind:this={trackEl}
			class="music-visualizer__lyrics-inner"
			style={`transform: translateY(${offsetY}px)`}
		>
			{#each lyrics as line, i}
				<div
					class="music-visualizer__lyric-line"
					class:music-visualizer__lyric-line--active={i === currentIndex}
					class:music-visualizer__lyric-line--past={i < currentIndex}
					data-lyric-index={i}
				>
					<span class="music-visualizer__lyric-marker"></span>
					<span class="music-visualizer__lyric-text">{line.text}</span>
				</div>
			{/each}
		</div>
		{:else}
			<div class="music-visualizer__lyrics-empty" aria-live="polite">
				<span class="music-visualizer__lyric-marker music-visualizer__lyric-marker--empty"></span>
				<span>{statusText}</span>
			</div>
		{/if}
	</div>
</div>