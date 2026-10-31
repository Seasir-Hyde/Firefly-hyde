import * as THREE from "three";

type TunnelController = {
	start: () => void;
	stop: () => void;
	setBoost: (active: boolean, startedAt?: number) => void;
	setDarkMode: (isDark: boolean) => void;
	cleanup: () => void;
};

type PortalRuntime = {
	activeRoot: HTMLElement | null;
	cleanup: (() => void) | null;
	eventsBound: boolean;
	hooksBound: boolean;
	scheduledFrame: number;
};

type PortalImageRecord = {
	url: string;
	texture: THREE.Texture | null;
	loading: boolean;
	loaded: boolean;
	materials: Set<THREE.MeshBasicMaterial>;
};

type PortalRevealState = {
	elapsed: number;
	delay: number;
	duration: number;
	startScale: number;
	terminalFill: boolean;
	terminalActivated: boolean;
};

declare global {
	interface Window {
		__rainztFriendsPortalRuntime?: PortalRuntime;
	}
}

const runtimeKey = "__rainztFriendsPortalRuntime";
const HOLD_TO_JUMP_MS = 1200;
const CRUISE_SPEED = 1;
const BOOST_START_SPEED = 4;
const BOOST_TOP_SPEED = 20;
const MAX_CAPTION_SCALE = 2.6;
const TUNNEL_END_SCALE = 0.58;
const TERMINAL_FILL_END_PROGRESS = 1 / 1.2;
const TERMINAL_FILL_WINDOW_SECONDS =
	(HOLD_TO_JUMP_MS / 1000) * TERMINAL_FILL_END_PROGRESS;
const TERMINAL_REVEAL_DURATION = 0.26;
const TERMINAL_TAIL_SEGMENT_COUNT = 5;
const TERMINAL_EXIT_FADE_START = 0.84;
const runtime: PortalRuntime = window[runtimeKey] || {
	activeRoot: null,
	cleanup: null,
	eventsBound: false,
	hooksBound: false,
	scheduledFrame: 0,
};

const clearActiveRuntime = () => {
	runtime.cleanup?.();
	runtime.cleanup = null;
	runtime.activeRoot = null;
};

