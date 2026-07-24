<script lang="ts">
import { onDestroy, onMount } from "svelte";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { musicVisualizerConfig } from "@/config/musicConfig";
import { AudioAnalyzer, type AudioData } from "./AudioAnalyzer";

interface Props {
	audioAnalyzer: AudioAnalyzer;
	backgroundColor?: string;
	accentColor?: string | null;
	onSceneReady?: (() => void) | undefined;
}

let {
	audioAnalyzer,
	backgroundColor = musicVisualizerConfig.background?.dark ?? "#0a0a15",
	accentColor = null,
	onSceneReady = undefined,
}: Props = $props();

let container: HTMLDivElement;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let controls: OrbitControls;
let terrainMesh: THREE.InstancedMesh;
let meteorMesh: THREE.InstancedMesh;
let particleMesh: THREE.InstancedMesh;
let terrainMaterial: THREE.ShaderMaterial;
let animationId: number;
let clock: THREE.Clock;
let onResize: (() => void) | undefined;
const backgroundTargetColor = new THREE.Color();

$effect(() => {
	backgroundTargetColor.set(backgroundColor);
});

const GRID_SIZE = 128;
const SPACING = 1.05;
const INSTANCE_COUNT = GRID_SIZE * GRID_SIZE;
const MAX_METEORS = 12;
const MAX_PARTICLES = 100;

interface Ripple {
	pos: THREE.Vector2;
	time: number;
	strength: number;
	isActive: number;
	rippleType: number;
}

const ripples: Ripple[] = AudioAnalyzer.getRipplesArray() as Ripple[];
let rippleIndex = 0;

interface Meteor {
	active: boolean;
	x: number;
	y: number;
	z: number;
	speed: number;
	strength: number;
}

const meteors: Meteor[] = new Array(MAX_METEORS).fill(null).map(() => ({
	active: false,
	x: 0,
	y: -1000,
	z: 0,
	speed: 0,
	strength: 0,
}));
let meteorIndex = 0;

interface Particle {
	active: boolean;
	x: number;
	y: number;
	z: number;
	vx: number;
	vy: number;
	vz: number;
	life: number;
	maxLife: number;
	scale: number;
}

const particles: Particle[] = new Array(MAX_PARTICLES).fill(null).map(() => ({
	active: false,
	x: 0,
	y: -1000,
	z: 0,
	vx: 0,
	vy: 0,
	vz: 0,
	life: 0,
	maxLife: 1,
	scale: 1,
}));
let particleIndex = 0;

const dummyMatrix = new THREE.Matrix4();
const dummyPosition = new THREE.Vector3();
const dummyQuaternion = new THREE.Quaternion();
const dummyScale = new THREE.Vector3();

function getThemeColors(accent?: string | null) {
	const theme = musicVisualizerConfig.theme;
	if (accent) {
		// Derive colors from accent (cover image dominant color)
		const coolCore = new THREE.Color(accent);
		const coolEdge = new THREE.Color(accent).multiplyScalar(1.4);
		const warmCore = new THREE.Color(accent).offsetHSL(0.08, 0, -0.1);
		const warmEdge = new THREE.Color(accent).offsetHSL(0.08, 0, 0.1);
		const rippleColor = new THREE.Color(accent).multiplyScalar(1.6);
		return {
			base1: new THREE.Color(theme?.base1 ?? "#050810"),
			base2: new THREE.Color(theme?.base2 ?? "#0a0f1a"),
			coolCore,
			coolEdge,
			warmCore: new THREE.Color().copy(warmCore).multiplyScalar(0.85),
			warmEdge,
			rippleColor,
			glowIntensity: theme?.glowIntensity ?? 1.2,
		};
	}
	return {
		base1: new THREE.Color(theme?.base1 ?? "#050810"),
		base2: new THREE.Color(theme?.base2 ?? "#0a0f1a"),
		coolCore: new THREE.Color(theme?.coolCore ?? "#3366cc"),
			coolEdge: new THREE.Color(theme?.coolEdge ?? "#6699dd"),
			warmCore: new THREE.Color(theme?.warmCore ?? "#2244cc"),
			warmEdge: new THREE.Color(theme?.warmEdge ?? "#4477dd"),
			rippleColor: new THREE.Color(theme?.rippleColor ?? "#33bbdd"),
		glowIntensity: theme?.glowIntensity ?? 1.2,
	};
}

