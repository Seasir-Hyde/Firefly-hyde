<script lang="ts">
import Icon from "@components/common/Icon.svelte";
import { onDestroy, onMount } from "svelte";

interface Track {
	name: string;
	artist: string;
	pic?: string;
}

let currentTrack: Track | null = $state(null);
let playlist: Track[] = $state([]);
let currentIndex = $state(0);
let isPlaying = $state(false);
let volume = $state(0.6);
let isMuted = $state(false);
let playMode = $state(0);
let currentTimeStr = $state("0:00");
let durationStr = $state("0:00");
let progress = $state(0);
let isPlaylistOpen = $state(false);
let isMobile = $state(false);
let playlistListEl: HTMLDivElement;
let showSwitchDialog = $state(false);
let switchPlaylistId = $state("");
let isSwitching = $state(false);
let colorMode = $state<"dynamic" | "theme">("dynamic");

function toggleColorMode() {
	colorMode = colorMode === "dynamic" ? "theme" : "dynamic";
	localStorage.setItem("music-color-mode", colorMode);
	window.dispatchEvent(
		new CustomEvent("fm:color-mode-changed", { detail: { mode: colorMode } }),
	);
}

function syncPlaylistScroll() {
	if (!playlistListEl) return;
	const activeItem = playlistListEl.querySelector<HTMLElement>(
		".music-visualizer__playlist-item--active",
	);
	activeItem?.scrollIntoView({ block: "center", behavior: "smooth" });
}

function togglePlay() {
	window.__fireflyMusic?.togglePlay();
}

function playNext() {
	window.__fireflyMusic?.playNext();
}

function playPrev() {
	window.__fireflyMusic?.playPrev();
}

function cycleMode() {
	window.__fireflyMusic?.cyclePlayMode();
}

function toggleMute() {
	window.__fireflyMusic?.toggleMute();
}

function onVolumeClick(e: MouseEvent) {
	const target = e.currentTarget as HTMLElement;
	const rect = target.getBoundingClientRect();
	const x = e.clientX - rect.left;
	const val = Math.max(0, Math.min(1, x / rect.width));
	window.__fireflyMusic?.setVolume(val);
}

function onProgressClick(e: MouseEvent) {
	const target = e.currentTarget as HTMLElement;
	const rect = target.getBoundingClientRect();
	const x = e.clientX - rect.left;
	const percent = Math.max(0, Math.min(1, x / rect.width));
	window.__fireflyMusic?.seek(percent);
}

function playTrack(index: number) {
	window.__fireflyMusic?.playTrackByIndex(index);
	isPlaylistOpen = false;
}

function togglePlaylist() {
	isPlaylistOpen = !isPlaylistOpen;
}

function closePlaylist() {
	isPlaylistOpen = false;
}

function openSwitchDialog() {
	showSwitchDialog = true;
}

function closeSwitchDialog() {
	showSwitchDialog = false;
	switchPlaylistId = "";
}

async function handleSwitchPlaylist() {
	const id = switchPlaylistId.trim();
	if (!id) return;
	isSwitching = true;
	try {
		await window.__fireflyMusic?.switchPlaylist(id);
		closeSwitchDialog();
	} catch (e) {
		console.warn("[VisualizerControls] switchPlaylist failed:", e);
	} finally {
		isSwitching = false;
	}
}

function onSwitchKeydown(e: KeyboardEvent) {
	if (e.key === "Enter") {
		handleSwitchPlaylist();
	} else if (e.key === "Escape") {
		closeSwitchDialog();
	}
}

function syncState() {
	const mgr = window.__fireflyMusic;
	if (!mgr) return;
	const state = mgr.getState();
	currentTrack = state.track;
	playlist = state.playlist || [];
	currentIndex = state.currentIndex || 0;
	isPlaying = state.isPlaying;
	volume = state.volume;
	isMuted = state.isMuted;
	playMode = state.playMode;
	currentTimeStr = state.currentTimeStr;
	durationStr = state.durationStr;
	progress = state.progress;
	setTimeout(syncPlaylistScroll, 0);
}

function onInit() {
	syncState();
}

function onTrack(e: CustomEvent) {
	currentTrack = e.detail.track;
	currentIndex = e.detail.index;
	progress = 0;
	currentTimeStr = "0:00";
	durationStr = "0:00";
	setTimeout(syncPlaylistScroll, 0);
}

function onPlayState(e: CustomEvent) {
	isPlaying = e.detail.isPlaying;
}

function onTime(e: CustomEvent) {
	currentTimeStr = e.detail.currentTimeStr;
	durationStr = e.detail.durationStr;
	progress = e.detail.progress;
}

function onVolume(e: CustomEvent) {
	volume = e.detail.volume;
	isMuted = e.detail.isMuted;
}

function onMode(e: CustomEvent) {
	playMode = e.detail.playMode;
}

