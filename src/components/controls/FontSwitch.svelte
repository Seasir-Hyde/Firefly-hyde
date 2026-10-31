<script lang="ts">
import { onMount } from "svelte";

interface FontSwitchOption {
	id: string;
	label: string;
	cssVariable: string;
	description?: string;
}

interface Props {
	options: FontSwitchOption[];
	defaultMode: string;
	storageKey: string;
}

const { options, defaultMode, storageKey }: Props = $props();

let mode = $state(defaultMode);

/**
 * 应用字体档位。
 *
 * 切换只改 <html> 上的 data-font-mode 属性，CSS 变量随之重指向，
 * 因此不需要重新加载页面，也不会丢失当前滚动位置与表单状态。
 * 选择结果写入 localStorage，跨会话持久化。
 */
const applyFontMode = (nextMode: string) => {
	mode = nextMode;
	document.documentElement.dataset.fontMode = nextMode;
	try {
		localStorage.setItem(storageKey, nextMode);
	} catch {
		// 隐私模式下 localStorage 可能不可用，此时仅本次会话生效
	}
};

onMount(() => {
	// 与 FontSetup.astro 的内联脚本保持一致：以存储值为准，非法值回退默认档位
	let saved: string | null = null;
	try {
		saved = localStorage.getItem(storageKey);
	} catch {
		saved = null;
	}
	const initial =
		saved && options.some((o) => o.id === saved) ? saved : defaultMode;
	mode = initial;
	document.documentElement.dataset.fontMode = initial;
});
</script>

<div class="font-switch-options" role="group" aria-label="字体样式">
	{#each options as option (option.id)}
		<button
			type="button"
			class="font-switch-option"
			class:font-switch-option-active={mode === option.id}
			aria-pressed={mode === option.id}
			title={option.description ?? option.label}
			onclick={() => applyFontMode(option.id)}
		>
			{option.label}
		</button>
	{/each}
</div>

<style>
	.font-switch-options {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
		gap: 0.5rem;
	}

	.font-switch-option {
		min-width: 0;
		min-height: 2.5rem;
		padding: 0.625rem 0.5rem;
		border: 1px solid var(--line-color);
		border-radius: 0.625rem;
		background: transparent;
		color: var(--btn-content);
		font-size: 0.875rem;
		font-weight: 600;
		text-align: center;
		cursor: pointer;
		transition:
			background-color 180ms ease,
			border-color 180ms ease,
			color 180ms ease,
			transform 180ms ease;
	}

	.font-switch-option:hover:not(.font-switch-option-active) {
		background: var(--btn-plain-bg-hover);
		color: var(--primary);
	}

	.font-switch-option-active {
		border-color: var(--primary);
		background: var(--btn-plain-bg-hover);
		color: var(--primary);
		font-weight: 700;
	}

	.font-switch-option:active {
		transform: scale(0.97);
	}

	.font-switch-option:focus-visible {
		outline: 2px solid var(--primary);
		outline-offset: 2px;
	}

	@media (prefers-reduced-motion: reduce) {
		.font-switch-option {
			transition-duration: 0.01ms;
		}
	}
</style>