let themeColors = $derived(getThemeColors(accentColor));
const heightConfig = musicVisualizerConfig.height;

function addRipple(x: number, z: number, strength: number, isWhite: boolean) {
	const idx = rippleIndex;
	ripples[idx] = {
		pos: new THREE.Vector2(x, z),
		time: clock.getElapsedTime(),
		strength,
		isActive: 1,
		rippleType: isWhite ? 1 : 0,
	};
	rippleIndex = (idx + 1) % ripples.length;
}

function spawnParticle(
	x: number,
	y: number,
	z: number,
	speedMultiplier: number,
) {
	const idx = particleIndex;
	const p = particles[idx];
	p.active = true;
	p.x = x + (Math.random() - 0.5) * 1.5;
	p.y = y + (Math.random() - 0.5) * 1.5;
	p.z = z + (Math.random() - 0.5) * 1.5;
	p.vx = (Math.random() - 0.5) * 2;
	p.vy = Math.random() * 2 + speedMultiplier * 10;
	p.vz = (Math.random() - 0.5) * 2;
	p.life = 0;
	p.maxLife = 0.5 + Math.random() * 0.5;
	p.scale = Math.random() * 0.6 + 0.2;
	particleIndex = (idx + 1) % MAX_PARTICLES;
}

function addMeteor(strength: number) {
	const now = clock.getElapsedTime();
	const idx = meteorIndex;
	const angle = Math.random() * Math.PI * 2;
	const dist = Math.random() * 25;

	const m = meteors[idx];
	m.active = true;
	m.x = Math.cos(angle) * dist;
	m.z = Math.sin(angle) * dist;
	m.y = 30 + Math.random() * 10;
	m.speed = 1 + Math.random() * 0.5 + strength * 1.5;
	m.strength = strength;
	meteorIndex = (idx + 1) % MAX_METEORS;
}

