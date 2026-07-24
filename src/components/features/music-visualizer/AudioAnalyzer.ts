import * as THREE from "three";

export interface AudioData {
	bass: number;
	mid: number;
	treble: number;
	energy: number;
	subBass: number;
	lowMid: number;
	highMid: number;
	presence: number;
	brilliance: number;
	air: number;
	warmth: number;
	brightness: number;
	sharpness: number;
	smoothness: number;
	density: number;
	spectralCentroid: number;
}

interface Ripple {
	pos: THREE.Vector2;
	time: number;
	strength: number;
	isActive: number;
	rippleType: number;
}

export interface AudioAnalyzerEvents {
	onRipple?: (x: number, z: number, strength: number, isWhite: boolean) => void;
	onMeteor?: (strength: number) => void;
	onBeat?: (strength: number) => void;
}

export class AudioAnalyzer {
	public audioCtx: AudioContext | null = null;
	private analyser: AnalyserNode | null = null;
	private source: MediaElementAudioSourceNode | null = null;
	private gainNode: GainNode | null = null;
	private audioElement: HTMLAudioElement | null = null;
	private dataArray = new Uint8Array(512);
	private prevData: number[] = new Array(512).fill(0);
	private prevBrightness = 0;
	private connected = false;
	private events: AudioAnalyzerEvents = {};

	private smoothedData: AudioData = {
		bass: 0,
		mid: 0,
		treble: 0,
		energy: 0,
		subBass: 0,
		lowMid: 0,
		highMid: 0,
		presence: 0,
		brilliance: 0,
		air: 0,
		warmth: 0,
		brightness: 0,
		sharpness: 0,
		smoothness: 0,
		density: 0,
		spectralCentroid: 0,
	};

	private beatCooldown = 0;
	private beatHistory: number[] = new Array(40).fill(0);
	private beatHistoryIndex = 0;
	private meteorCooldown = 0;

	setEvents(events: AudioAnalyzerEvents) {
		this.events = events;
	}

	connect(audioEl: HTMLAudioElement) {
		if (this.connected && this.audioElement === audioEl) return;
		this.audioElement = audioEl;

		if (this.audioCtx) {
			if (this.audioCtx.state === "suspended") {
				this.audioCtx.resume();
			}
			return;
		}

		const AC: typeof AudioContext =
			window.AudioContext ||
			(window as unknown as { webkitAudioContext: typeof AudioContext })
				.webkitAudioContext;
		if (!AC) return;
		this.audioCtx = new AC();
		this.analyser = this.audioCtx.createAnalyser();
		this.analyser.fftSize = 1024;
		this.analyser.smoothingTimeConstant = 0.8;

		this.gainNode = this.audioCtx.createGain();
		this.gainNode.gain.value = 1;

		try {
			this.source = this.audioCtx.createMediaElementSource(audioEl);
			this.source.connect(this.gainNode);
			this.gainNode.connect(this.audioCtx.destination);
			this.gainNode.connect(this.analyser);
			this.connected = true;
		} catch (e) {
			console.warn("AudioAnalyzer: Failed to connect to audio element", e);
		}

		if (this.analyser) {
			this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
		}
	}

	disconnect() {
		if (this.source) {
			this.source.disconnect();
			this.source = null;
		}
		if (this.gainNode) {
			this.gainNode.disconnect();
			this.gainNode = null;
		}
		if (this.analyser) {
			this.analyser.disconnect();
			this.analyser = null;
		}
		if (this.audioCtx) {
			this.audioCtx.close();
			this.audioCtx = null;
		}
		this.connected = false;
	}

	isConnected() {
		return this.connected;
	}

	resume() {
		if (this.audioCtx?.state === "suspended") {
			this.audioCtx.resume();
		}
	}