const createTunnel = (
	frame: HTMLElement,
	canvas: HTMLCanvasElement,
	setCursor: (
		visible: boolean,
		pressed: boolean,
		x?: number,
		y?: number,
	) => void,
	initialDarkMode: boolean,
): TunnelController | null => {
	const urls = [
		...frame.querySelectorAll<HTMLImageElement>("[data-portal-source]"),
	]
		.map((image) => image.currentSrc || image.src)
		.filter(Boolean);

	try {
		const background = new THREE.Color("#02050c");
		const scene = new THREE.Scene();
		// Keep the canvas transparent so the caption layer can sit behind the
		// tunnel while the tunnel geometry remains in front of it.
		scene.background = null;
		scene.fog = new THREE.Fog(background, 0.01, 14.25);

		const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
		camera.position.set(0, 0, 0);

		const renderer = new THREE.WebGLRenderer({
			canvas,
			// Screenshot tiles and the shared line geometry do not benefit from
			// multisampling at full viewport resolution. Disabling it removes a
			// second full-screen sample pass on slower integrated GPUs.
			antialias: false,
			alpha: true,
			powerPreference: "high-performance",
		});
		renderer.setClearColor(0x000000, 0);
		// The tunnel is a full-viewport canvas. A retina DPR of 2 quadruples the
		// fragment workload without adding useful detail to the tiny screenshot
		// tiles, so keep the internal render target at a stable 1.25x maximum.
		renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.1));

		const tunnelWidth = 2;
		const tunnelHeight = 1.8;
		const segmentDepth = 1;
		// Keep the same depth illusion while removing three distant segments.
		// They contribute very little visual detail but add a full set of meshes
		// and draw calls on every frame.
		const segmentCount = 12;
		const columns = 4;
		const rows = 4;
		const halfWidth = tunnelWidth / 2;
		const halfHeight = tunnelHeight / 2;
		const columnWidth = tunnelWidth / columns;
		const rowHeight = tunnelHeight / rows;

		const lineMaterial = new THREE.LineBasicMaterial({
			color: new THREE.Color("#aeb6bd"),
			transparent: true,
			opacity: 0.48,
		});
		// One line draw call per tunnel segment instead of 20 TubeGeometry meshes
		// per segment. This preserves the grid while removing hundreds of per-frame
		// WebGL state changes.
		const linePositions: number[] = [];
		const addLine = (
			x1: number,
			y1: number,
			z1: number,
			x2: number,
			y2: number,
			z2: number,
		) => {
			linePositions.push(x1, y1, z1, x2, y2, z2);
		};
		for (let index = 0; index <= columns; index += 1) {
			const x = -halfWidth + index * columnWidth;
			addLine(x, -halfHeight, 0, x, -halfHeight, -segmentDepth);
			addLine(x, halfHeight, 0, x, halfHeight, -segmentDepth);
		}
		for (let index = 1; index < rows; index += 1) {
			const y = -halfHeight + index * rowHeight;
			addLine(-halfWidth, y, 0, -halfWidth, y, -segmentDepth);
			addLine(halfWidth, y, 0, halfWidth, y, -segmentDepth);
		}
		addLine(-halfWidth, -halfHeight, 0, halfWidth, -halfHeight, 0);
		addLine(-halfWidth, halfHeight, 0, halfWidth, halfHeight, 0);
		addLine(-halfWidth, -halfHeight, 0, -halfWidth, halfHeight, 0);
		addLine(halfWidth, -halfHeight, 0, halfWidth, halfHeight, 0);
		const lineGeometry = new THREE.BufferGeometry();
		lineGeometry.setAttribute(
			"position",
			new THREE.Float32BufferAttribute(linePositions, 3),
		);

		const textureLoader = new THREE.TextureLoader();
		textureLoader.setCrossOrigin("anonymous");
		const setDarkMode = (isDark: boolean) => {
			background.set(isDark ? "#02050c" : "#ffffff");
			if (scene.fog) scene.fog.color.copy(background);
			lineMaterial.color.set(isDark ? "#aeb6bd" : "#5f676d");
			lineMaterial.opacity = isDark ? 0.48 : 0.3;
		};
		setDarkMode(initialDarkMode);
		let alive = true;
		const imageRecords: PortalImageRecord[] = urls.map((url) => ({
			url,
			texture: null,
			loading: false,
			loaded: false,
			materials: new Set<THREE.MeshBasicMaterial>(),
		}));
		let textureCursor = 0;
		let textureTimer = 0;
		const loadTexture = (record: PortalImageRecord) => {
			if (!alive || record.loading || record.loaded) return;
			record.loading = true;
			textureLoader.load(
				record.url,
				(texture: THREE.Texture) => {
					void (async () => {
						let displayTexture = texture;
						// Friend screenshots are often 1200px wide or larger, while a
						// tunnel slab is only a few hundred pixels on screen. Decode a
						// bounded ImageBitmap before uploading it to WebGL when the browser
						// supports it. This keeps the visual sharpness while cutting texture
						// upload and sampling cost substantially.
						const source = texture.image as HTMLImageElement | undefined;
						if (
							typeof window.createImageBitmap === "function" &&
							source?.naturalWidth &&
							source?.naturalHeight
						) {
							try {
								const maxSize = 640;
								const scale = Math.min(
									1,
									maxSize / Math.max(source.naturalWidth, source.naturalHeight),
								);
								const bitmap = await window.createImageBitmap(source, {
									resizeWidth: Math.max(
										1,
										Math.round(source.naturalWidth * scale),
									),
									resizeHeight: Math.max(
										1,
										Math.round(source.naturalHeight * scale),
									),
									resizeQuality: "medium",
									imageOrientation: "flipY",
								});
								if (!alive) {
									bitmap.close();
									texture.dispose();
									return;
								}
								texture.dispose();
								displayTexture = new THREE.Texture(bitmap);
								displayTexture.needsUpdate = true;
							} catch {
								// Keep the original texture when ImageBitmap resizing is not
								// available for a particular browser or image format.
							}
						}
						if (!alive) {
							displayTexture.dispose();
							return;
						}
						displayTexture.minFilter = THREE.LinearFilter;
						displayTexture.generateMipmaps = false;
						displayTexture.colorSpace = THREE.SRGBColorSpace;
						record.texture = displayTexture;
						record.materials.forEach((material) => {
							material.map = displayTexture;
							material.needsUpdate = true;
						});
						record.loaded = true;
						record.loading = false;
					})();
				},
				undefined,
				() => {
					record.loading = false;
				},
			);
		};
		// The reference component also uses the same 15-segment tunnel, but it
		// does not need every full-size screenshot to be decoded before the first
		// frame. Start with the visible handful, then feed the rest to the loader
		// in small idle-friendly batches so opening the portal stays responsive.
		const loadTextureBatch = () => {
			if (!alive || !running) {
				textureTimer = 0;
				return;
			}
			const batchEnd = Math.min(textureCursor + 3, imageRecords.length);
			while (textureCursor < batchEnd)
				loadTexture(imageRecords[textureCursor++]);
			if (textureCursor < imageRecords.length) {
				textureTimer = window.setTimeout(loadTextureBatch, 160);
			} else {
				textureTimer = 0;
			}
		};

		const floorGeometry = new THREE.PlaneGeometry(columnWidth, segmentDepth);
		const wallGeometry = new THREE.PlaneGeometry(segmentDepth, rowHeight);

		const slots: Array<{
			geometry: THREE.BufferGeometry;
			position: THREE.Vector3;
			rotation: THREE.Euler;
		}> = [];
		const slotZ = -segmentDepth / 2;
		for (let index = 0; index < columns; index += 1) {
			const x = -halfWidth + index * columnWidth + columnWidth / 2;
			slots.push(
				{
					geometry: floorGeometry,
					position: new THREE.Vector3(x, -halfHeight, slotZ),
					rotation: new THREE.Euler(-Math.PI / 2, 0, 0),
				},
				{
					geometry: floorGeometry,
					position: new THREE.Vector3(x, halfHeight, slotZ),
					rotation: new THREE.Euler(Math.PI / 2, 0, 0),
				},
			);
		}
		for (let index = 0; index < rows; index += 1) {
			const y = -halfHeight + index * rowHeight + rowHeight / 2;
			slots.push(
				{
					geometry: wallGeometry,
					position: new THREE.Vector3(-halfWidth, y, slotZ),
					rotation: new THREE.Euler(0, Math.PI / 2, 0),
				},
				{
					geometry: wallGeometry,
					position: new THREE.Vector3(halfWidth, y, slotZ),
					rotation: new THREE.Euler(0, -Math.PI / 2, 0),
				},
			);
		}

		let imageIndex = 0;
		let populateIndex = 0;
		let terminalFillOrder = 0;
		let terminalFillTotal = 0;
		const slabMaterials: THREE.MeshBasicMaterial[] = [];
		const revealSlabs: THREE.Mesh[] = [];
		const populate = (group: THREE.Group, fillTail = false) => {
			const slabs = group.userData.slabs as THREE.Mesh[];
			const takesSlabs = populateIndex % 2 === 0;
			populateIndex += 1;
			const fillStagger = Math.max(
				0,
				TERMINAL_FILL_WINDOW_SECONDS - TERMINAL_REVEAL_DURATION,
			);
			for (const slab of slabs) {
				const material = slab.material as THREE.MeshBasicMaterial;
				const previousRecord = slab.userData
					.portalImageRecord as PortalImageRecord | null;
				// Keep screenshots that are already visible in place. Reassigning every
				// slab here makes the whole tunnel blink and creates a large visual burst.
				if (fillTail && slab.visible && previousRecord) continue;
				previousRecord?.materials.delete(material);
				slab.userData.portalImageRecord = null;
				slab.userData.portalReveal = null;
				material.map = null;
				material.opacity = 0;
				material.needsUpdate = true;
				slab.scale.setScalar(1);

				if (
					!fillTail &&
					(!takesSlabs || imageRecords.length === 0 || Math.random() > 0.5)
				) {
					slab.visible = false;
					continue;
				}
				if (imageRecords.length === 0) {
					slab.visible = false;
					continue;
				}
				// Tail-fill slabs stay hidden until their scheduled reveal starts. This
				// prevents the tunnel from looking full on the very first pressed frame.
				slab.visible = !fillTail;
				const record = imageRecords[(3 * imageIndex) % imageRecords.length];
				imageIndex += 1;
				record.materials.add(material);
				material.map = record.texture;
				material.needsUpdate = true;
				slab.userData.portalImageRecord = record;
				const tailProgress =
					fillTail && terminalFillTotal > 1
						? terminalFillOrder++ / (terminalFillTotal - 1)
						: 0;
				const reveal: PortalRevealState = {
					elapsed: 0,
					delay: fillTail ? fillStagger * tailProgress : Math.random() * 0.08,
					duration: fillTail
						? TERMINAL_REVEAL_DURATION
						: 0.46 + Math.random() * 0.16,
					startScale: 0.82 + Math.random() * 0.05,
					terminalFill: fillTail,
					terminalActivated: !fillTail,
				};
				slab.userData.portalReveal = reveal;
				slab.scale.setScalar(reveal.startScale);
			}
		};

		const createSegment = (z: number) => {
			const group = new THREE.Group();
			group.position.z = z;
			group.add(new THREE.LineSegments(lineGeometry, lineMaterial));

			const slabs = slots.map((slot) => {
				const material = new THREE.MeshBasicMaterial({
					transparent: true,
					opacity: 0,
					side: THREE.DoubleSide,
				});
				const mesh = new THREE.Mesh(slot.geometry, material);
				slabMaterials.push(material);
				revealSlabs.push(mesh);
				mesh.position.copy(slot.position);
				mesh.rotation.copy(slot.rotation);
				mesh.visible = false;
				group.add(mesh);
				return mesh;
			});
			group.userData.slabs = slabs;
			populate(group);
			return group;
		};

		const segments: THREE.Group[] = [];
		for (let index = 0; index < segmentCount; index += 1) {
			const segment = createSegment(-index * segmentDepth);
			scene.add(segment);
			segments.push(segment);
		}
		const isTailSegment = (segment: THREE.Group) =>
			segment.position.z <=
			camera.position.z -
				(segmentCount - TERMINAL_TAIL_SEGMENT_COUNT - 0.5) * segmentDepth;

		let running = false;
		let raf = 0;
		let last = 0;
		let pointerPressed = false;
		let boostActive = false;
		let boostStartedAt = 0;
		let scrollPosition = 0;
		let terminalFillPrepared = false;
		const resetTerminalFill = () => {
			if (!terminalFillPrepared) return;
			for (const segment of segments) populate(segment);
			terminalFillPrepared = false;
		};
		const setBoost = (active: boolean, startedAt = performance.now()) => {
			boostActive = active;
			boostStartedAt = active ? startedAt : 0;
			if (!active) {
				frame.style.opacity = "1";
				resetTerminalFill();
			}
		};
		const populateForCurrentState = (segment: THREE.Group) => {
			if (!boostActive || !terminalFillPrepared || !isTailSegment(segment)) {
				populate(segment);
				return;
			}
			const candidates = (segment.userData.slabs as THREE.Mesh[]).filter(
				(slab) => !slab.visible || !slab.userData.portalImageRecord,
			);
			terminalFillOrder = 0;
			terminalFillTotal = candidates.length;
			populate(segment, true);
			terminalFillTotal = 0;
			terminalFillOrder = 0;
		};
		const resizeObserver = new ResizeObserver(() => {
			const width = Math.max(1, frame.clientWidth);
			const height = Math.max(1, frame.clientHeight);
			camera.aspect = width / height;
			camera.updateProjectionMatrix();
			renderer.setSize(width, height, false);
		});
		resizeObserver.observe(frame);

		const animate = (now: number) => {
			if (!alive || !running) return;
			raf = requestAnimationFrame(animate);
			const delta = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
			last = now;
			const boostProgress = boostActive
				? Math.min(1, Math.max(0, (now - boostStartedAt) / HOLD_TO_JUMP_MS))
				: 0;
			// Start with an immediate push, then increase linearly while the mouse
			// button or space bar remains held instead of snapping to one speed.
			const speed = boostActive
				? BOOST_START_SPEED +
					(BOOST_TOP_SPEED - BOOST_START_SPEED) * boostProgress
				: CRUISE_SPEED;
			scrollPosition += speed * delta * 60;
			const desiredZ = -0.05 * scrollPosition;
			const cameraResponse = boostActive ? 0.16 : 0.1;
			camera.position.z += cameraResponse * (desiredZ - camera.position.z);
			const endEase = boostActive ? 1 - (1 - boostProgress) ** 3 : 0;
			const exitFade = boostActive
				? Math.min(
						1,
						Math.max(
							0,
							(boostProgress - TERMINAL_EXIT_FADE_START) /
								(1 - TERMINAL_EXIT_FADE_START),
						),
					)
				: 0;
			// The final part is the actual exit: fade the whole gallery frame away
			// while the caption remains in the clean outside space.
			frame.style.opacity = `${1 - exitFade}`;
			const targetTunnelScale = 1 - (1 - TUNNEL_END_SCALE) * endEase;
			segments.forEach((segment) => {
				segment.scale.x +=
					(boostActive ? 0.16 : 0.22) * (targetTunnelScale - segment.scale.x);
				segment.scale.y +=
					(boostActive ? 0.16 : 0.22) * (targetTunnelScale - segment.scale.y);
			});
			const targetZoom = 1 + 1.35 * endEase;
			camera.zoom += (boostActive ? 0.18 : 0.22) * (targetZoom - camera.zoom);
			camera.updateProjectionMatrix();
			if (boostActive && !terminalFillPrepared) {
				terminalFillPrepared = true;
				terminalFillOrder = 0;
				const tailSegments = segments
					.filter(isTailSegment)
					.sort((left, right) => left.position.z - right.position.z);
				const candidates = tailSegments
					.flatMap((segment) => segment.userData.slabs as THREE.Mesh[])
					.filter((slab) => !slab.visible || !slab.userData.portalImageRecord);
				terminalFillTotal = candidates.length;
				for (const segment of tailSegments) populate(segment, true);
				const tailRecords = new Set<PortalImageRecord>();
				tailSegments.forEach((segment) => {
					(segment.userData.slabs as THREE.Mesh[]).forEach((slab) => {
						const record = slab.userData
							.portalImageRecord as PortalImageRecord | null;
						if (record) tailRecords.add(record);
					});
				});
				tailRecords.forEach(loadTexture);
				terminalFillTotal = 0;
				terminalFillOrder = 0;
			}
			const span = segmentCount * segmentDepth;
			let minimum = Number.POSITIVE_INFINITY;
			let maximum = Number.NEGATIVE_INFINITY;
			for (const segment of segments) {
				minimum = Math.min(minimum, segment.position.z);
				maximum = Math.max(maximum, segment.position.z);
			}
			for (const segment of segments) {
				if (segment.position.z > camera.position.z + segmentDepth) {
					segment.position.z = minimum - segmentDepth;
					populateForCurrentState(segment);
				} else if (
					segment.position.z <
					camera.position.z - span - segmentDepth
				) {
					segment.position.z = maximum + segmentDepth;
					populateForCurrentState(segment);
				}
			}
			for (const slab of revealSlabs) {
				const record = slab.userData
					.portalImageRecord as PortalImageRecord | null;
				const reveal = slab.userData.portalReveal as PortalRevealState | null;
				if (!record || !reveal) continue;
				const material = slab.material as THREE.MeshBasicMaterial;
				if (reveal.terminalFill && !reveal.terminalActivated) {
					const terminalElapsed = boostActive
						? (now - boostStartedAt) / 1000
						: 0;
					if (terminalElapsed < reveal.delay) {
						material.opacity = 0;
						slab.visible = false;
						slab.scale.setScalar(reveal.startScale);
						continue;
					}
					reveal.terminalActivated = true;
					reveal.delay = 0;
					reveal.elapsed = 0;
				}
				if (!record.loaded || !record.texture) {
					material.opacity = 0;
					slab.visible = false;
					slab.scale.setScalar(reveal.startScale);
					continue;
				}
				reveal.elapsed += delta;
				const progress = Math.min(
					1,
					Math.max(0, (reveal.elapsed - reveal.delay) / reveal.duration),
				);
				if (reveal.elapsed <= reveal.delay) {
					slab.visible = false;
					material.opacity = 0;
					slab.scale.setScalar(reveal.startScale);
					continue;
				}
				slab.visible = true;
				const eased = 1 - (1 - progress) ** 3;
				material.opacity = 0.9 * eased;
				slab.scale.setScalar(
					reveal.startScale + (1 - reveal.startScale) * eased,
				);
				if (progress >= 1) slab.userData.portalReveal = null;
			}
			renderer.render(scene, camera);
		};

		const resize = () => {
			const width = Math.max(1, frame.clientWidth);
			const height = Math.max(1, frame.clientHeight);
			camera.aspect = width / height;
			camera.updateProjectionMatrix();
			renderer.setSize(width, height, false);
		};
		resize();

		const onPointerMove = (event: PointerEvent) => {
			setCursor(true, pointerPressed, event.clientX, event.clientY);
		};
		const onPointerEnter = () => setCursor(true, pointerPressed);
		const onPointerLeave = () => {
			pointerPressed = false;
			setCursor(false, false);
		};
		const onPointerDown = (event: PointerEvent) => {
			const target = event.target instanceof Element ? event.target : null;
			if (target?.closest("[data-portal-close]")) return;
			pointerPressed = true;
			setCursor(true, true);
		};
		const onPointerUp = () => {
			pointerPressed = false;
			setCursor(true, false);
		};
		frame.addEventListener("pointermove", onPointerMove);
		frame.addEventListener("pointerenter", onPointerEnter);
		frame.addEventListener("pointerleave", onPointerLeave);
		frame.addEventListener("pointerdown", onPointerDown);
		window.addEventListener("pointerup", onPointerUp);
		window.addEventListener("resize", resize, { passive: true });

		return {
			start: () => {
				if (running) return;
				running = true;
				frame.style.opacity = "1";
				last = 0;
				if (textureCursor < imageRecords.length && !textureTimer)
					loadTextureBatch();
				renderer.render(scene, camera);
				raf = requestAnimationFrame(animate);
			},
			stop: () => {
				running = false;
				if (raf) cancelAnimationFrame(raf);
				raf = 0;
				last = 0;
				pointerPressed = false;
				setBoost(false);
				camera.zoom = 1;
				camera.updateProjectionMatrix();
				for (const segment of segments) segment.scale.set(1, 1, 1);
				setCursor(false, false);
			},
			setBoost,
			setDarkMode,
			cleanup: () => {
				alive = false;
				running = false;
				if (textureTimer) window.clearTimeout(textureTimer);
				textureTimer = 0;
				if (raf) cancelAnimationFrame(raf);
				setBoost(false);
				resizeObserver.disconnect();
				frame.removeEventListener("pointermove", onPointerMove);
				frame.removeEventListener("pointerenter", onPointerEnter);
				frame.removeEventListener("pointerleave", onPointerLeave);
				frame.removeEventListener("pointerdown", onPointerDown);
				window.removeEventListener("pointerup", onPointerUp);
				window.removeEventListener("resize", resize);
				floorGeometry.dispose();
				wallGeometry.dispose();
				lineGeometry.dispose();
				lineMaterial.dispose();
				for (const material of slabMaterials) material.dispose();
				imageRecords.forEach((record) => {
					record.texture?.dispose();
					record.materials.clear();
				});
				renderer.dispose();
			},
		};
	} catch {
		return null;
	}
};