const vertexShader = `
    uniform float uTime;
    uniform float uSubBass;
    uniform float uBass;
    uniform float uLowMid;
    uniform float uMid;
    uniform float uHighMid;
    uniform float uSmoothness;
    uniform float uDensity;
    uniform float uEnergy;
    uniform float uHeightIdle;
    uniform float uHeightSubBass;
    uniform float uHeightBass;
    uniform float uHeightLowMid;
    uniform float uHeightMid;
    uniform float uHeightHighMid;
    uniform float uHeightEnergy;
    uniform float uHeightRipple;
    uniform float uHeightRippleAccent;

    struct Ripple {
      vec2 pos;
      float time;
      float strength;
      float isActive;
      float rippleType;
    };
    uniform Ripple uRipples[10];

    varying vec2 vUv;
    varying float vElevation;
    varying float vDistance;
    varying vec2 vRippleAnim;
    varying vec3 vNormal;
    varying float vRelativeY;
    varying vec2 vInstancePos;

    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
    float snoise(vec2 v) {
      const vec4 C = vec4(0.211324865405187,  0.366025403784439, -0.577350269189626, 0.024390243902439);
      vec2 i  = floor(v + dot(v, C.yy) );
      vec2 x0 = v -   i + dot(i, C.xx);
      vec2 i1; i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1;
      i = mod289(i);
      vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
      vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
      m = m*m ; m = m*m ;
      vec3 x = 2.0 * fract(p * C.www) - 1.0; vec3 h = abs(x) - 0.5; vec3 ox = floor(x + 0.5);
      vec3 a0 = x - ox; m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
      vec3 g; g.x  = a0.x  * x0.x  + h.x  * x0.y; g.yz = a0.yz * x12.xz + h.yz * x12.yw;
      return 130.0 * dot(m, g);
    }

    float random(vec2 st) {
      return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
    }

    void main() {
      vUv = uv;
      vNormal = normal;

      vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      vec2 pos2D = ip.xz;
      vInstancePos = pos2D;

      float centerDist = length(pos2D);
      vDistance = centerDist;

      float rnd = random(pos2D);

      vec2 movingPos = pos2D * 0.05 + vec2(uTime * 0.1, uTime * 0.05);
      float baseNoise = (snoise(movingPos) + 1.0) * 0.5;
      float wave = sin(pos2D.x * 0.15 + pos2D.y * 0.1 - uTime * 0.6) * 0.5 + 0.5;

      float globalFalloff = smoothstep(50.0, 25.0, centerDist);
      float idleElevation = mix(baseNoise, wave, uSmoothness * 0.5 + 0.2) * uHeightIdle * globalFalloff;

      float subRegion = smoothstep(20.0, 0.0, centerDist);
      float subLift = uSubBass * subRegion * uHeightSubBass;

      float bassNoise = snoise(pos2D * 0.1 - vec2(0.0, uTime * 0.2));
      float bassRegion = smoothstep(30.0, 5.0, centerDist + bassNoise * 5.0);
      float bassLift = uBass * bassRegion * (smoothstep(0.0, 1.0, rnd + uDensity * 0.5)) * uHeightBass;

      float lowMidNoise = snoise(pos2D * 0.05 + vec2(uTime * 0.1, 0.0));
      float lowMidLift = uLowMid * (lowMidNoise * 0.5 + 0.5) * uHeightLowMid;

      float riverFlow = sin(pos2D.x * 0.2 + pos2D.y * 0.2 + snoise(pos2D * 0.1) * 2.0 - uTime * 2.0);
      float midLift = uMid * max(0.0, riverFlow) * uHeightMid;

      float highMidRegion = smoothstep(10.0, 35.0, centerDist);
      float highMidLift = 0.0;
      if (fract(rnd * 13.3) > 0.8) {
        highMidLift = uHighMid * highMidRegion * fract(rnd * 7.7) * uHeightHighMid;
      }

      float audioElevation = subLift + bassLift + lowMidLift + midLift + highMidLift;

      if (rnd > 0.99) {
        audioElevation += uEnergy * uHeightEnergy;
      }

      audioElevation *= globalFalloff;

      float elevation = idleElevation + audioElevation;

      float rippleElevation = 0.0;
      float rippleIntensityNormal = 0.0;
      float rippleIntensityWhite = 0.0;
      float speed = 15.0;
      float width = 3.0;

      for(int i = 0; i < 10; i++) {
        if(uRipples[i].isActive > 0.0) {
          float dist = length(pos2D - uRipples[i].pos);
          float timeSince = uTime - uRipples[i].time;

          float curSpeed = speed;
          float curWidth = width;
          float curFadeDist = 15.0;
          float elevationScale = uHeightRipple;

          if (uRipples[i].rippleType > 0.5) {
            curSpeed = 20.0;
            curWidth = 1.0;
            curFadeDist = 8.0;
            elevationScale = uHeightRippleAccent;
          }

          float waveRadius = timeSince * curSpeed;
          float d = dist - waveRadius;
          float rippleWave = exp(-d*d / curWidth);
          float fade = exp(-waveRadius / curFadeDist);
          float rPulse = rippleWave * fade * uRipples[i].strength;

          rippleElevation += rPulse * elevationScale;
          if (uRipples[i].rippleType > 0.5) {
            rippleIntensityWhite += rPulse;
          } else {
            rippleIntensityNormal += rPulse;
          }
        }
      }

      elevation += rippleElevation;
      vRippleAnim = vec2(clamp(rippleIntensityNormal, 0.0, 1.0), clamp(rippleIntensityWhite, 0.0, 1.0));
      vElevation = elevation;

      float yPos = position.y + 0.5;
      vRelativeY = yPos;

      float totalHeight = 1.0 + elevation;
      vec3 pos = position;
      pos.y = -0.5 + yPos * totalHeight;

      vec4 worldPosition = instanceMatrix * vec4(pos, 1.0);
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `;

