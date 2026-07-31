import type { AnalyticsConfig } from "@/types/config";

declare global {
  interface Window {
    __fireflyAnalyticsLoaded?: boolean;
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    clarity?: (...args: unknown[]) => void;
    LA?: { ids: unknown[] };
  }
}

function appendScript(
  attrs: Record<string, string | undefined>,
  inline?: string,
) {
  const script = document.createElement("script");
  script.setAttribute("data-swup-ignore-script", "");
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined) script.setAttribute(key, value);
  }
  if (inline) script.textContent = inline;
  document.head.appendChild(script);
  return script;
}

function loadUmamiOutboundTracking() {
  const name = "outbound-link-click";
  const applyOutboundTracking = () => {
    document.querySelectorAll("a").forEach((a) => {
      if (
        a.host !== window.location.host &&
        !a.getAttribute("data-umami-event")
      ) {
        a.setAttribute("data-umami-event", name);
        a.setAttribute("data-umami-event-url", a.href);
      }
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyOutboundTracking, {
      once: true,
    });
  } else {
    applyOutboundTracking();
  }
  document.addEventListener("astro:page-load", applyOutboundTracking);
}

function loadUmami(analytics: AnalyticsConfig) {
  const umami = analytics.umamiAnalytics;
  if (!umami?.websiteId || !umami.scriptUrl) return;

  appendScript({
    defer: "",
    src: umami.scriptUrl,
    "data-website-id": umami.websiteId,
    "data-performance": umami.collectWebVitals ? "true" : undefined,
  });

  const replays = umami.replays;
  if (replays?.enabled && umami.replaysScriptUrl) {
    appendScript({
      defer: "",
      src: umami.replaysScriptUrl,
      "data-website-id": umami.websiteId,
      "data-sample-rate": String(replays.sampleRate ?? 0.15),
      "data-mask-level": replays.maskLevel ?? "moderate",
      "data-max-duration": String(replays.maxDuration ?? 300000),
      "data-block-selector": replays.blockSelector?.trim() || undefined,
    });
  }

  if (umami.trackOutboundLinks !== false) {
    loadUmamiOutboundTracking();
  }
}

function loadGoogleAnalytics(analytics: AnalyticsConfig) {
  const analyticsId = analytics.googleAnalyticsId?.trim();
  if (!analyticsId) return;

  appendScript({
    async: "",
    src: `https://www.googletagmanager.com/gtag/js?id=${analyticsId}`,
  });

  appendScript(
    {},
    `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${analyticsId}');`,
  );
}

function loadMicrosoftClarity(analytics: AnalyticsConfig) {
  const clarityId = analytics.microsoftClarityId?.trim();
  if (!clarityId) return;

  appendScript(
    {},
    `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${clarityId}");`,
  );
}

function loadLa51(analytics: AnalyticsConfig) {
  const la51 = analytics.la51Analytics;
  if (!la51?.Id) return;

  const config = {
    id: la51.Id,
    ck: la51.ck || la51.Id,
    autoTrack: la51.autoTrack ?? true,
    hashMode: la51.hashMode ?? false,
    screenRecord: la51.screenRecord ?? true,
  };
  const sdkUrl = la51.sdkUrl ?? "";

  appendScript(
    {},
    `!(function(p){"use strict";!(function(){var s=window,e=document,i=p,c=${JSON.stringify(sdkUrl)}||"".concat("https:"===e.location.protocol?"https://":"http://","sdk.51.la/js-sdk-pro.min.js"),n=e.createElement("script"),r=e.getElementsByTagName("script")[0];n.type="text/javascript",n.setAttribute("charset","UTF-8"),n.async=!0,n.src=c,n.id="LA_COLLECT",i.d=n;var o=function(){s.LA.ids.push(i)};s.LA?s.LA.ids&&o():(s.LA=p,s.LA.ids=[],o()),r.parentNode.insertBefore(n,r)})()}(${JSON.stringify(config)});`,
  );
}

export function loadAnalytics(analytics: AnalyticsConfig | undefined) {
  if (!analytics || window.__fireflyAnalyticsLoaded) return;
  window.__fireflyAnalyticsLoaded = true;

  loadGoogleAnalytics(analytics);
  loadMicrosoftClarity(analytics);
  loadUmami(analytics);
  loadLa51(analytics);
}