const setupPortal = () => {
	const root = document.querySelector<HTMLElement>("[data-friends-portal]");
	const trigger = document.querySelector<HTMLElement>(
		"[data-friends-portal-trigger]",
	);
	const isRoute = root?.dataset.friendsPortalRoute === "true";
	if (!root || (!trigger && !isRoute)) {
		clearActiveRuntime();
		return;
	}
	if (runtime.activeRoot === root) return;

	clearActiveRuntime();
	runtime.activeRoot = root;
	// The friends page is rendered inside a transformed content shell. A fixed
	// child of that shell inherits its narrow containing block, so promote the
	// portal to body before measuring the canvas to guarantee true viewport size.
	const movedToBody = root.parentElement !== document.body;
	if (movedToBody) document.body.appendChild(root);

	const frame = root.querySelector<HTMLElement>("[data-portal-frame]");
	const canvas = root.querySelector<HTMLCanvasElement>("[data-portal-canvas]");
	const cursor = root.querySelector<HTMLElement>("[data-portal-cursor]");
	const jump = root.querySelector<HTMLButtonElement>("[data-portal-jump]");
	const jumpLabel = root.querySelector<HTMLElement>("[data-portal-jump-label]");
	if (!frame || !canvas) return;
	const targets = [
		...root.querySelectorAll<HTMLImageElement>("[data-portal-target]"),
	]
		.map((image) => image.dataset.portalTarget?.trim())
		.filter((url): url is string => Boolean(url));

	const setCursor = (
		visible: boolean,
		pressed: boolean,
		x?: number,
		y?: number,
	) => {
		if (!cursor) return;
		cursor.style.opacity = visible ? "1" : "0";
		cursor.textContent = pressed ? "松开取消" : "长按跳转";
		if (typeof x === "number" && typeof y === "number") {
			const rect = frame.getBoundingClientRect();
			cursor.style.left = `${x - rect.left + 12}px`;
			cursor.style.top = `${y - rect.top - 10}px`;
			cursor.style.transform = "translate(0, -100%)";
		}
	};

	const isDarkMode = () => document.documentElement.classList.contains("dark");
	const tunnel = createTunnel(frame, canvas, setCursor, isDarkMode());
	if (!tunnel) root.classList.add("is-fallback");

	let isOpen = false;
	let lastFocusedElement: Element | null = null;
	let holdTimer = 0;
	let holdFrame = 0;
	let holdStartedAt = 0;
	let holdPointerId: number | null = null;
	let holdSource: "pointer" | "keyboard" | null = null;
	let holdActive = false;
	let holdCompleted = false;
	let navigationTimer = 0;
	const cleanups: Array<() => void> = [];
	const closeButtons = root.querySelectorAll<HTMLElement>(
		"[data-portal-close]",
	);
	const themeObserver = new MutationObserver(() =>
		tunnel?.setDarkMode(isDarkMode()),
	);
	themeObserver.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ["class", "data-theme"],
	});
	cleanups.push(() => themeObserver.disconnect());

	const updateJump = (progress: number, label: string) => {
		root.style.setProperty(
			"--portal-caption-scale",
			`${1 + (MAX_CAPTION_SCALE - 1) * progress}`,
		);
		root.classList.toggle("is-holding", holdActive);
		if (!jump) return;
		jump.style.setProperty(
			"--portal-hold-progress",
			`${Math.round(progress * 100)}%`,
		);
		jump.classList.toggle("is-holding", holdActive);
		if (jumpLabel) jumpLabel.textContent = label;
	};

	const cancelHold = () => {
		if (holdTimer) window.clearTimeout(holdTimer);
		if (holdFrame) cancelAnimationFrame(holdFrame);
		holdTimer = 0;
		holdFrame = 0;
		holdActive = false;
		holdPointerId = null;
		holdSource = null;
		tunnel?.setBoost(false);
		if (!holdCompleted) updateJump(0, "长按跳转");
	};

	const pickRandomTarget = () => {
		const externalTargets = targets.filter((url) => {
			try {
				return (
					new URL(url, window.location.href).origin !== window.location.origin
				);
			} catch {
				return false;
			}
		});
		const candidates = externalTargets.length > 0 ? externalTargets : targets;
		return candidates[Math.floor(Math.random() * candidates.length)];
	};

	const jumpToRandomFriend = () => {
		if (!isOpen || holdCompleted) return;
		holdCompleted = true;
		holdActive = false;
		if (holdFrame) cancelAnimationFrame(holdFrame);
		if (holdTimer) window.clearTimeout(holdTimer);
		holdFrame = 0;
		holdTimer = 0;
		const target = pickRandomTarget();
		if (!target) {
			tunnel?.setBoost(false);
			holdCompleted = false;
			updateJump(0, "暂无可跳转友链");
			window.setTimeout(() => {
				if (isOpen) {
					holdCompleted = false;
					updateJump(0, "长按跳转");
				}
			}, 1200);
			return;
		}
		// Keep the tunnel at its top speed while the white transition plays.
		tunnel?.setBoost(true, holdStartedAt);
		updateJump(1, "正在前往…");
		root.classList.add("is-jumping");
		root.setAttribute("aria-busy", "true");
		navigationTimer = window.setTimeout(() => {
			navigationTimer = 0;
			window.location.assign(target);
		}, 720);
	};

	const animateHold = (now: number) => {
		if (!holdActive) return;
		const progress = Math.min(1, (now - holdStartedAt) / HOLD_TO_JUMP_MS);
		const remaining = Math.max(
			0,
			(HOLD_TO_JUMP_MS - (now - holdStartedAt)) / 1000,
		);
		updateJump(
			progress,
			progress > 0.02 ? `${remaining.toFixed(1)}s` : "长按跳转",
		);
		holdFrame = requestAnimationFrame(animateHold);
	};

	const startHold = (
		source: "pointer" | "keyboard",
		pointerId: number | null = null,
	) => {
		if (!isOpen || holdActive || holdCompleted) return false;
		cancelHold();
		holdCompleted = false;
		holdActive = true;
		holdPointerId = pointerId;
		holdSource = source;
		holdStartedAt = performance.now();
		tunnel?.setBoost(true, holdStartedAt);
		updateJump(0, "长按跳转");
		holdTimer = window.setTimeout(jumpToRandomFriend, HOLD_TO_JUMP_MS);
		holdFrame = requestAnimationFrame(animateHold);
		return true;
	};

	const onHoldStart = (event: PointerEvent) => {
		if (!isOpen || event.button !== 0) return;
		const target = event.target instanceof Element ? event.target : null;
		if (target?.closest("[data-portal-close]")) return;
		event.preventDefault();
		if (!startHold("pointer", event.pointerId)) return;
		frame.setPointerCapture?.(event.pointerId);
	};

	const onHoldEnd = (event: PointerEvent) => {
		if (holdSource !== "pointer") return;
		if (holdPointerId !== null && event.pointerId !== holdPointerId) return;
		if (!holdCompleted) cancelHold();
	};

	const openPortal = () => {
		if (isOpen) return;
		isOpen = true;
		holdCompleted = false;
		cancelHold();
		lastFocusedElement = document.activeElement;
		root.hidden = false;
		root.setAttribute("aria-hidden", "false");
		document.documentElement.classList.add("friends-portal-lock");
		window.dispatchEvent(new CustomEvent("friends-portal-open"));
		root.classList.add("is-open");
		tunnel?.start();
		window.setTimeout(() => frame.focus(), 80);
	};

	const closePortal = (navigateBack = true) => {
		if (!isOpen) return;
		isOpen = false;
		if (navigationTimer) window.clearTimeout(navigationTimer);
		navigationTimer = 0;
		cancelHold();
		holdCompleted = false;
		root.classList.remove("is-jumping");
		root.removeAttribute("aria-busy");
		root.classList.remove("is-open");
		root.setAttribute("aria-hidden", "true");
		document.documentElement.classList.remove("friends-portal-lock");
		window.dispatchEvent(new CustomEvent("friends-portal-close"));
		tunnel?.stop();
		window.setTimeout(() => {
			if (!isOpen) root.hidden = true;
		}, 360);
		if (lastFocusedElement instanceof HTMLElement) lastFocusedElement.focus();
		if (isRoute && navigateBack) {
			window.location.assign("/friends/");
		}
	};

	const onTriggerClick = (event: Event) => {
		event.preventDefault();
		openPortal();
	};
	const onCloseClick = (event: Event) => {
		event.preventDefault();
		closePortal();
	};
	const onKeyDown = (event: KeyboardEvent) => {
		if (!isOpen) return;
		if (
			(event.code === "Space" || event.key === " ") &&
			!event.ctrlKey &&
			!event.altKey &&
			!event.metaKey &&
			!event.shiftKey
		) {
			const target = event.target instanceof Element ? event.target : null;
			if (target?.closest("[data-portal-close]")) return;
			event.preventDefault();
			if (
				event.repeat ||
				holdSource === "keyboard" ||
				holdActive ||
				holdCompleted
			)
				return;
			startHold("keyboard");
			return;
		}
		if (event.key === "Escape") {
			event.preventDefault();
			closePortal();
			return;
		}
		if (event.key !== "Tab") return;
		const focusable = [
			...root.querySelectorAll<HTMLElement>(
				'button, [tabindex]:not([tabindex="-1"]), a[href]',
			),
		];
		if (!focusable.length) return;
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	};
	const onKeyUp = (event: KeyboardEvent) => {
		if (
			(event.code !== "Space" && event.key !== " ") ||
			holdSource !== "keyboard"
		)
			return;
		event.preventDefault();
		if (!holdCompleted) cancelHold();
	};
	const onWindowBlur = () => {
		if (holdSource === "keyboard" && !holdCompleted) cancelHold();
	};

	if (trigger) {
		trigger.addEventListener("click", onTriggerClick);
		cleanups.push(() => trigger.removeEventListener("click", onTriggerClick));
	}
	closeButtons.forEach((button) => {
		button.addEventListener("click", onCloseClick);
		cleanups.push(() => button.removeEventListener("click", onCloseClick));
	});
	document.addEventListener("keydown", onKeyDown);
	cleanups.push(() => document.removeEventListener("keydown", onKeyDown));
	window.addEventListener("keyup", onKeyUp);
	cleanups.push(() => window.removeEventListener("keyup", onKeyUp));
	window.addEventListener("blur", onWindowBlur);
	cleanups.push(() => window.removeEventListener("blur", onWindowBlur));
	frame.addEventListener("pointerdown", onHoldStart);
	window.addEventListener("pointerup", onHoldEnd);
	window.addEventListener("pointercancel", onHoldEnd);
	cleanups.push(() => frame.removeEventListener("pointerdown", onHoldStart));
	cleanups.push(() => window.removeEventListener("pointerup", onHoldEnd));
	cleanups.push(() => window.removeEventListener("pointercancel", onHoldEnd));

	runtime.cleanup = () => {
		for (const cleanup of cleanups.splice(0)) cleanup();
		closePortal(false);
		tunnel?.cleanup();
		root.classList.remove("is-fallback");
		root.hidden = true;
		if (movedToBody) root.remove();
		runtime.activeRoot = null;
	};

	if (isRoute) openPortal();
};

const scheduleSetup = () => {
	if (runtime.scheduledFrame) cancelAnimationFrame(runtime.scheduledFrame);
	runtime.scheduledFrame = requestAnimationFrame(() => {
		runtime.scheduledFrame = 0;
		setupPortal();
	});
};

const bindSwupHooks = () => {
	if (runtime.hooksBound || !window.swup?.hooks) return;
	window.swup.hooks.on("visit:start", clearActiveRuntime);
	window.swup.hooks.on("content:replace", scheduleSetup);
	window.swup.hooks.on("page:view", scheduleSetup);
	runtime.hooksBound = true;
};

if (!runtime.eventsBound) {
	for (const eventName of [
		"astro:page-load",
		"astro:after-swap",
		"swup:contentReplaced",
		"swup:content:replace",
		"swup:page:view",
	]) {
		document.addEventListener(eventName, scheduleSetup);
	}
	document.addEventListener("astro:before-swap", clearActiveRuntime);
	document.addEventListener("swup:enable", bindSwupHooks);
	runtime.eventsBound = true;
}

bindSwupHooks();
window[runtimeKey] = runtime;
scheduleSetup();
