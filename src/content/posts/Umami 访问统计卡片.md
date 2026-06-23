---
title: Umami 访问统计卡片
published: 2026-06-02
pinned: false
description: "最近给博客侧边栏加了个小彩蛋——Umami 访问统计卡片，不用后端、不破风格，数据实时还带点击跳转。整个过程就是在 Firefly 主题里新建一个组件，填入 Umami 的分享链接，系统自动解析 API 和 Token，再配个备用数据兜底。连统计周期都能按需调，比如改成最近 30 天，改个毫秒数就完事～现在每次打开博客，侧边栏都默默告诉我：“今天又被看了好多眼”。"
image: api
slug: /UmamiStats
tags: ["Firefly"]
category: Firefly
draft: false
descriptionSource: ai

---

> [!NOTE] 提示
> 本文是在博主 [THW](https://blog.tianhw.top/) 文章：[为 Fuwari 添加 Umami 访问统计卡片](https://blog.tianhw.top/posts/fuwari-umami-stats/) 基础上增加了自己实践过程的一些细节，转载无需和我联系，但请注明文章来源。如果侵权之处，请联系博主进行删除，谢谢~

## 开始

对于静态博客而言，了解访客来源与流量趋势是很有必要的。在不自建服务器的前提下，配置简单，功能强大的 Umami 往往是我们的首选。

然而，直接挂载 Umami 的分享外链不够直观且破坏页面一致性。本文将教你如何将 Umami 的统计数据以原生组件的形式集成到 Firefly  主题的侧边栏中，让你的博客实时展示访问数据。

![Umami 访问统计卡片](https://image.tianhw.top/fuwari-umami-stats/card.webp)

## 准备工作

- 一个已部署好的Firefly博客
- 无服务器部署Umami统计教程：[Vercel 部署](https://teek.seasir.top/Teek/Umami#vercel-%E9%83%A8%E7%BD%B2)
- 启用Umami统计的站点

## 获取数据
为了获取到图中的这些数据，我们需要启用 Umami 统计的 分享 URL。

你应该会得到一个类似 https://umami.seasir.top/share/xxxxxxxxxxxx 格式的链接。记下这个链接，现在我们只需要它就能完成所有配置。

![alt text](https://image.tianhw.top/fuwari-umami-stats/umami.webp)

## 创建组件

文件路径：`src/components/widget/UmamiStats.astro`

```astro {32}
---
import WidgetLayout from "@/components/common/WidgetLayout.astro";

interface Props {
  class?: string;
  style?: string;
}
const { class: className, style } = Astro.props;
---

<WidgetLayout id="umami-stats" name="统计" class:list={["umami-stats-container", className, "cursor-pointer transition-opacity active:scale-95"]} {style}>
    <a target="_blank" rel="noopener noreferrer" class="block umami-link">
        <div class="text-center py-2">
            <div class="text-3xl font-bold text-neutral-900 dark:text-neutral-100 umami-total-pageviews">-</div>
            <div class="text-sm text-neutral-500 dark:text-neutral-400">总浏览量</div>
        </div>
        <div class="grid grid-cols-2 divide-x divide-neutral-200 dark:divide-neutral-700 text-center pt-2">
            <div class="px-2">
                <div class="text-xl font-bold text-neutral-900 dark:text-neutral-100 umami-total-visits">-</div>
                <div class="text-sm text-neutral-500 dark:text-neutral-400">访问数</div>
            </div>
            <div class="px-2">
                <div class="text-xl font-bold text-neutral-900 dark:text-neutral-100 umami-total-visitors">-</div>
                <div class="text-sm text-neutral-500 dark:text-neutral-400">游客数</div>
            </div>
        </div>
    </a>
</WidgetLayout>

<script>
const UMAMI_CONFIG = {
    shareUrl: 'https://umami.seasir.top/share/xxxxxxxxxxxx',
};

let __UMAMI_INTERNAL = {
    baseUrl: '',
    websiteId: '',
    shareToken: '',
    shareId: '',
    isReady: false
};

const FALLBACK_STATS = {
    pageviews: 1000,
    visits: 1000,
    visitors: 1000,
};

async function initUmamiConfig() {
    try {
        const sharePath = UMAMI_CONFIG.shareUrl.split('/share/')[1];
        if (!sharePath) throw new Error('Invalid Umami Share URL');

        let apiBase = '';
        if (UMAMI_CONFIG.shareUrl.includes('cloud.umami.is') || UMAMI_CONFIG.shareUrl.includes('analytics.umami.is')) {
            const region = UMAMI_CONFIG.shareUrl.includes('/analytics/eu/') ? 'eu' : 'us';
            apiBase = `https://cloud.umami.is/analytics/${region}/api`;
        } else {
            const urlObj = new URL(UMAMI_CONFIG.shareUrl);
            apiBase = `${urlObj.origin}/api`;
        }

        const res = await fetch(`${apiBase}/share/${sharePath}`);
        if (!res.ok) throw new Error(`Failed to fetch share config: ${res.status}`);
        const data = await res.json();

        __UMAMI_INTERNAL = {
            baseUrl: apiBase,
            websiteId: data.websiteId,
            shareToken: data.token,
            shareId: data.shareId,
            isReady: true
        };

        const links = document.querySelectorAll('.umami-link');
        links.forEach(link => link.setAttribute('href', UMAMI_CONFIG.shareUrl));

    } catch (e) {
        console.error('Umami Config Init Failed:', e);
    }
}

function formatNumber(num: number): string {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return Math.round(num).toString();
}

function setStats(values: { pageviews: number; visits: number; visitors: number }) {
    const pageviewsElements = document.querySelectorAll('.umami-total-pageviews');
    const visitsElements = document.querySelectorAll('.umami-total-visits');
    const visitorsElements = document.querySelectorAll('.umami-total-visitors');

    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
    const animHandles = new Map<HTMLElement, number>();

    const animateStat = (el: HTMLElement | null, to: number, duration = 2000) => {
        if (!el) return;

        const prev = animHandles.get(el);
        if (prev) cancelAnimationFrame(prev);

        const from = 0;
        const startTime = performance.now();

        const tick = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(1, elapsed / duration);
            const easedProgress = easeOutCubic(progress);

            const current = from + (to - from) * easedProgress;
            el.textContent = formatNumber(current);

            if (progress < 1) {
                animHandles.set(el, requestAnimationFrame(tick));
            }
        };
        animHandles.set(el, requestAnimationFrame(tick));
    };

    pageviewsElements.forEach(el => animateStat(el as HTMLElement, values.pageviews));
    visitsElements.forEach(el => animateStat(el as HTMLElement, values.visits));
    visitorsElements.forEach(el => animateStat(el as HTMLElement, values.visitors));
}

