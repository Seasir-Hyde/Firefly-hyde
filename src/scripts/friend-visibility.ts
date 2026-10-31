import { serviceConfig } from "@/config/serviceConfig";
import {
	type FriendVisibilityStatus as FriendStatus,
	formatRemediationCountdown,
	remediationSeconds,
} from "@/utils/friend-remediation";

type FriendVisibility = {
	siteurl: string;
	status: FriendStatus;
	violationStartedAt: number;
	unavailableStartedAt: number;
};

const states: Map<string, FriendVisibility> = new Map();
const siteKey = (value: string): string => {
	try {
		const url = new URL(value, location.href);
		return `${url.hostname.toLowerCase().replace(/^www\./u, "")}${url.pathname.replace(/\/+$/u, "")}`;
	} catch {
		return value.toLowerCase();
	}
};

function applyVisibility(): void {
	for (const anchor of document.querySelectorAll<HTMLAnchorElement>(
		"a[data-friend-site-url]",
	)) {
		const siteurl = anchor.dataset.friendSiteUrl || "";
		if (!siteurl) continue;
		const stored = states.get(siteKey(siteurl));
		if (!anchor.dataset.friendConfiguredVisibilityStatus) {
			anchor.dataset.friendConfiguredVisibilityStatus =
				anchor.dataset.friendVisibilityStatus ||
				(anchor.dataset.friendUnavailable === "true"
					? "temporarily_unavailable"
					: "normal");
		}
		const configured = anchor.dataset
			.friendConfiguredVisibilityStatus as FriendStatus;
		const status =
			configured !== "normal" ? configured : stored?.status || configured;
		const startedAt =
			status === "temporarily_unavailable"
				? Number(anchor.dataset.friendUnavailableStartedAt || 0) ||
					stored?.unavailableStartedAt ||
					0
				: Number(anchor.dataset.friendViolationStartedAt || 0) ||
					stored?.violationStartedAt ||
					0;
		const blocked = status !== "normal";
		if (!anchor.hasAttribute("data-friend-original-tabindex")) {
			anchor.dataset.friendOriginalTabindex =
				anchor.getAttribute("tabindex") || "";
		}
		anchor.dataset.friendVisibilityStatus = status;
		anchor.setAttribute("aria-disabled", String(blocked));
		if (blocked) {
			anchor.removeAttribute("href");
			anchor.tabIndex = -1;
		} else {
			anchor.href = siteurl;
			if (anchor.dataset.friendOriginalTabindex)
				anchor.setAttribute("tabindex", anchor.dataset.friendOriginalTabindex);
			else anchor.removeAttribute("tabindex");
		}
		anchor.classList.toggle(
			"friend-card--temporarily-unavailable",
			status === "temporarily_unavailable",
		);
		anchor.classList.toggle(
			"friend-card--policy-violation",
			status === "policy_violation",
		);
		const overlay = anchor.querySelector<HTMLElement>(
			".friend-card-status-overlay",
		);
		if (overlay) {
			overlay.hidden = !blocked;
		}
		const unavailable = anchor.querySelector<HTMLElement>(
			".friend-card-status-badge",
		);
		if (unavailable) unavailable.hidden = status !== "temporarily_unavailable";
		const content = anchor.querySelector<HTMLElement>(
			".friend-card-remediation-overlay",
		);
		if (content) content.hidden = !blocked;
		const policy = anchor.querySelector<HTMLElement>(
			".friend-card-policy-label",
		);
		if (policy) policy.hidden = status !== "policy_violation";
		const description = anchor.querySelector<HTMLElement>(
			".friend-card-description",
		);
		if (description) description.hidden = status === "policy_violation";
		const timer = anchor.querySelector<HTMLTimeElement>(
			"[data-friend-remediation-countdown]",
		);
		if (timer) {
			timer.hidden = !blocked;
			if (blocked) {
				timer.textContent = formatRemediationCountdown(startedAt, status);
				if (startedAt > 0)
					timer.dateTime = new Date(
						(startedAt + remediationSeconds(status)) * 1000,
					).toISOString();
				else timer.removeAttribute("datetime");
			}
		}
		const title =
			anchor.dataset.friendTitle ||
			anchor.querySelector(".friend-card-title")?.textContent?.trim() ||
			"友链";
		anchor.setAttribute(
			"aria-label",
			status === "temporarily_unavailable"
				? `${title}，短暂失联，${formatRemediationCountdown(startedAt, status)}`
				: status === "policy_violation"
					? `${title}，违规友链，${formatRemediationCountdown(startedAt, status)}`
					: anchor.dataset.friendOwnSite === "true"
						? `${title}，本站`
						: anchor.dataset.friendRecommended === "true"
							? `${title}，推荐友链`
							: title,
		);
	}

	for (const image of document.querySelectorAll<HTMLImageElement>(
		"img[data-portal-target][data-friend-site-url]",
	)) {
		const blocked = states.get(
			siteKey(image.dataset.friendSiteUrl || ""),
		)?.status;
		if (blocked && blocked !== "normal")
			image.removeAttribute("data-portal-target");
		else image.dataset.portalTarget = image.dataset.friendSiteUrl || "";
	}
}

async function refreshVisibility(): Promise<void> {
	if (!serviceConfig.friendVisibilityUrl) return;
	try {
		const response = await fetch(serviceConfig.friendVisibilityUrl, {
			cache: "no-store",
			credentials: "omit",
			signal: AbortSignal.timeout(7000),
		});
		if (!response.ok) return;
		const payload = (await response.json()) as {
			visibility?: Array<Record<string, unknown>>;
		};
		if (!Array.isArray(payload.visibility)) return;
		for (const row of payload.visibility) {
			if (
				typeof row.siteurl !== "string" ||
				!["normal", "temporarily_unavailable", "policy_violation"].includes(
					String(row.status),
				)
			)
				continue;
			states.set(siteKey(row.siteurl), {
				siteurl: row.siteurl,
				status: row.status as FriendStatus,
				violationStartedAt: Number.isSafeInteger(row.violationStartedAt)
					? Number(row.violationStartedAt)
					: 0,
				unavailableStartedAt: Number.isSafeInteger(row.unavailableStartedAt)
					? Number(row.unavailableStartedAt)
					: 0,
			});
		}
		applyVisibility();
	} catch {
		applyVisibility();
	}
}

applyVisibility();
void refreshVisibility();
window.setInterval(applyVisibility, 1000);
new MutationObserver((mutations) => {
	const hasFriendLinks = mutations.some((mutation) =>
		[...mutation.addedNodes].some(
			(node) =>
				node instanceof Element &&
				(node.matches(
					"a[data-friend-site-url], img[data-portal-target][data-friend-site-url]",
				) ||
					node.querySelector(
						"a[data-friend-site-url], img[data-portal-target][data-friend-site-url]",
					)),
		),
	);
	if (hasFriendLinks) applyVisibility();
}).observe(document.body, { childList: true, subtree: true });
for (const event of [
	"astro:page-load",
	"astro:after-swap",
	"swup:contentReplaced",
	"swup:page:view",
]) {
	document.addEventListener(event, () => void refreshVisibility());
}
window.addEventListener("focus", () => void refreshVisibility());
document.addEventListener(
	"click",
	(event) => {
		const anchor =
			event.target instanceof Element
				? event.target.closest<HTMLAnchorElement>("a[data-friend-site-url]")
				: null;
		if (anchor?.getAttribute("aria-disabled") === "true") {
			event.preventDefault();
			event.stopImmediatePropagation();
		}
	},
	true,
);
