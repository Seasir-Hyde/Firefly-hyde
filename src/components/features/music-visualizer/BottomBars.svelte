<script lang="ts">
  import { onMount, onDestroy } from "svelte";

  interface Props {
    visible: boolean;
  }

  let { visible }: Props = $props();

  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let animId: number | null = null;
  let ctx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let freqData: Uint8Array = new Uint8Array(0);
  let smoothed: Float32Array = new Float32Array(0);
  let connected = false;

  function initAudio() {
    if (connected) return;
    const audio = document.getElementById("firefly-music-audio") as HTMLAudioElement;
    if (!audio) return;

    try {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      ctx.resume();

      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.7;

      const source = ctx.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(ctx.destination);

      freqData = new Uint8Array(analyser.frequencyBinCount);
      smoothed = new Float32Array(analyser.frequencyBinCount);
      connected = true;
      drawLoop();
    } catch (e) {
      console.warn("BottomBars: 音频连接失败", e);
    }
  }

  onMount(() => {

    document.addEventListener("click", initAudio, { once: true });
    document.addEventListener("touchstart", initAudio, { once: true });
  });

  onDestroy(() => {
    if (animId) cancelAnimationFrame(animId);
    document.removeEventListener("click", initAudio);
    document.removeEventListener("touchstart", initAudio);
    ctx?.close().catch(() => {});
  });

  function drawLoop() {
    animId = requestAnimationFrame(drawLoop);

    const canvas = canvasEl;
    if (!canvas) return;

    const c = canvas.getContext("2d");
    if (!c) return;

    const w = canvas.width;
    const h = canvas.height;
    c.clearRect(0, 0, w, h);

    if (!visible) return;

    const bars = 48;

    // 获取频率数据
    let values: number[] = [];
    if (analyser && connected) {
      analyser.getByteFrequencyData(freqData);
      const smoothing = 0.65;
      for (let i = 0; i < freqData.length; i++) {
        smoothed[i] = smoothed[i] * smoothing + (freqData[i] / 255) * (1 - smoothing);
      }
      const boost = 4.0;
      for (let i = 0; i < bars; i++) {
        const idx = i + 2;
        const v = idx < smoothed.length ? Math.min(1, smoothed[idx] * boost) : 0;
        values.push(v);
      }
    } else {
      // 无音频数据时显示微弱基线
      values = new Array(bars).fill(0.04);
    }

    const barWidth = (w / bars) * 0.7;
    const gap = (w / bars) * 0.3;

    for (let i = 0; i < bars; i++) {
      const v = values[i];
      const barH = Math.max(2, v * h * 0.9);

      const t = i / (bars - 1);
      const r = Math.round(80 + t * 100);
      const g = Math.round(150 + t * 40);
      const b = Math.round(220 - t * 60);
      const alpha = 0.4 + v * 0.5;

      const x = Math.round(i * (barWidth + gap) + gap / 2);
      const y = Math.round(h - barH);

      c.shadowColor = `rgba(${r}, ${g}, ${b}, 0.4)`;
      c.shadowBlur = 5;

      const grad = c.createLinearGradient(x, y, x, h);
      grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
      grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.1)`);
      c.fillStyle = grad;

      c.fillRect(x, y, Math.ceil(barWidth), barH);

      c.shadowColor = "transparent";
      c.shadowBlur = 0;
    }
  }
</script>

<canvas
  bind:this={canvasEl}
  class="bottom-bars-canvas"
  class:hidden={!visible}
  width="1200"
  height="80"
></canvas>

<style>
  .bottom-bars-canvas {
    position: fixed;
    bottom: 0;
    left: 0;
    width: 100vw;
    height: 80px;
    z-index: 10;
    pointer-events: none;
    opacity: 0.7;
    transition: opacity 0.3s ease;
  }

  .bottom-bars-canvas.hidden {
    opacity: 0;
  }

  @media (max-width: 768px) {
    .bottom-bars-canvas {
      display: none;
    }
  }
</style>