	update(_delta: number): AudioData {
		if (!this.analyser) {
			return { ...this.smoothedData };
		}

		const isPlaying = this.audioElement
			? !this.audioElement.paused && !this.audioElement.ended
			: false;

		let energySum = 0;
		let centroidNum = 0;
		let centroidDen = 0;
		let subBassSum = 0;
		let bassSum = 0;
		let lowMidSum = 0;
		let midSum = 0;
		let highMidSum = 0;
		let presenceSum = 0;
		let brillianceSum = 0;
		let airSum = 0;
		let jumpVolatilitySum = 0;
		let fluxPulse = 0;
		let fluxMeteor = 0;

		const binCount = this.dataArray.length;

		if (isPlaying) {
			this.analyser.getByteFrequencyData(this.dataArray);

			for (let i = 0; i < binCount; i++) {
				const val = this.dataArray[i] / 255;
				energySum += val;
				centroidNum += i * val;
				centroidDen += val;

				const prevVal = this.prevData[i] || 0;
				jumpVolatilitySum += Math.abs(val - prevVal);

				if (i >= 0 && i <= 16) {
					const diff = val - prevVal;
					if (diff > 0) fluxPulse += diff;
				}

				if (i >= 159 && i <= 174) {
					const diff = val - prevVal;
					if (diff > 0) fluxMeteor += diff;
				}

				this.prevData[i] = val;

				if (i <= 1) subBassSum += val;
				else if (i <= 3) bassSum += val;
				else if (i <= 7) lowMidSum += val;
				else if (i <= 18) midSum += val;
				else if (i <= 46) highMidSum += val;
				else if (i <= 93) presenceSum += val;
				else if (i <= 186) brillianceSum += val;
				else if (i <= 372) airSum += val;
			}

			this.detectBeats(fluxPulse, fluxMeteor);
		} else {
			for (let i = 0; i < binCount; i++) {
				this.dataArray[i] = Math.floor(this.dataArray[i] * 0.94);
				this.prevData[i] = 0;
			}
		}

		if (this.beatCooldown > 0) this.beatCooldown--;
		if (this.meteorCooldown > 0) this.meteorCooldown--;

		const energy = energySum / binCount;
		const subBass = subBassSum / 2;
		const bass = bassSum / 2;
		const lowMid = lowMidSum / 4;
		const mid = midSum / 11;
		const highMid = highMidSum / 28;
		const presence = presenceSum / 47;
		const brilliance = brillianceSum / 93;
		const air = airSum / 186;

		const oldBass = (subBassSum + bassSum + lowMidSum) / 8;
		const oldMid = (midSum + highMidSum) / 39;
		const oldTreble = (presenceSum + brillianceSum + airSum) / 326;

		const warmth =
			energySum > 0
				? (subBassSum + bassSum + lowMidSum + midSum) / energySum
				: 0;
		const brightness =
			energySum > 0 ? (presenceSum + brillianceSum + airSum) / energySum : 0;
		const sharpness = Math.max(0, brightness - this.prevBrightness) * 10;
		this.prevBrightness = brightness;

		const smoothnessVal = Math.max(0, 1 - (jumpVolatilitySum / binCount) * 2);

		const activeThreshold = energy * 1.5;
		let activeBands = 0;
		if (subBass > activeThreshold) activeBands++;
		if (bass > activeThreshold) activeBands++;
		if (lowMid > activeThreshold) activeBands++;
		if (mid > activeThreshold) activeBands++;
		if (highMid > activeThreshold) activeBands++;
		if (presence > activeThreshold) activeBands++;
		if (brilliance > activeThreshold) activeBands++;
		if (air > activeThreshold) activeBands++;
		const density = activeBands / 8;

		const spectralCentroid = centroidDen > 0 ? centroidNum / centroidDen : 0;

		const dt = isPlaying ? 0.15 : 0.05;

		this.smoothedData.bass += (oldBass - this.smoothedData.bass) * dt;
		this.smoothedData.mid += (oldMid - this.smoothedData.mid) * dt;
		this.smoothedData.treble += (oldTreble - this.smoothedData.treble) * dt;
		this.smoothedData.energy += (energy - this.smoothedData.energy) * dt;
		this.smoothedData.subBass += (subBass - this.smoothedData.subBass) * dt;
		this.smoothedData.lowMid += (lowMid - this.smoothedData.lowMid) * dt;
		this.smoothedData.highMid += (highMid - this.smoothedData.highMid) * dt;
		this.smoothedData.presence += (presence - this.smoothedData.presence) * dt;
		this.smoothedData.brilliance +=
			(brilliance - this.smoothedData.brilliance) * dt;
		this.smoothedData.air += (air - this.smoothedData.air) * dt;
		this.smoothedData.warmth += (warmth - this.smoothedData.warmth) * dt;
		this.smoothedData.brightness +=
			(brightness - this.smoothedData.brightness) * dt;
		this.smoothedData.sharpness +=
			(sharpness - this.smoothedData.sharpness) * dt;
		this.smoothedData.smoothness +=
			(smoothnessVal - this.smoothedData.smoothness) * dt;
		this.smoothedData.density += (density - this.smoothedData.density) * dt;
		this.smoothedData.spectralCentroid +=
			(spectralCentroid - this.smoothedData.spectralCentroid) * dt;

		return { ...this.smoothedData };
	}

	private detectBeats(fluxPulse: number, fluxMeteor: number) {
		const smoothedFlux = fluxPulse;
		this.beatHistory[this.beatHistoryIndex] = smoothedFlux;
		this.beatHistoryIndex =
			(this.beatHistoryIndex + 1) % this.beatHistory.length;

		let avgFlux = 0;
		for (let i = 0; i < this.beatHistory.length; i++)
			avgFlux += this.beatHistory[i];
		avgFlux /= this.beatHistory.length;

		let fluxVariance = 0;
		for (let i = 0; i < this.beatHistory.length; i++) {
			fluxVariance += (this.beatHistory[i] - avgFlux) ** 2;
		}
		fluxVariance /= this.beatHistory.length;
		const fluxStdDev = Math.sqrt(fluxVariance);

		const threshold = Math.max(0.05, avgFlux + fluxStdDev * 1.5);

		if (
			this.beatCooldown <= 0 &&
			smoothedFlux > threshold &&
			smoothedFlux > 0.02
		) {
			const strength = Math.min(smoothedFlux * 3, 4);
			const angle = Math.random() * Math.PI * 2;
			const dist = Math.random() * 20;
			const rx = Math.cos(angle) * dist;
			const rz = Math.sin(angle) * dist;
			this.events.onRipple?.(rx, rz, strength, false);
			this.events.onBeat?.(strength);
			this.beatCooldown = 20;
		}

		if (this.meteorCooldown <= 0 && fluxMeteor > 0.08) {
			const strength = Math.min(fluxMeteor * 2, 1);
			this.events.onMeteor?.(strength);
			this.meteorCooldown = 40 + Math.random() * 60;
		}
	}

	static getRipplesArray(): Ripple[] {
		return new Array(10).fill(null).map(() => ({
			pos: new THREE.Vector2(),
			time: -100,
			strength: 0,
			isActive: 0,
			rippleType: 0,
		}));
	}

	addClickRipple(x: number, z: number) {
		this.events.onRipple?.(x, z, 1.5, false);
	}
}