const fragmentShader = `
    uniform float uTime;
    uniform float uPresence;
    uniform float uBrilliance;
    uniform float uAir;
    uniform float uWarmth;
    uniform float uBrightness;
    uniform float uSharpness;
    uniform vec3 uBaseColor1;
    uniform vec3 uBaseColor2;
    uniform vec3 uCoolCore;
    uniform vec3 uCoolEdge;
    uniform vec3 uWarmCore;
    uniform vec3 uWarmEdge;
    uniform vec3 uRippleColor;
    uniform float uGlowIntensity;

    varying vec2 vUv;
    varying float vElevation;
    varying float vDistance;
    varying vec2 vRippleAnim;
    varying vec3 vNormal;
    varying float vRelativeY;
    varying vec2 vInstancePos;

    float random(vec2 st) {
      return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
    }

    void main() {
      bool isTop = vNormal.y > 0.5;
      float distFromTop = 1.0 - vRelativeY;

      float rnd = random(vInstancePos);
      float centerDist = length(vInstancePos);

      float normElevation = clamp(vElevation / 6.0, 0.0, 1.0);

      vec3 cBase1 = uBaseColor1;
      vec3 cBase2 = uBaseColor2;

      vec3 coolCore = uCoolCore;
      vec3 coolEdge = uCoolEdge;
      vec3 warmCore = uWarmCore;
      vec3 warmEdge = uWarmEdge;

      float warmBlend = smoothstep(0.0, 1.0, uWarmth * 1.5 + (0.5 - centerDist/70.0));

      vec3 zoneCore = mix(coolCore, warmCore, warmBlend);
      vec3 zoneEdge = mix(coolEdge, warmEdge, warmBlend);

      vec3 targetGlow = mix(zoneCore, zoneEdge, fract(rnd * 11.0));

      float distFade = 1.0 - smoothstep(30.0, 65.0, centerDist);

      targetGlow = mix(targetGlow, vec3(0.4, 0.8, 1.0), uBrightness * 0.5);

      vec3 currentGlow = mix(cBase2, targetGlow, normElevation) * uGlowIntensity * distFade;

      currentGlow = mix(currentGlow, uRippleColor, vRippleAnim.x);
      currentGlow = mix(currentGlow, vec3(1.0, 1.0, 1.0), vRippleAnim.y);

      vec3 bodyColor = mix(cBase1, cBase2, vRelativeY * distFade);
      vec3 finalColor;

      if (isTop) {
        float topIntensity = smoothstep(0.0, 0.4, normElevation);

        float twinkleDistFalloff = smoothstep(50.0, 25.0, centerDist);
        float twinkleMultiplier = mix(twinkleDistFalloff, 1.0, smoothstep(0.01, 0.1, normElevation));

        bool isSparkleTarget = fract(rnd * 31.0) > 0.95;
        if (isSparkleTarget && normElevation < 0.1) {
          topIntensity += uAir * 1.5 * twinkleMultiplier;
        }

        finalColor = mix(cBase2, currentGlow, topIntensity);

        float edgeX = smoothstep(0.05, 0.01, vUv.x) + smoothstep(0.95, 0.99, vUv.x);
        float edgeY = smoothstep(0.05, 0.01, vUv.y) + smoothstep(0.95, 0.99, vUv.y);
        float edge = min(edgeX + edgeY, 1.0);
        finalColor += currentGlow * edge * 0.6 * (topIntensity + 0.3);

        float flashChance = smoothstep(0.3, 1.0, uPresence);
		if (fract(rnd * 53.0) > 0.98 - flashChance * 0.1) {
			float flashSync = sin(uTime * 40.0 + rnd * 100.0) * 0.5 + 0.5;
			finalColor += mix(vec3(1.0), vec3(0.5, 1.0, 1.0), rnd) * flashSync * uPresence * (1.0 + uSharpness * 2.0) * twinkleMultiplier;
		}

		if (edge > 0.5 && fract(rnd * 89.0 + uTime * 2.0) > 0.98) {
			finalColor += vec3(1.0) * uBrilliance * 2.0 * twinkleMultiplier;
		}

      } else {
        float verticalFalloff = mix(1.0, 3.0, uSharpness);
        float sideGlow = smoothstep(0.5 / verticalFalloff, 0.0, distFromTop) * normElevation;

        if (normElevation < 0.02) sideGlow = 0.0;

        finalColor = mix(bodyColor, currentGlow, sideGlow * 1.2);

        float rimGlow = smoothstep(0.03, 0.0, distFromTop) * normElevation;
        finalColor += currentGlow * rimGlow;
      }

      finalColor += uRippleColor * vRippleAnim.x * 0.5;
      finalColor += vec3(1.0, 1.0, 1.0) * vRippleAnim.y * 1.0;

      float aerialFog = smoothstep(25.0, 55.0, vDistance);
      vec3 atmosphericColor = mix(cBase1, cBase2, 0.4);
      finalColor = mix(finalColor, atmosphericColor, aerialFog * 0.4);

      float alphaFade = 1.0 - smoothstep(45.0, 65.0, vDistance);

      gl_FragColor = vec4(finalColor, alphaFade);
    }
  `;