async function fetchUmamiStats() {
    if (!__UMAMI_INTERNAL.isReady) {
        await initUmamiConfig();
    }

    if (!__UMAMI_INTERNAL.isReady) {
        setStats(FALLBACK_STATS);
        return;
    }

    try {
        const endAt = Date.now();
        const startAt = 0;
        const url = `${__UMAMI_INTERNAL.baseUrl}/websites/${__UMAMI_INTERNAL.websiteId}/stats?startAt=${startAt}&endAt=${endAt}&unit=hour&timezone=Asia%2FShanghai`;

        const response = await fetch(url, {
            headers: {
                'x-umami-share-context': '1',
                'x-umami-share-token': __UMAMI_INTERNAL.shareToken
            }
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const getValue = (field: any) => (typeof field === 'object' ? field?.value : field) || 0;

        setStats({
            pageviews: getValue(data.pageviews),
            visits: getValue(data.visits),
            visitors: getValue(data.visitors),
        });

    } catch (error) {
        console.error('Umami Fetch Failed:', error);
        setStats(FALLBACK_STATS);
    }
}

let __umamiStatsStarted = false;
function startUmamiStats() {
    if (__umamiStatsStarted) return;
    __umamiStatsStarted = true;
    fetchUmamiStats();
}

function initUmamiStatsVisibility() {
    const containers = document.querySelectorAll('.umami-stats-container');
    const io = new IntersectionObserver((entries) => {
        let isAnyVisible = false;
        entries.forEach(entry => {
            if (entry.isIntersecting) isAnyVisible = true;
        });

        if (isAnyVisible) {
            startUmamiStats();
            io.disconnect();
        }
    }, { threshold: 0.1 });

    containers.forEach(container => io.observe(container));
}

initUmamiStatsVisibility();

if (window.swup) {
    window.swup.hooks.on('page:view', () => {
        __umamiStatsStarted = false;
        initUmamiStatsVisibility();
    });
}
</script>
```

## 配置参数
在代码文件的 script 部分，填入你的分享链接：
```ts {2}
const UMAMI_CONFIG = {
    shareUrl: 'https://umami.seasir.top/share/xxxxxxxxxxxx',  // ← 这里改成你自己的
};
```
系统会自动解析 API 路径、Website ID 和 验证 Token。

## 注册组件

文件路径：`src/components/layout/SideBar.astro`
```astro {2,7}
---
import UmamiStats from "@/components/widget/UmamiStats.astro";  // 引入 Umami 组件
---

// 组件映射表
const componentMap = {
	umamiStats: UmamiStats,
} satisfies Record<WidgetComponentType, typeof Profile>;
```

## 配置侧边栏

文件路径：`src/config/sidebarConfig.ts`

```ts 
{
    // 组件类型：Umami 统计组件
    type: "umamiStats",
    // 是否启用该组件
    enable: true,
    // 组件位置
    position: "top",
    // 是否在文章详情页显示
    showOnPostPage: true,
},
```

## 修改统计周期

默认为 所有时间 ，如果你想要调整浏览量统计的时间范围，可以修改 fetchUmamiStats 函数内的 startAt 参数。

常用时间周期公式（单位：毫秒）：

24小时：24 * 60 * 60 * 1000 = 86400000

最近30天：30 * 24 * 60 * 60 * 1000 = 2592000000

最近90天：90 * 24 * 60 * 60 * 1000 = 7776000000

修改示例（例如改为最近 30 天）：
```ts {3-4}
try {
    const endAt = Date.now();
    const startAt = 0; // [!code --]
    const startAt = Date.now() - 2592000000; //[!code ++]
}
```
这将从 30 天前开始统计浏览量。

##配置备用数据

如果遇到 API 请求失败，全新的组件会显示你配置的备用数据以保持 UI 美观。你可以在 FALLBACK_STATS 对象中修改这些数值（默认为1000）：
```ts {2-4}
const FALLBACK_STATS = {
    pageviews: 1000, // 备用总浏览量
    visits: 1000,    // 备用访问数
    visitors: 1000,  // 备用游客数
};
```

## 结尾

通过以上步骤，你就成功为 Fuwari 添加了具有丰富交互感、自动解析配置且支持点击查看详情的 Umami 统计卡片。