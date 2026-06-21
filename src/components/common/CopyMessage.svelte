<!-- 复制内容提示组件 -->
<script lang="ts">
import { onMount } from "svelte";

const SHOW_DURATION = 3000;
let isVisible = $state(false);
let hideTimeout: ReturnType<typeof setTimeout> | null = null;

const showCopyMessage = () => {
	if (hideTimeout) {
		clearTimeout(hideTimeout);
		hideTimeout = null;
	}

	isVisible = false;
	setTimeout(() => {
		isVisible = true;
		hideTimeout = setTimeout(() => {
			isVisible = false;
		}, SHOW_DURATION);
	}, 10);
};

const handleCopy = () => {
	const selection = window.getSelection();
	if (selection?.toString().trim()) {
		showCopyMessage();
	}
};

onMount(() => {
	document.addEventListener("copy", handleCopy);
	return () => {
		document.removeEventListener("copy", handleCopy);
		if (hideTimeout) {
			clearTimeout(hideTimeout);
		}
	};
});
</script>

<div class="copy-message" class:show={isVisible}>
	<div class="message-background">
		<div class="progress-bar" class:active={isVisible}></div>
	</div>
	<div class="message-content">
		<span class="text">✨️ 复制成功，转载请标注本文地址</span>
	</div>
</div>

<style>
	.copy-message {
		--duration: 3000ms;
		--height: 50px;
		--transition: transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
		--bg-gradient: linear-gradient(90deg, var(--primary) 0%, var(--primary) 25%, var(--primary) 50%, var(--primary) 75%, var(--primary) 100%);
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: var(--height);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 9999;
		transform: translateY(-100%);
		transition:
			var(--transition),
			opacity 0.4s ease;
		box-shadow:
			0 4px 12px rgba(0, 0, 0, 0.15);
		overflow: hidden;
		opacity: 0;
	}

	.copy-message.show {
		transform: translateY(0);
		opacity: 1;
	}

	.copy-message .message-background {
		position: absolute;
		inset: 0;
		background: var(--bg-gradient);
		z-index: 1;
	}

	.copy-message .progress-bar {
		position: absolute;
		top: 0;
		left: -100%;
		width: 100%;
		height: 100%;
		background: linear-gradient(
			90deg,
			rgba(255, 255, 255, 0) 0%,
			rgba(255, 255, 255, 0.3) 50%,
			rgba(255, 255, 255, 0) 100%
		);
		z-index: 2;
		transform: translateX(0);
		transition:
			transform 0ms;
	}

	.copy-message .progress-bar.active {
		transform: translateX(200%);
		transition: transform var(--duration) linear;
	}

	.copy-message .message-content {
		display: flex;
		align-items: center;
		font-size: 16px;
		font-weight: 600;
		color: white;
		position: relative;
		z-index: 3;
		text-shadow:
			0 1px 2px rgba(0, 0, 0, 0.15);
	}

	@media (max-width: 768px) {
		.copy-message {
			--height: 44px;
		}

		.copy-message .message-content {
			font-size: 14px;
			padding: 0 16px;
			text-align: center;
		}
	}

	@media (prefers-color-scheme: dark) {
		.copy-message {
			--bg-gradient: linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%);
		}
	}
</style>