function createTerrainMaterial() {
	return new THREE.ShaderMaterial({
		vertexShader,
		fragmentShader,
		uniforms: {
			uTime: { value: 0 },
			uSubBass: { value: 0 },
			uBass: { value: 0 },
			uLowMid: { value: 0 },
			uMid: { value: 0 },
			uHighMid: { value: 0 },
			uPresence: { value: 0 },
			uBrilliance: { value: 0 },
			uAir: { value: 0 },
			uWarmth: { value: 0 },
			uBrightness: { value: 0 },
			uSharpness: { value: 0 },
			uSmoothness: { value: 0 },
			uDensity: { value: 0 },
			uEnergy: { value: 0 },
			uRipples: { value: ripples },
			uHeightIdle: { value: heightConfig?.idle ?? 0.6 },
			uHeightSubBass: { value: heightConfig?.subBass ?? 4.0 },
			uHeightBass: { value: heightConfig?.bass ?? 3.0 },
			uHeightLowMid: { value: heightConfig?.lowMid ?? 2.0 },
			uHeightMid: { value: heightConfig?.mid ?? 2.5 },
			uHeightHighMid: { value: heightConfig?.highMid ?? 2.0 },
			uHeightEnergy: { value: heightConfig?.energy ?? 4.0 },
			uHeightRipple: { value: heightConfig?.ripple ?? 3.0 },
			uHeightRippleAccent: { value: heightConfig?.rippleAccent ?? 1.0 },
			uBaseColor1: { value: themeColors.base1.clone() },
			uBaseColor2: { value: themeColors.base2.clone() },
			uCoolCore: { value: themeColors.coolCore.clone() },
			uCoolEdge: { value: themeColors.coolEdge.clone() },
			uWarmCore: { value: themeColors.warmCore.clone() },
			uWarmEdge: { value: themeColors.warmEdge.clone() },
			uRippleColor: { value: themeColors.rippleColor.clone() },
			uGlowIntensity: { value: themeColors.glowIntensity },
		},
		transparent: true,
		side: THREE.DoubleSide,
	});
}

