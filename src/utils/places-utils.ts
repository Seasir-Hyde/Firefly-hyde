import { lookupCityCoords } from "@/data/china-city-coords";

export interface PlaceRecord {
	date: Date;
	endDate?: Date;
	province: string;
	city: string;
	district: string;
	experience: string;
	visitCount: number;
	source: "manual" | "timeline";
	timelineId?: string;
	category: string;
	lat?: number;
	lng?: number;
	images: string[];
	link?: string;
}

type ContentPlace = {
	date: Date;
	endDate?: Date;
	province: string;
	city?: string;
	district?: string;
	experience?: string;
	visitCount?: number;
	source?: "manual" | "timeline";
	timelineId?: string;
	category?: string;
	lat?: number;
	lng?: number;
	images?: string[];
	link?: string;
};

/** 未手写 category 时，按经历文案粗分类，供地图筛选胶囊使用 */
export function inferPlaceCategory(place: {
	experience?: string;
	timelineId?: string;
	source?: string;
	category?: string;
}): string {
	if (place.category?.trim()) return place.category.trim();
	const text = `${place.experience || ""} ${place.timelineId || ""}`;
	if (/小学|中学|高中|学院|大学|学校|完小|教育|education|school/.test(text)) {
		return "学校";
	}
	if (
		/开发|工程师|科技|工地|实习|事业部|技术中心|后端|服务器|Blued|贝塔|纸贵/.test(
			text,
		)
	) {
		return "工作";
	}
	return "旅游";
}

export function resolvePlaceCoords(place: {
	province: string;
	city?: string;
	lat?: number;
	lng?: number;
}): { lng: number; lat: number } | null {
	if (
		typeof place.lat === "number" &&
		typeof place.lng === "number" &&
		Number.isFinite(place.lat) &&
		Number.isFinite(place.lng)
	) {
		return { lng: place.lng, lat: place.lat };
	}
	const found = lookupCityCoords(place.province, place.city);
	if (!found) return null;
	return { lng: found[0], lat: found[1] };
}

export function placesFromContent(entries: ContentPlace[]): PlaceRecord[] {
	return entries.map((p) => ({
		date: p.date,
		endDate: p.endDate,
		province: p.province,
		city: p.city || "",
		district: p.district || "",
		experience: p.experience || "",
		visitCount: p.visitCount || 1,
		source: p.source || "manual",
		timelineId: p.timelineId,
		category: inferPlaceCategory(p),
		lat: p.lat,
		lng: p.lng,
		images: (p.images || []).filter(Boolean),
		link: p.link?.trim() || undefined,
	}));
}

export function getPlaceYears(places: PlaceRecord[]): number[] {
	const years = new Set<number>();
	for (const p of places) {
		years.add(p.date.getFullYear());
		if (p.endDate) years.add(p.endDate.getFullYear());
	}
	return [...years].sort((a, b) => b - a);
}

export function getPlaceCategories(places: PlaceRecord[]): string[] {
	const set = new Set<string>();
	for (const p of places) {
		if (p.category) set.add(p.category);
	}
	const preferred = ["学校", "工作", "旅游"];
	const rest = [...set].filter((c) => !preferred.includes(c)).sort();
	return [...preferred.filter((c) => set.has(c)), ...rest];
}

export function getYearKeys(place: PlaceRecord): number[] {
	const start = place.date.getFullYear();
	const end = place.endDate?.getFullYear() ?? start;
	const keys: number[] = [];
	for (let y = start; y <= end; y++) keys.push(y);
	return keys;
}

export function formatPlaceDateRange(place: PlaceRecord): string {
	const start = place.date.toISOString().slice(0, 10);
	if (place.endDate) {
		return `${start} — ${place.endDate.toISOString().slice(0, 10)}`;
	}
	return start;
}

export function placeToClient(place: PlaceRecord, index = 0) {
	const hasExact =
		typeof place.lat === "number" &&
		typeof place.lng === "number" &&
		Number.isFinite(place.lat) &&
		Number.isFinite(place.lng);
	const coords = resolvePlaceCoords(place);
	// 精确坐标也做极小偏移（约 10~20m），避免同点位被 MarkerCluster 合成 1 个导致数量变成 1
	// 无精确坐标时偏移稍大，避免同城完全重叠
	const step = hasExact ? 0.00015 : 0.012;
	const jitterLng = coords ? ((index % 7) - 3) * step : 0;
	const jitterLat = coords
		? ((Math.floor(index / 7) % 7) - 3) * step * 0.85
		: 0;

	return {
		province: place.province,
		city: place.city || "",
		district: place.district || "",
		experience: place.experience || "",
		visitCount: place.visitCount || 1,
		date: place.date.toISOString().split("T")[0],
		endDate: place.endDate ? place.endDate.toISOString().split("T")[0] : "",
		years: getYearKeys(place),
		year: place.date.getFullYear(),
		source: place.source,
		category: place.category,
		lat: coords ? coords.lat + jitterLat : null,
		lng: coords ? coords.lng + jitterLng : null,
		images: place.images || [],
		link: place.link || "",
		exact: hasExact,
	};
}