function onPlaylistChanged(e: CustomEvent) {
	playlist = e.detail.playlist || [];
	currentIndex = 0;
	currentTrack = playlist[0] || null;
	progress = 0;
	currentTimeStr = "0:00";
	durationStr = "0:00";
}

async function handleResetPlaylist() {
	isSwitching = true;
	try {
		await window.__fireflyMusic?.resetPlaylist();
		closeSwitchDialog();
	} catch (e) {
		console.warn("[VisualizerControls] resetPlaylist failed:", e);
	} finally {
		isSwitching = false;
	}
}

onMount(() => {
	const mgr = window.__fireflyMusic;
	if (mgr && !mgr.getState().initialized) {
		mgr.init();
	}
	setTimeout(syncState, 100);

	isMobile = window.innerWidth < 769;

	const savedColorMode = localStorage.getItem("music-color-mode");
	if (savedColorMode === "theme" || savedColorMode === "dynamic") {
		colorMode = savedColorMode;
	}

	window.addEventListener("fm:init", onInit);
	window.addEventListener("fm:track", onTrack as EventListener);
	window.addEventListener("fm:play-state", onPlayState as EventListener);
	window.addEventListener("fm:time", onTime as EventListener);
	window.addEventListener("fm:volume", onVolume as EventListener);
	window.addEventListener("fm:mode", onMode as EventListener);
	window.addEventListener("fm:playlist-changed", onPlaylistChanged as EventListener);
});

onDestroy(() => {
	window.removeEventListener("fm:init", onInit);
	window.removeEventListener("fm:track", onTrack as EventListener);
	window.removeEventListener("fm:play-state", onPlayState as EventListener);
	window.removeEventListener("fm:time", onTime as EventListener);
	window.removeEventListener("fm:volume", onVolume as EventListener);
	window.removeEventListener("fm:mode", onMode as EventListener);
	window.removeEventListener("fm:playlist-changed", onPlaylistChanged as EventListener);
});
</script>