function init() {
	const width = container.clientWidth;
	const height = container.clientHeight;

	scene = new THREE.Scene();
	scene.background = backgroundTargetColor;
	scene.fog = new THREE.Fog(backgroundTargetColor, 25, 80);

	camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 200);
	const cameraPosition = musicVisualizerConfig.camera?.position;
	camera.position.set(
		cameraPosition?.x ?? 0,
		cameraPosition?.y ?? 32,
		cameraPosition?.z ?? 52,
	);

	renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
	renderer.setSize(width, height);
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.2;
	container.appendChild(renderer.domElement);

	controls = new OrbitControls(camera, renderer.domElement);
	controls.enableDamping = true;
	controls.dampingFactor = 0.05;
	controls.autoRotate = musicVisualizerConfig.autoRotate ?? true;
	controls.autoRotateSpeed =
		musicVisualizerConfig.autoRotateSpeed ?? 0.3;
	controls.enablePan = false;
	controls.minDistance = 10;
	controls.maxDistance = 80;
	controls.maxPolarAngle = Math.PI / 2 - 0.1;

	const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
	scene.add(ambientLight);
	const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
	dirLight.position.set(10, 20, 10);
	scene.add(dirLight);

	terrainMaterial = createTerrainMaterial();

	const boxGeo = new THREE.BoxGeometry(0.9, 1, 0.9);
	terrainMesh = new THREE.InstancedMesh(
		boxGeo,
		terrainMaterial,
		INSTANCE_COUNT,
	);
	terrainMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

	const offset = (GRID_SIZE * SPACING) / 2;
	let i = 0;
	for (let x = 0; x < GRID_SIZE; x++) {
		for (let z = 0; z < GRID_SIZE; z++) {
			const px = x * SPACING - offset;
			const pz = z * SPACING - offset;
			dummyMatrix.makeTranslation(px, 0.5, pz);
			terrainMesh.setMatrixAt(i, dummyMatrix);
			i++;
		}
	}
	terrainMesh.instanceMatrix.needsUpdate = true;
	scene.add(terrainMesh);

	const meteorGeo = new THREE.BoxGeometry(0.4, 1.2, 0.4);
	const meteorMat = new THREE.MeshBasicMaterial({
		color: 0xffffff,
		toneMapped: false,
	});
	meteorMesh = new THREE.InstancedMesh(meteorGeo, meteorMat, MAX_METEORS);
	meteorMesh.frustumCulled = false;
	scene.add(meteorMesh);

	const particleGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
	const particleMat = new THREE.MeshBasicMaterial({
		color: 0xffffff,
		toneMapped: false,
		transparent: true,
		opacity: 0.7,
	});
	particleMesh = new THREE.InstancedMesh(
		particleGeo,
		particleMat,
		MAX_PARTICLES,
	);
	particleMesh.frustumCulled = false;
	scene.add(particleMesh);

	clock = new THREE.Clock();

	audioAnalyzer.setEvents({
		onRipple: addRipple,
		onMeteor: addMeteor,
	});

	const raycaster = new THREE.Raycaster();
	const mouse = new THREE.Vector2();
	let pressTime = 0;

	function onPointerDown(e: PointerEvent) {
		if (e.button !== 0) return;
		pressTime = performance.now();
	}

	function onPointerUp(e: PointerEvent) {
		if (e.button !== 0) return;
		const rect = renderer.domElement.getBoundingClientRect();
		mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
		mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
		raycaster.setFromCamera(mouse, camera);
		const intersects = raycaster.intersectObject(terrainMesh);
		if (intersects.length > 0) {
			const point = intersects[0].point;
			const duration = performance.now() - pressTime;
			const strength = Math.min(0.3 + (duration / 1000) * 2.5, 2.5);
			addRipple(point.x, point.z, strength, false);
		}
	}

	renderer.domElement.addEventListener("pointerdown", onPointerDown);
	renderer.domElement.addEventListener("pointerup", onPointerUp);

	onResize = () => {
		if (!container || !camera || !renderer) return;
		const w = container.clientWidth;
		const h = container.clientHeight;
		camera.aspect = w / h;
		camera.updateProjectionMatrix();
		renderer.setSize(w, h);
	};
	window.addEventListener("resize", onResize);
}

