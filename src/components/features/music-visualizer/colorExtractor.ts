export function extractDominantColor(imageUrl: string): Promise<string | null> {
	return new Promise((resolve) => {
		const img = new Image();
		img.crossOrigin = "anonymous";

		const timeout = setTimeout(() => {
			resolve(null);
		}, 5000);

		img.onload = () => {
			clearTimeout(timeout);
			try {
				const canvas = document.createElement("canvas");
				const size = 50;
				canvas.width = size;
				canvas.height = size;
				const ctx = canvas.getContext("2d");
				if (!ctx) {
					resolve(null);
					return;
				}
				ctx.drawImage(img, 0, 0, size, size);
				const imageData = ctx.getImageData(0, 0, size, size);
				const data = imageData.data;

				let weightedR = 0;
				let weightedG = 0;
				let weightedB = 0;
				let totalWeight = 0;

				// Weighted average: brighter pixels contribute more
				for (let i = 0; i < data.length; i += 4) {
					const r = data[i];
					const g = data[i + 1];
					const b = data[i + 2];

					// Perceived brightness (luminance)
					const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

					// Only consider pixels above a brightness threshold (skip very dark ones)
					if (luminance < 50) continue;

					// Weight by brightness squared — brighter pixels dominate
					const weight = Math.pow(luminance / 255, 2);

					weightedR += r * weight;
					weightedG += g * weight;
					weightedB += b * weight;
					totalWeight += weight;
				}

				if (totalWeight === 0) {
					resolve(null);
					return;
				}

				let r = Math.round(weightedR / totalWeight);
				let g = Math.round(weightedG / totalWeight);
				let b = Math.round(weightedB / totalWeight);

				// Boost saturation
				const avg = (r + g + b) / 3;
				const boost = 1.3;
				r = Math.round(avg + (r - avg) * boost);
				g = Math.round(avg + (g - avg) * boost);
				b = Math.round(avg + (b - avg) * boost);

				r = Math.max(0, Math.min(255, r));
				g = Math.max(0, Math.min(255, g));
				b = Math.max(0, Math.min(255, b));

				resolve(`#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`);
			} catch {
				resolve(null);
			}
		};

		img.onerror = () => {
			clearTimeout(timeout);
			resolve(null);
		};

		img.src = imageUrl;
	});
}

/**
 * Lighten a hex color by mixing with white.
 */
export function lightenColor(hex: string, amount: number): string {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	const lr = Math.round(r + (255 - r) * amount);
	const lg = Math.round(g + (255 - g) * amount);
	const lb = Math.round(b + (255 - b) * amount);
	return `#${lr.toString(16).padStart(2, "0")}${lg.toString(16).padStart(2, "0")}${lb.toString(16).padStart(2, "0")}`;
}

/**
 * Darken a hex color by mixing with black.
 */
export function darkenColor(hex: string, amount: number): string {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	const dr = Math.round(r * (1 - amount));
	const dg = Math.round(g * (1 - amount));
	const db = Math.round(b * (1 - amount));
	return `#${dr.toString(16).padStart(2, "0")}${dg.toString(16).padStart(2, "0")}${db.toString(16).padStart(2, "0")}`;
}