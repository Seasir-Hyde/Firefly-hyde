<script lang="ts">
import { onDestroy, onMount } from "svelte";
import { musicVisualizerConfig } from "@/config/musicConfig";
import { AudioAnalyzer } from "./AudioAnalyzer";
import { extractDominantColor } from "./colorExtractor";
import LyricsOverlay from "./LyricsOverlay.svelte";
import ThreeScene from "./ThreeScene.svelte";
import VisualizerControls from "./VisualizerControls.svelte";

const audioAnalyzer = new AudioAnalyzer();
let sceneReady = $state(false);
let backgroundColor = $state(
	musicVisualizerConfig.background?.dark ?? "#0a0a15",
);
let accentColor = $state<string | null>(null);
let colorMode = $state<"dynamic" | "theme">("dynamic");

function syncPageBackground() {
	backgroundColor = document.documentElement.classList.contains("dark")
		? (musicVisualizerConfig.background?.dark ?? "#0a0a15")
		: (musicVisualizerConfig.background?.light ?? "#ffffff");
	const pageEl = document.querySelector(".music-visualizer-page");
	if (pageEl instanceof HTMLElement) {
		pageEl.style.setProperty("--music-page-bg", backgroundColor);
	}
}

function connectAudio() {
	const audio = document.getElementById(
		"firefly-music-audio",
	) as HTMLAudioElement | null;
	if (!audio) {
		setTimeout(connectAudio, 200);
		return;
	}
	if (!audio.crossOrigin) {
		audio.crossOrigin = "anonymous";
	}
	try {
		audioAnalyzer.connect(audio);
	} catch (e) {
		console.warn("[MusicVisualizer] AudioAnalyzer connect failed:", e);
	}

	if (audioCtxState() === "suspended") {
		audioAnalyzer.resume();
	}
}

function audioCtxState() {
	return audioAnalyzer.audioCtx?.state || "running";
}

async function onTrackChange(e: CustomEvent) {
	const track = e.detail?.track;
	if (colorMode !== "dynamic") return;
	if (track?.pic) {
		const color = await extractDominantColor(track.pic);
		if (color) {
			accentColor = color;
		}
	}
}

function onColorModeChange(e: CustomEvent) {
	colorMode = e.detail.mode;
	if (colorMode === "theme") {
		accentColor = null;
	} else {
		// Re-extract color for current track
		const mgr = window.__fireflyMusic;
		if (mgr) {
			const state = mgr.getState();
			if (state.track?.pic) {
				extractDominantColor(state.track.pic).then((color) => {
					if (color) accentColor = color;
				});
			}
		}
	}
}

onMount(() => {
	syncPageBackground();

	// Initialize color mode from localStorage
	const savedColorMode = localStorage.getItem("music-color-mode");
	if (savedColorMode === "theme" || savedColorMode === "dynamic") {
		colorMode = savedColorMode;
		if (colorMode === "theme") accentColor = null;
	}

	const themeObserver = new MutationObserver(syncPageBackground);
	themeObserver.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ["class"],
	});

	const mgr = window.__fireflyMusic;
	if (!mgr) {
		const waitForMgr = () => {
			if (window.__fireflyMusic) {
				connectAudio();
			} else {
				setTimeout(waitForMgr, 100);
			}
		};
		waitForMgr();
	} else {
		if (!mgr.getState().initialized) {
			mgr.init();
		}
		connectAudio();
	}

	const handleFirstClick = () => {
		audioAnalyzer.resume();
		document.removeEventListener("click", handleFirstClick);
	};
	document.addEventListener("click", handleFirstClick);

	window.addEventListener("fm:track", onTrackChange as EventListener);
	window.addEventListener("fm:color-mode-changed", onColorModeChange as EventListener);

	// 导航栏自动隐藏：初始显示3秒后渐隐，鼠标移到顶部区域渐显
	const navbar = document.querySelector(".music-navbar");
	let hideTimer: ReturnType<typeof setTimeout>;
	let hidden = false;
	const TRIGGER_ZONE = 80;

	function showNavbar() {
		clearTimeout(hideTimer);
		if (hidden) {
			navbar?.classList.remove("navbar-hidden");
			hidden = false;
		}
	}

	function startHideTimer() {
		clearTimeout(hideTimer);
		hideTimer = setTimeout(() => {
			if (!hidden) {
				navbar?.classList.add("navbar-hidden");
				hidden = true;
			}
		}, 600);
	}

	function onMouseMove(e: MouseEvent) {
		if (e.clientY < TRIGGER_ZONE) {
			showNavbar();
		} else if (!hidden) {
			startHideTimer();
		}
	}

	if (navbar) {
		hideTimer = setTimeout(() => {
			navbar.classList.add("navbar-hidden");
			hidden = true;
		}, 3000);

		document.addEventListener("mousemove", onMouseMove, { passive: true });
	}

	return () => {
		themeObserver.disconnect();
		document.removeEventListener("click", handleFirstClick);
		window.removeEventListener("fm:track", onTrackChange as EventListener);
		window.removeEventListener("fm:color-mode-changed", onColorModeChange as EventListener);
		clearTimeout(hideTimer);
		document.removeEventListener("mousemove", onMouseMove);
	};
});

onDestroy(() => {
	audioAnalyzer.disconnect();
});
</script>

<div class="music-visualizer" style={`background: ${backgroundColor};`}>
	<div
		class="mv-three-stage"
		class:mv-three-stage--ready={sceneReady}
	>
		<ThreeScene
			{audioAnalyzer}
			{backgroundColor}
			{accentColor}
			onSceneReady={() => (sceneReady = true)}
		/>
	</div>

	<nav class="music-navbar">
		<a href="/" class="music-navbar-title" title="返回首页">HydeMusic</a>
		<div class="music-navbar-links">
			<a href="/" class="music-navbar-link">首页</a>
			<a href="/archive/" class="music-navbar-link">归档</a>
			<a href="/about/" class="music-navbar-link">关于</a>
			<a href="/friends/" class="music-navbar-link">友链</a>
			<a href="/music/" class="music-navbar-link active">音乐</a>
		</div>
	</nav>

	<LyricsOverlay />

	<VisualizerControls />
</div>