function animate() {
	animationId = requestAnimationFrame(animate);
	const delta = clock.getDelta();
	const elapsed = clock.getElapsedTime();

	const audioData: AudioData = audioAnalyzer.update(delta);

	terrainMaterial.uniforms.uTime.value = elapsed;
	terrainMaterial.uniforms.uSubBass.value = audioData.subBass;
	terrainMaterial.uniforms.uBass.value = audioData.bass;
	terrainMaterial.uniforms.uLowMid.value = audioData.lowMid;
	terrainMaterial.uniforms.uMid.value = audioData.mid;
	terrainMaterial.uniforms.uHighMid.value = audioData.highMid;
	terrainMaterial.uniforms.uPresence.value = audioData.presence;
	terrainMaterial.uniforms.uBrilliance.value = audioData.brilliance;
	terrainMaterial.uniforms.uAir.value = audioData.air;
	terrainMaterial.uniforms.uWarmth.value = audioData.warmth;
	terrainMaterial.uniforms.uBrightness.value = audioData.brightness;
	terrainMaterial.uniforms.uSharpness.value = audioData.sharpness;
	terrainMaterial.uniforms.uSmoothness.value = audioData.smoothness;
	terrainMaterial.uniforms.uDensity.value = audioData.density;
	terrainMaterial.uniforms.uEnergy.value = audioData.energy;
	terrainMaterial.uniforms.uRipples.value = ripples;

	terrainMaterial.uniforms.uBaseColor1.value.lerp(themeColors.base1, 3 * delta);
	terrainMaterial.uniforms.uBaseColor2.value.lerp(themeColors.base2, 3 * delta);
	terrainMaterial.uniforms.uCoolCore.value.lerp(
		themeColors.coolCore,
		3 * delta,
	);
	terrainMaterial.uniforms.uCoolEdge.value.lerp(
		themeColors.coolEdge,
		3 * delta,
	);
	terrainMaterial.uniforms.uWarmCore.value.lerp(
		themeColors.warmCore,
		3 * delta,
	);
	terrainMaterial.uniforms.uWarmEdge.value.lerp(
		themeColors.warmEdge,
		3 * delta,
	);
	terrainMaterial.uniforms.uRippleColor.value.lerp(
		themeColors.rippleColor,
		3 * delta,
	);
	terrainMaterial.uniforms.uGlowIntensity.value = THREE.MathUtils.lerp(
		terrainMaterial.uniforms.uGlowIntensity.value,
		themeColors.glowIntensity,
		3 * delta,
	);

	if (scene.fog instanceof THREE.Fog) {
		scene.fog.color.lerp(backgroundTargetColor, 3 * delta);
		scene.background = scene.fog.color;
	}

	const meteorMat = meteorMesh.material as THREE.MeshBasicMaterial;
	const meteorColor = new THREE.Color()
		.copy(themeColors.warmCore)
		.lerp(new THREE.Color(0xffffff), 0.7);
	meteorMat.color.lerp(meteorColor, 3 * delta);

	for (let i = 0; i < MAX_METEORS; i++) {
		const m = meteors[i];
		if (!m.active) {
			dummyPosition.set(0, -1000, 0);
			dummyScale.set(0, 0, 0);
			dummyMatrix.compose(dummyPosition, dummyQuaternion, dummyScale);
			meteorMesh.setMatrixAt(i, dummyMatrix);
		} else {
			m.y -= m.speed * 50 * delta;
			if (m.y <= 0) {
				m.active = false;
				addRipple(m.x, m.z, Math.min(m.strength * 1, 1), true);
				for (let p = 0; p < 8; p++) spawnParticle(m.x, 0.5, m.z, m.speed * 1.2);
			}
			dummyPosition.set(m.x, Math.max(0, m.y), m.z);
			dummyScale.set(1.5, 1.5, 1.5);
			dummyMatrix.compose(dummyPosition, dummyQuaternion, dummyScale);
			meteorMesh.setMatrixAt(i, dummyMatrix);

			if (m.y > 0 && Math.random() > 0.4) {
				spawnParticle(m.x, m.y, m.z, m.speed * 0.15);
			}
		}
	}
	meteorMesh.instanceMatrix.needsUpdate = true;

	const particleMat = particleMesh.material as THREE.MeshBasicMaterial;
	particleMat.color.copy(meteorMat.color);

	for (let i = 0; i < MAX_PARTICLES; i++) {
		const p = particles[i];
		if (!p.active) {
			dummyPosition.set(0, -1000, 0);
			dummyScale.set(0, 0, 0);
			dummyMatrix.compose(dummyPosition, dummyQuaternion, dummyScale);
			particleMesh.setMatrixAt(i, dummyMatrix);
		} else {
			p.life += delta;
			if (p.life >= p.maxLife) {
				p.active = false;
				dummyScale.set(0, 0, 0);
			} else {
				p.x += p.vx * delta * 8;
				p.y += p.vy * delta * 8;
				p.z += p.vz * delta * 8;
				const s = p.scale * (1 - p.life / p.maxLife);
				dummyPosition.set(p.x, p.y, p.z);
				dummyScale.set(s, s, s);
			}
			dummyMatrix.compose(dummyPosition, dummyQuaternion, dummyScale);
			particleMesh.setMatrixAt(i, dummyMatrix);
		}
	}
	particleMesh.instanceMatrix.needsUpdate = true;

	controls.update();
	renderer.render(scene, camera);
}

function cleanup() {
	if (animationId) cancelAnimationFrame(animationId);
	if (onResize) window.removeEventListener("resize", onResize);
	if (renderer) {
		renderer.dispose();
		if (container && renderer.domElement.parentNode === container) {
			container.removeChild(renderer.domElement);
		}
	}
	if (terrainMesh) {
		terrainMesh.geometry.dispose();
		terrainMaterial.dispose();
	}
	if (meteorMesh) {
		meteorMesh.geometry.dispose();
		(meteorMesh.material as THREE.Material).dispose();
	}
	if (particleMesh) {
		particleMesh.geometry.dispose();
		(particleMesh.material as THREE.Material).dispose();
	}
	controls?.dispose();
}

onMount(() => {
	init();
	animate();
	onSceneReady?.();
});

onDestroy(cleanup);
</script>

<div bind:this={container} class="mv-three-container" />