<div class="music-controls-bar">
	<div class="music-controls-progress-row">
		<span class="music-controls-time">{currentTimeStr}</span>
		<div
			class="music-controls-progress"
			onclick={onProgressClick}
			role="slider"
			aria-label="进度"
		>
			<div
				class="music-controls-progress-fill"
				style={`width: ${progress}%`}
			/>
		</div>
		<span class="music-controls-time">{durationStr}</span>
	</div>

	<div class="music-controls-row">
		<div class="music-controls-left">
			<div class="music-controls-cover">
				{#if currentTrack?.pic}
					<img src={currentTrack.pic} alt="" />
				{:else}
					<Icon icon="material-symbols:music-note-rounded" size="lg" />
				{/if}
			</div>
			<div class="music-controls-track-info">
				<div class="music-controls-track-name">
					{currentTrack?.name || "未播放"}
				</div>
				<div class="music-controls-track-artist">
					{currentTrack?.artist || ""}
				</div>
			</div>
		</div>

		<div class="music-controls-center">
			<button
				class="music-controls-btn"
				onclick={playPrev}
				title="上一首"
				aria-label="上一首"
			>
				<Icon icon="material-symbols:skip-previous-rounded" size="2xl" />
			</button>

			<button
				class="music-controls-btn music-controls-btn--play"
				onclick={togglePlay}
				title={isPlaying ? "暂停" : "播放"}
				aria-label={isPlaying ? "暂停" : "播放"}
			>
				{#if isPlaying}
					<Icon icon="material-symbols:pause-rounded" size="2xl" />
				{:else}
					<Icon icon="material-symbols:play-arrow-rounded" size="2xl" />
				{/if}
			</button>

			<button
				class="music-controls-btn"
				onclick={playNext}
				title="下一首"
				aria-label="下一首"
			>
				<Icon icon="material-symbols:skip-next-rounded" size="2xl" />
			</button>

			<button
				class="music-controls-btn"
				onclick={cycleMode}
				title="播放模式"
				aria-label="播放模式"
			>
				{#if playMode === 0}
					<Icon icon="material-symbols:repeat-rounded" size="lg" />
				{:else if playMode === 1}
					<Icon icon="material-symbols:repeat-one-rounded" size="lg" />
				{:else}
					<Icon icon="material-symbols:shuffle-rounded" size="lg" />
				{/if}
			</button>
		</div>

		<div class="music-controls-right">
			<button
				class="music-controls-btn"
				onclick={toggleColorMode}
				title={colorMode === "dynamic" ? "跟随封面取色" : "使用主题色"}
				aria-label={colorMode === "dynamic" ? "当前：跟随封面取色，点击切换为主题色" : "当前：使用主题色，点击切换为跟随封面取色"}
			>
				{#if colorMode === "dynamic"}
					<Icon icon="material-symbols:colorize-rounded" size="lg" />
				{:else}
					<Icon icon="material-symbols:palette" size="lg" />
				{/if}
			</button>

			<button
				class="music-controls-btn"
				onclick={openSwitchDialog}
				title="切换歌单"
				aria-label="切换歌单"
			>
				<Icon icon="material-symbols:playlist-play-rounded" size="lg" />
			</button>

			<button
				class="music-controls-btn"
				class:music-controls-btn--active={isPlaylistOpen}
				onclick={togglePlaylist}
				title={isPlaylistOpen ? "关闭歌单" : "打开歌单"}
				aria-label={isPlaylistOpen ? "关闭歌单" : "打开歌单"}
			>
				<Icon icon="material-symbols:queue-music-rounded" size="lg" />
			</button>

			<div class="music-controls-volume">
				<button
					class="music-controls-btn"
					onclick={toggleMute}
					title="音量"
					aria-label="音量"
				>
					{#if isMuted || volume === 0}
						<Icon icon="material-symbols:volume-off-rounded" size="lg" />
					{:else}
						<Icon icon="material-symbols:volume-up-rounded" size="lg" />
					{/if}
				</button>
				<div
					class="music-controls-volume-bar"
					onclick={onVolumeClick}
				>
					<div
						class="music-controls-volume-fill"
						style={`width: ${isMuted ? 0 : volume * 100}%`}
					/>
				</div>
			</div>
		</div>
	</div>
</div>

<aside
	id="music-visualizer-playlist-panel"
	class="music-visualizer__playlist-panel"
	class:music-visualizer__playlist-panel--open={isPlaylistOpen}
	aria-label="歌单切换"
	aria-hidden={!isPlaylistOpen}
	onclick={(e) => {
		if (e.target === e.currentTarget) {
			closePlaylist();
		}
	}}
>
	<div class="music-visualizer__playlist-stage">
		<div class="music-visualizer__playlist-timeline"></div>
		<div class="music-visualizer__playlist-header">
			<div>
				<div class="music-visualizer__playlist-kicker">PLAYLIST</div>
				<div class="music-visualizer__playlist-title">歌单切换</div>
			</div>
			<div class="music-visualizer__playlist-count">{playlist.length}</div>
		</div>

		<div
			bind:this={playlistListEl}
			class="music-visualizer__playlist-list"
			role="listbox"
			aria-label="当前歌单"
		>
			{#if playlist.length === 0}
				<div class="music-visualizer__playlist-empty">歌单加载中</div>
			{:else}
				{#each playlist as track, i}
					<button
						type="button"
						class="music-visualizer__playlist-item"
						class:music-visualizer__playlist-item--active={i === currentIndex}
						onclick={() => playTrack(i)}
						role="option"
						aria-selected={i === currentIndex}
						title={`${track.name} - ${track.artist}`}
					>
						<div class="music-visualizer__playlist-cover">
							{#if track.pic}
								<img src={track.pic} alt="" loading="lazy" />
							{:else}
								<Icon icon="material-symbols:music-note-rounded" size="sm" />
							{/if}
						</div>
						<div class="music-visualizer__playlist-meta">
							<div class="music-visualizer__playlist-name">{track.name}</div>
							<div class="music-visualizer__playlist-artist">{track.artist}</div>
						</div>
						{#if i === currentIndex}
							<div class="music-visualizer__playlist-eq" aria-hidden="true">
								<span></span>
								<span></span>
								<span></span>
							</div>
						{/if}
					</button>
				{/each}
			{/if}
		</div>
	</div>
</aside>

{#if showSwitchDialog}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="music-switch-overlay"
		onclick={closeSwitchDialog}
		onkeydown={(e) => e.key === "Escape" && closeSwitchDialog()}
		role="dialog"
		aria-modal="true"
		aria-label="切换歌单"
	>
		<div
			class="music-switch-dialog"
			onclick={(e) => e.stopPropagation()}
			onkeydown={onSwitchKeydown}
		>
			<div class="music-switch-header">
				<span class="music-switch-title">切换歌单</span>
				<button
					class="music-switch-close"
					onclick={closeSwitchDialog}
					aria-label="关闭"
				>
					<Icon icon="material-symbols:close-rounded" size="lg" />
				</button>
			</div>
			<div class="music-switch-body">
				<label class="music-switch-label" for="playlist-id-input">
					输入歌单ID
				</label>
				<input
					id="playlist-id-input"
					class="music-switch-input"
					type="text"
					bind:value={switchPlaylistId}
					placeholder="例如: 1234567890"
					onkeydown={onSwitchKeydown}
				/>
				<button
					class="music-switch-submit"
					onclick={handleSwitchPlaylist}
					disabled={isSwitching || !switchPlaylistId.trim()}
				>
					{isSwitching ? "切换中..." : "确认切换"}
				</button>
				<button
					class="music-switch-reset"
					onclick={handleResetPlaylist}
					disabled={isSwitching}
				>
					重置为默认歌单
				</button>
			</div>
		</div>
	</div>
{/if}