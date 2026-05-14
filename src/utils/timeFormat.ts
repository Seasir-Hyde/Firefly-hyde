import { siteConfig } from "../config";

/**
 * Format relative time for diary moments
 * @param dateString ISO date string
 * @param minutesAgo text for minutes
 * @param hoursAgo text for hours
 * @param daysAgo text for days
 */
export function formatRelativeTime(
	dateString: string,
	minutesAgo: string,
	hoursAgo: string,
	daysAgo: string,
): string {
	let timeGap = 8; // Default UTC+8
	const timezone = siteConfig.timezone;
	if (timezone) {
		const match = timezone.match(/([+-]\d{2}):?(\d{2})?$/);
		if (match) {
			timeGap = Number.parseInt(match[1], 10);
		} else if (timezone === "Asia/Shanghai") {
			timeGap = 8;
		} else if (timezone === "UTC") {
			timeGap = 0;
		}
	}

	const now = new Date();
	const utc = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
	const localNow = utc + timeGap * 60 * 60 * 1000;
	const date = new Date(dateString);
	const diffInMinutes = Math.floor((localNow - date.getTime()) / (1000 * 60));

	if (diffInMinutes < 60) {
		return `${diffInMinutes}${minutesAgo}`;
	}
	if (diffInMinutes < 1440) {
		const hours = Math.floor(diffInMinutes / 60);
		return `${hours}${hoursAgo}`;
	}
	const days = Math.floor(diffInMinutes / 1440);
	return `${days}${daysAgo}`;
}
