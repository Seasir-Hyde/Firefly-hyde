<script lang="ts">
  interface Props {
    coverUrl: string;
    trackName: string;
    artist: string;
    isPlaying: boolean;
  }

  let { coverUrl, trackName, artist, isPlaying }: Props = $props();

  let transitioning = $state(false);
  let displayCover = $state("");
  let displayName = $state("");
  let displayArtist = $state("");
  let prevCover = $state("");
  let trackNameEl = $state<HTMLDivElement | null>(null);
  let nameNeedsScroll = $state(false);

  $effect(() => {
    if (trackNameEl) {
      nameNeedsScroll = trackNameEl.scrollWidth > trackNameEl.clientWidth;
    }
  });

  $effect(() => {
    if (coverUrl !== prevCover && prevCover !== "") {
      transitioning = true;
      setTimeout(() => {
        transitioning = false;
        displayCover = coverUrl;
        displayName = trackName;
        displayArtist = artist;
      }, 450);
      return;
    }
    prevCover = coverUrl;
    displayCover = coverUrl;
    displayName = trackName;
    displayArtist = artist;
  });
</script>

<div class="vinyl-player">
  <div class="vinyl-deck">
    <div class="vinyl-slide" class:slide-out={transitioning}>
      <div class="vinyl-record" class:spinning={isPlaying && !transitioning}>
        <div class="vinyl-grooves"></div>
        <div class="vinyl-label">
          {#if displayCover}
            <img src={displayCover} alt={displayName} />
          {:else}
            <div class="vinyl-label-placeholder">♪</div>
          {/if}
        </div>
        <div class="vinyl-hole"></div>
      </div>
    </div>

    <div class="tonearm" class:on-record={isPlaying && !transitioning}>
      <div class="tonearm-base">
        <div class="tonearm-pivot"></div>
      </div>
      <div class="tonearm-arm">
        <div class="tonearm-head">
          <div class="tonearm-needle"></div>
        </div>
      </div>
    </div>
  </div>

  <div class="vinyl-track-info">
    <div class="vinyl-track-name-wrap">
      <div
        class="vinyl-track-name"
        class:marquee={nameNeedsScroll}
        bind:this={trackNameEl}
      >{displayName || "未播放"}</div>
    </div>
    <div class="vinyl-track-artist">{displayArtist || ""}</div>
  </div>
</div>

<style>
  .vinyl-player {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
  }

  .vinyl-deck {
    position: relative;
    width: 340px;
    height: 340px;
  }

  .vinyl-slide {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.45s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.45s ease;
    transform: translateX(0);
    opacity: 1;
  }

  .vinyl-slide.slide-out {
    transform: translateX(-120%);
    opacity: 0;
  }

  .vinyl-record {
    width: 300px;
    height: 300px;
    border-radius: 50%;
    background: #111;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow:
      0 8px 40px rgba(0,0,0,0.5),
      0 0 0 4px rgba(30,30,30,0.8),
      0 0 0 8px rgba(20,20,20,0.6),
      0 0 0 12px rgba(15,15,15,0.4);
    transition: box-shadow 0.3s;
  }

  .vinyl-record.spinning {
    animation: vinyl-spin 3s linear infinite;
  }

  @keyframes vinyl-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .vinyl-grooves {
    position: absolute;
    inset: 50px;
    border-radius: 50%;
    background: repeating-radial-gradient(
      circle at center,
      #1a1a1a 0px,
      #222 2px,
      #1a1a1a 3px,
      #1a1a1a 4px,
      #252525 5px,
      #1a1a1a 6px
    );
    opacity: 0.8;
  }

  .vinyl-label {
    position: absolute;
    width: 120px;
    height: 120px;
    border-radius: 50%;
    overflow: hidden;
    z-index: 1;
    background: #222;
    box-shadow: 0 0 0 3px rgba(255,255,255,0.05);
  }

  .vinyl-label img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .vinyl-label-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2.5rem;
    color: rgba(255,255,255,0.2);
    background: #1a1a1a;
  }

  .vinyl-hole {
    position: absolute;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #0a0a14;
    z-index: 2;
    box-shadow: inset 0 1px 2px rgba(0,0,0,0.8);
  }

  .tonearm {
    position: absolute;
    top: 20px;
    right: 20px;
    width: 200px;
    height: 60px;
    transform-origin: top right;
    transform: rotate(25deg);
    transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 5;
    pointer-events: none;
  }

  .tonearm.on-record {
    transform: rotate(-15deg);
  }

  .tonearm-base {
    position: absolute;
    top: 0;
    right: 0;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: linear-gradient(135deg, #555, #333);
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
  }

  .tonearm-pivot {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #888;
    box-shadow: 0 0 4px rgba(0,0,0,0.5);
  }

  .tonearm-arm {
    position: absolute;
    top: 10px;
    right: 24px;
    width: 145px;
    height: 4px;
    background: linear-gradient(90deg, #666, #999);
    border-radius: 2px;
    transform-origin: right center;
    transform: rotate(-8deg);
    box-shadow: 0 1px 2px rgba(0,0,0,0.3);
  }

  .tonearm-head {
    position: absolute;
    left: -8px;
    top: 50%;
    transform: translateY(-50%);
    width: 18px;
    height: 18px;
    background: linear-gradient(135deg, #555, #777);
    border-radius: 50%;
    box-shadow: 0 1px 3px rgba(0,0,0,0.4);
  }

  .tonearm-needle {
    position: absolute;
    bottom: 1px;
    left: 50%;
    transform: translateX(-50%);
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #ddd;
    box-shadow: 0 0 4px rgba(200,200,200,0.6);
  }

  .vinyl-track-info {
    text-align: center;
    max-width: 300px;
    width: 100%;
  }

  .vinyl-track-name-wrap {
    overflow: hidden;
    width: 100%;
  }

  .vinyl-track-name {
    font-size: 1.1rem;
    font-weight: 600;
    color: #c8dfff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: inline-block;
    max-width: 100%;
  }

  .vinyl-track-name.marquee {
    animation: track-name-scroll 8s linear infinite;
    text-overflow: clip;
  }

  .vinyl-track-name.marquee:hover {
    animation-play-state: paused;
  }

  @keyframes track-name-scroll {
    0% { transform: translateX(0); }
    20% { transform: translateX(0); }
    100% { transform: translateX(calc(-100% + 280px)); }
  }

  .vinyl-track-artist {
    font-size: 0.85rem;
    color: rgba(200, 223, 255, 0.5);
    margin-top: 0.25rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @media (max-width: 768px) {
    .vinyl-deck {
      width: 260px;
      height: 260px;
    }

    .vinyl-record {
      width: 230px;
      height: 230px;
    }

    .vinyl-grooves {
      inset: 35px;
    }

    .vinyl-label {
      width: 90px;
      height: 90px;
    }

    .vinyl-label-placeholder {
      font-size: 1.8rem;
    }

    .tonearm {
      width: 150px;
      height: 45px;
      top: 15px;
      right: 15px;
    }

    .tonearm-base {
      width: 28px;
      height: 28px;
    }

    .tonearm-arm {
      width: 110px;
      height: 3px;
      right: 18px;
      top: 8px;
    }

    .tonearm-head {
      width: 14px;
      height: 14px;
      left: -6px;
    }

    .tonearm-needle {
      width: 4px;
      height: 4px;
      bottom: 1px;
    }

    .vinyl-track-name {
      font-size: 0.95rem;
    }

    .vinyl-track-name.marquee {
      animation: track-name-scroll-mobile 8s linear infinite;
    }

    @keyframes track-name-scroll-mobile {
      0% { transform: translateX(0); }
      20% { transform: translateX(0); }
      100% { transform: translateX(calc(-100% + 210px)); }
    }

    .vinyl-track-artist {
      font-size: 0.75rem;
    }
  }

  @media (max-width: 480px) {
    .vinyl-deck {
      width: 220px;
      height: 220px;
    }

    .vinyl-record {
      width: 195px;
      height: 195px;
    }

    .vinyl-grooves {
      inset: 30px;
    }

    .vinyl-label {
      width: 75px;
      height: 75px;
    }

    .vinyl-label-placeholder {
      font-size: 1.5rem;
    }

    .tonearm {
      width: 125px;
      height: 38px;
      top: 10px;
      right: 10px;
    }

    .tonearm-base {
      width: 24px;
      height: 24px;
    }

    .tonearm-arm {
      width: 90px;
      height: 2.5px;
      right: 15px;
      top: 6px;
    }

    .tonearm-head {
      width: 12px;
      height: 12px;
      left: -5px;
    }

    .tonearm-needle {
      width: 3px;
      height: 3px;
      bottom: 1px;
    }

    .vinyl-track-name {
      font-size: 0.85rem;
    }

    .vinyl-track-name.marquee {
      animation: track-name-scroll-mobile 8s linear infinite;
    }
  }
</style>