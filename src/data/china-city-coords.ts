/** 省市中心点（WGS84 近似），用于足迹地图打点；frontmatter 有 lat/lng 时优先用手工坐标 */
export const chinaCityCoords: Record<string, [number, number]> = {
	// [lng, lat]
	北京: [116.4074, 39.9042],
	"北京|北京": [116.4074, 39.9042],
	天津: [117.2008, 39.0842],
	"天津|天津": [117.2008, 39.0842],
	上海: [121.4737, 31.2304],
	"上海|上海": [121.4737, 31.2304],
	"上海|金山区": [121.3416, 30.7242],
	河南: [113.6654, 34.7579],
	"河南|郑州": [113.6654, 34.7579],
	"河南|信阳": [114.0913, 32.147],
	"河南|新乡": [113.8838, 35.3026],
	"河南|洛阳": [112.454, 34.6197],
	山东: [117.0009, 36.6758],
	"山东|青岛": [120.3826, 36.0671],
	"山东|泰安": [117.0884, 36.2003],
	陕西: [108.9398, 34.3413],
	"陕西|西安": [108.9398, 34.3413],
};

export function lookupCityCoords(
	province: string,
	city?: string,
): [number, number] | null {
	const cityKey = city?.trim();
	if (cityKey) {
		const full = chinaCityCoords[`${province}|${cityKey}`];
		if (full) return full;
		const byCity = chinaCityCoords[cityKey];
		if (byCity) return byCity;
	}
	return chinaCityCoords[province] ?? null;
}
