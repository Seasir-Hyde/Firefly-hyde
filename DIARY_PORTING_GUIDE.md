# Firefly-Hyde 日记页面移植教程

本文档详细介绍如何将日记页面功能移植到 Firefly-Hyde 主题中。

---

## 📁 项目文件结构

### 1. 新增文件清单

```
src/
├── components/
│   ├── atoms/
│   │   └── FilterTabs.astro          ✨ 新增 - 筛选标签组件
│   │   └── index.ts                  ✨ 新增 - 组件导出
│   └── features/
│       └── diary/
│           ├── index.ts               ✨ 新增 - 组件导出
│           ├── types.ts               ✨ 新增 - 类型定义
│           └── MomentCard.astro       ✨ 新增 - 日记卡片组件
├── data/
│   └── diary.ts                      ✨ 新增 - 日记数据管理
├── pages/
│   └── diary.astro                   ✨ 新增 - 日记页面
├── config/
│   └── siteConfig.ts                  ✏️ 修改 - 添加日记配置
├── types/
│   └── config.ts                      ✏️ 修改 - 添加类型定义
├── constants/
│   └── link-presets.ts               ✏️ 修改 - 添加导航链接
├── utils/
│   └── timeFormat.ts                 ✏️ 修改 - 修复时区属性名
├── i18n/
│   ├── i18nKey.ts                    ✏️ 修改 - 添加翻译键
│   └── languages/
│       ├── en.ts                     ✏️ 修改 - 英文翻译
│       ├── zh_CN.ts                  ✏️ 修改 - 中文翻译
│       ├── zh_TW.ts                  ✏️ 修改 - 繁体翻译
│       ├── ja.ts                     ✏️ 修改 - 日文翻译
│       └── ru.ts                     ✏️ 修改 - 俄文翻译
└── config/
    └── navBarConfig.ts               ✏️ 修改 - 导航栏配置
```

---

## 📝 详细步骤

### 创建日记数据文件

**文件路径**：`src/data/diary.ts`

```ts
// 日记数据配置
// 用于管理日记页面的数据

export interface DiaryItem {
    id: number;
    content: string;
    date: string;
    images?: string[];
    location?: string;        // 位置名称
    locationUrl?: string;       // 位置链接（百度地图等）
    mood?: string;             // 心情表情
    tags?: string[];           // 标签数组
    avatar?: string;           // 头像URL（可选，默认使用全局配置）
}

// 示例日记数据
const diaryData: DiaryItem[] = [
    {
        id: 1,
        content: "📍𝘾𝙝𝙪𝙖𝙣𝙓𝙞丨川西\n勇敢的人先享受高反再享受世界🗺️✨🤣",
        date: "2026-05-01T10:30:00Z",
        location: "阿坝藏族羌族自治州·四姑娘山景区",
        locationUrl: "https://j.map.baidu.com/cf/2M",
        images: [
            "https://example.com/image1.jpg",
            "https://example.com/image2.jpg",
        ],
        tags: ["旅行", "川西"],
        mood: "😊",
    },
];

// 获取日记列表（按时间倒序）
export const getDiaryList = (limit?: number) => {
    const sortedData = [...diaryData].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    if (limit && limit > 0) {
        return sortedData.slice(0, limit);
    }

    return sortedData;
};

// 获取所有标签
export const getAllTags = () => {
    const tags = new Set<string>();
    diaryData.forEach((item) => {
        if (item.tags) {
            item.tags.forEach((tag) => tags.add(tag));
        }
    });
    return Array.from(tags).sort();
};
```

---

### 创建日记组件

#### 2.1 类型定义

**文件路径**：`src/components/features/diary/types.ts`

```ts
import type { DiaryItem } from "../../../data/diary";

export interface MomentCardProps {
    moment: DiaryItem;
    index: number;
    minutesAgo: string;
    hoursAgo: string;
    daysAgo: string;
}
```

#### 2.2 日记卡片组件

**文件路径**：`src/components/features/diary/MomentCard.astro`

```astro
---
import { Icon } from "astro-icon/components";

import { formatRelativeTime } from "../../../utils/timeFormat";
import type { MomentCardProps } from "./types";
import { siteConfig } from "../../../config/siteConfig";

const { moment, index, minutesAgo, hoursAgo, daysAgo } =
    Astro.props as MomentCardProps;

const relativeTime = formatRelativeTime(
    moment.date,
    minutesAgo,
    hoursAgo,
    daysAgo,
);

// 头像优先使用日记本身的头像，其次使用配置的默认头像
const avatarUrl = moment.avatar || siteConfig.diary?.defaultAvatar || "https://api.dicebear.com/7.x/avataaars/svg?seed=default";
---

<div
    class="moment-card group relative bg-transparent rounded-xl border border-black/10 dark:border-white/10 overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1"
    data-tags={moment.tags?.join(",") || ""}
>
    <div class="p-5">
        <!-- 头像和内容行 - 微信朋友圈风格 -->
        <div class="flex items-start gap-3">
            <!-- 头像 -->
            <div class="flex-shrink-0">
                <img
                    src={avatarUrl}
                    alt="avatar"
                    class="w-10 h-10 rounded-lg object-cover bg-gray-100 dark:bg-gray-800"
                />
            </div>
            <!-- 内容 -->
            <div class="flex-1 min-w-0">
                <p
                    class="text-sm md:text-base text-black/90 dark:text-white/90 leading-relaxed whitespace-pre-wrap"
                >
                    {moment.content}
                </p>

        <!-- 图片网格 -->
        {
            moment.images && moment.images.length > 0 && (
                <div
                    class:list={[
                        "diary-images grid gap-2 mt-3 mb-3",
                        moment.images.length === 1 && "diary-images-single",
                        moment.images.length === 2 && "diary-images-double",
                        moment.images.length === 3 && "diary-images-triple",
                        moment.images.length >= 4 && "diary-images-grid",
                    ]}
                >
                    {moment.images.map((image, imgIndex) => (
                        <div class="relative rounded-lg overflow-hidden aspect-square cursor-pointer">
                            <a
                                href="javascript:void(0)"
                                data-src={image}
                                data-fancybox={`diary-${index}-${imgIndex}`}
                                class="block w-full h-full"
                            >
                                <img
                                    src={image}
                                    alt="diary moment image"
                                    class="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                                    loading="lazy"
                                    decoding="async"
                                />
                            </a>
                        </div>
                    ))}
                </div>
            )
        }

        <!-- 标签 -->
        {
            moment.tags && moment.tags.length > 0 && (
                <div class="flex flex-wrap gap-1.5 mb-3">
                    {moment.tags.map((tag: string) => (
                        <span class="btn-regular h-6 text-xs px-2 rounded-lg">
                            {tag}
                        </span>
                    ))}
                </div>
            )
        }

        <!-- 分隔线 -->
        <hr class="border-t border-black/5 dark:border-white/5 my-3" />

        <!-- 底部信息 -->
        <div
            class="flex items-center justify-between text-xs text-black/50 dark:text-white/50 flex-wrap gap-2"
        >
            <div class="flex flex-col gap-1">
                <!-- 位置信息（可点击跳转地图） -->
                {
                    moment.location && (
                        <div class="flex items-center gap-1.5">
                            <Icon
                                name="material-symbols:location-on"
                                class="text-xs w-3.5 h-3.5"
                            />
                            {moment.locationUrl ? (
                                <a
                                    href={moment.locationUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="text-[var(--primary)] hover:underline truncate max-w-[200px]"
                                >
                                    {moment.location}
                                </a>
                            ) : (
                                <span class="truncate max-w-[200px]">{moment.location}</span>
                            )}
                        </div>
                    )
                }
                <!-- 时间信息 -->
                <div class="flex items-center gap-1.5">
                    <Icon
                        name="material-symbols:schedule"
                        class="text-xs w-3.5 h-3.5"
                    />
                    <time datetime={moment.date}>{relativeTime}</time>
                </div>
            </div>

            <!-- 心情 -->
            <div class="flex items-center gap-3">
                {
                    moment.mood && (
                        <span class="flex items-center gap-1">
                            {moment.mood}
                        </span>
                    )
                }
            </div>
        </div>
        </div>
        </div>
    </div>

    <!-- 悬停渐变遮罩 -->
    <div
        class="absolute inset-0 bg-gradient-to-br from-[var(--primary)]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-xl"
    >
    </div>
</div>

<style>
    .moment-card {
        animation: fadeInUp 0.5s ease-out forwards;
        opacity: 0;
    }

    .moment-card.filtered-out {
        display: none;
    }

    @keyframes fadeInUp {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    /* 图片网格动画延迟 */
    .moment-card:nth-child(1) { animation-delay: 0.03s; }
    .moment-card:nth-child(2) { animation-delay: 0.06s; }
    .moment-card:nth-child(3) { animation-delay: 0.09s; }
    .moment-card:nth-child(4) { animation-delay: 0.12s; }
    .moment-card:nth-child(5) { animation-delay: 0.15s; }
    .moment-card:nth-child(6) { animation-delay: 0.18s; }
    .moment-card:nth-child(7) { animation-delay: 0.21s; }
    .moment-card:nth-child(8) { animation-delay: 0.24s; }
    .moment-card:nth-child(9) { animation-delay: 0.27s; }
    .moment-card:nth-child(10) { animation-delay: 0.3s; }

    /* 1张图片：大图 */
    .diary-images-single {
        grid-template-columns: 1fr;
        max-width: 400px;
    }

    /* 2张图片：双列 */
    .diary-images-double {
        grid-template-columns: repeat(2, 1fr);
        max-width: 500px;
    }

    /* 3张图片：1大+2小 */
    .diary-images-triple {
        grid-template-columns: repeat(2, 1fr);
        max-width: 500px;
    }
    .diary-images-triple > :first-child {
        grid-row: span 2;
    }

    /* 4+张图片：3x3网格 */
    .diary-images-grid {
        grid-template-columns: repeat(3, 1fr);
        max-width: 600px;
    }

    @media (min-width: 768px) {
        .diary-images-single { max-width: 500px; }
        .diary-images-double { max-width: 560px; }
        .diary-images-triple { max-width: 560px; }
        .diary-images-grid {
            grid-template-columns: repeat(3, 1fr);
            max-width: 700px;
        }
    }

    @media (max-width: 480px) {
        .diary-images-triple {
            grid-template-columns: repeat(2, 1fr);
        }
        .diary-images-triple > :first-child {
            grid-row: span 1;
        }
    }
</style>
```

#### 2.3 组件导出

**文件路径**：`src/components/features/diary/index.ts`

```ts
export { default as MomentCard } from "./MomentCard.astro";
export * from "./types";
```

---

### 创建筛选标签组件

**文件路径**：`src/components/atoms/FilterTabs.astro`

```astro
---
import { Icon } from "astro-icon/components";

interface FilterTab {
    value: string;
    label: string;
    icon?: string;
    count?: number;
}

interface Props {
    tabs: FilterTab[];
    dataAttr: string;
    activeValue?: string;
    class?: string;
}

const {
    tabs,
    dataAttr,
    activeValue = "all",
    class: className = "",
} = Astro.props;
---

<div class:list={["filter-tabs", className]}>
    {
        tabs.map((tab) => (
            <button
                class:list={[
                    "filter-tabs-item",
                    { active: tab.value === activeValue },
                ]}
                data-filter-value={tab.value}
                data-filter-attr={dataAttr}
            >
                {tab.icon && <Icon name={tab.icon} class="text-base w-4 h-4" />}
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                    <span class="filter-tabs-count">({tab.count})</span>
                )}
            </button>
        ))
    }
</div>

<style>
    .filter-tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }

    .filter-tabs-item {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        padding: 0.5rem 1rem;
        border: 1px solid var(--line-divider);
        border-radius: var(--radius-large);
        background: var(--btn-regular-bg);
        color: var(--btn-content);
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        white-space: nowrap;
    }

    .filter-tabs-item iconify-icon {
        flex-shrink: 0;
        opacity: 0.7;
        transition: opacity 0.2s ease;
    }

    .filter-tabs-item:hover:not(.active) {
        background: var(--btn-regular-bg-hover);
        border-color: var(--primary);
    }

    .filter-tabs-item:hover:not(.active) iconify-icon {
        opacity: 1;
    }

    .filter-tabs-item.active {
        background: var(--primary);
        color: white;
        border-color: var(--primary);
    }

    .filter-tabs-item.active iconify-icon {
        opacity: 1;
    }

    .filter-tabs-count {
        opacity: 0.6;
        font-size: 0.8rem;
    }

    @media (max-width: 768px) {
        .filter-tabs {
            gap: 0.375rem;
        }

        .filter-tabs-item {
            padding: 0.4rem 0.8rem;
            font-size: 0.8rem;
        }

        .filter-tabs-count {
            display: none;
        }
    }
</style>
```
---

### 创建组件导出

**文件路径**：`src/components/atoms/index.ts`

```ts
export { default as FilterTabs } from "./FilterTabs.astro";
```

---

### 创建日记页面

**文件路径**：`src/pages/diary.astro`

```astro
---
import { FilterTabs } from "../components/atoms";
import { MomentCard } from "@components/features/diary";
import MainGridLayout from "@layouts/MainGridLayout.astro";
import { Icon } from "astro-icon/components";

import { siteConfig } from "../config";
import { getAllTags, getDiaryList } from "../data/diary";
import I18nKey from "../i18n/i18nKey";
import { i18n } from "../i18n/translation";

// 页面开关检查
if (!siteConfig.pages.diary) {
    return Astro.redirect("/404/");
}

const moments = getDiaryList();
const allTags = getAllTags();

// 构建筛选标签
const filterTabs = [
    {
        value: "all",
        label: i18n(I18nKey.albumsFilterAll),
        icon: "material-symbols:apps",
        count: moments.length,
    },
    ...allTags.map((tag) => ({
        value: tag,
        label: tag,
        count: moments.filter((m) => m.tags && m.tags.includes(tag)).length,
    })),
];

// 国际化文本
const minutesAgo = i18n(I18nKey.diaryMinutesAgo);
const hoursAgo = i18n(I18nKey.diaryHoursAgo);
const daysAgo = i18n(I18nKey.diaryDaysAgo);

const title = i18n(I18nKey.diary);
const subtitle = i18n(I18nKey.diarySubtitle);
---

<MainGridLayout title={title} description={subtitle}>
    <script is:inline src="/js/filter-tabs-handler.js"></script>

    <div class="flex w-full rounded-[var(--radius-large)] overflow-hidden relative min-h-32">
        <div class="card-base z-10 relative w-full overflow-hidden">
            <!-- 渐变横幅 -->
            <div class="px-6 sm:px-9 py-6">
                <div class="rounded-xl bg-gradient-to-r from-[var(--primary)] to-[var(--primary-dark,var(--primary))] p-5 sm:p-6">
                    <div class="flex items-center justify-between gap-4">
                        <div class="min-w-0">
                            <h1 class="text-2xl sm:text-3xl font-bold text-white mb-1 drop-shadow-sm truncate">
                                {title}
                            </h1>
                            <p class="text-sm sm:text-base text-white/80 truncate">
                                {subtitle}
                            </p>
                        </div>
                        <div class="shrink-0 text-center">
                            <span class="block text-2xl sm:text-3xl font-bold text-white drop-shadow-sm">
                                {moments.length}
                            </span>
                            <span class="block text-xs sm:text-sm text-white/70">
                                {i18n(I18nKey.diaryCount)}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 内容区域 -->
            <div class="px-6 sm:px-9 pt-2 pb-6">
                <!-- 筛选标签 -->
                {
                    moments.length > 0 && allTags.length > 0 && (
                        <div class="mb-8">
                            <FilterTabs tabs={filterTabs} dataAttr="tags" />
                        </div>
                    )
                }

                <!-- 日记列表 -->
                <div id="diary-list" class="space-y-4">
                    {
                        moments.map((moment, index) => (
                            <MomentCard
                                moment={moment}
                                index={index}
                                minutesAgo={minutesAgo}
                                hoursAgo={hoursAgo}
                                daysAgo={daysAgo}
                            />
                        ))
                    }
                </div>

                <!-- 无结果提示 -->
                <div id="no-results" class="hidden text-center py-16">
                    <Icon
                        name="material-symbols:edit-note"
                        class="text-6xl text-black/15 dark:text-white/15 mb-4"
                    />
                    <p class="text-black/40 dark:text-white/40 text-lg">
                        {i18n(I18nKey.diaryNoResults)}
                    </p>
                </div>

                <!-- 空状态提示 -->
                {
                    moments.length === 0 && (
                        <div class="text-center py-16">
                            <Icon
                                name="material-symbols:edit-note"
                                class="text-6xl text-black/15 dark:text-white/15 mb-4"
                            />
                            <h3 class="text-lg font-medium text-black/90 dark:text-white/90 mb-2">
                                {i18n(I18nKey.diaryNoResults)}
                            </h3>
                        </div>
                    )
                }

                <!-- 底部提示 -->
                <div class="text-center mt-8 text-black/50 dark:text-white/50 text-sm italic">
                    {i18n(I18nKey.diaryTips)}
                </div>
            </div>
        </div>
    </div>
</MainGridLayout>
```

---

### 更新类型定义

**文件路径**：`src/types/config.ts`

#### 5.1 在 `SiteConfig` 类型的 `pages` 中添加日记开关

```ts
// 页面开关配置
pages: {
    friends: boolean;
    sponsor: boolean;
    guestbook: boolean;
    bangumi: boolean;
    gallery: boolean;
    devices: boolean;
    diary?: boolean;  // ✨ 新增日记页面开关
};
```

#### 5.2 在 `SiteConfig` 类型中添加日记配置

```ts
// 页面开关配置
	pages: {
		diary?: boolean; // 日记页面开关
	};
	// 日记页面配置
	diary?: {
		// 默认头像
		defaultAvatar?: string;
	};

```

---

### 更新站点配置

**文件路径**：`src/config/siteConfig.ts`

```ts
// 页面开关配置
pages: {
    // ... 其他配置
    diary: true,  // ✨ 新增 - 开启日记页面
},

// 日记页面配置 ✨ 新增
diary: {
    // 默认头像
    defaultAvatar: "https://i.postimg.cc/7YLVJqnp/wei-xin-tu-pian-2026-05-07-020150-883.jpg",
},
```

---

### 更新导航栏配置

**文件路径**：`src/config/navBarConfig.ts`

在"更多"子菜单中添加日记链接：

```ts
// 关于及其子菜单
links.push({
    name: "更多",
    url: "/content/",
    icon: "material-symbols:info",
    children: [
        // ... 其他子菜单项

        // ✨ 新增：根据配置决定是否添加日记
        ...(siteConfig.pages.diary ? [LinkPreset.Diary] : []),

        // 关于页面
        LinkPreset.About,
    ],
});
```

---

### 更新链接预设

**文件路径**：`src/constants/link-presets.ts`

在 `LinkPreset` 枚举中添加 `Diary`：

```ts
export enum LinkPreset {
    Home = 0,
    Archive = 1,
    About = 2,
    Friends = 3,
    Sponsor = 4,
    Guestbook = 5,
    Bangumi = 6,
    Gallery = 7,
    Devices = 8,
    Diary = 9,  // ✨ 新增
}
```

在 `LinkPresets` 对象中添加配置：

```ts
[LinkPreset.Diary]: {
    name: i18n(I18nKey.diary),
    url: "/diary/",
    icon: "material-symbols:book",
},
```

---

### 添加国际化翻译

#### 9.1 添加翻译键

**文件路径**：`src/i18n/i18nKey.ts`

```ts
export enum I18nKey {
    // ... 其他键

    // ✨ 日记页面
    albumsFilterAll = "albumsFilterAll",
    diary = "diary",
    diarySubtitle = "diarySubtitle",
    diaryCount = "diaryCount",
    diaryMinutesAgo = "diaryMinutesAgo",
    diaryHoursAgo = "diaryHoursAgo",
    diaryDaysAgo = "diaryDaysAgo",
    diaryNoResults = "diaryNoResults",
    diaryTips = "diaryTips",
}
```

#### 9.2 添加英文翻译

**文件路径**：`src/i18n/languages/en.ts`

```ts
[Key.albumsFilterAll]: "All",
[Key.diary]: "Diary",
[Key.diarySubtitle]: "Recording daily moments",
[Key.diaryCount]: "Moments",
[Key.diaryMinutesAgo]: "m",
[Key.diaryHoursAgo]: "h",
[Key.diaryDaysAgo]: "d",
[Key.diaryNoResults]: "No moments yet",
[Key.diaryTips]: "Every moment is precious",
```

#### 9.3 添加中文翻译

**文件路径**：`src/i18n/languages/zh_CN.ts`

```ts
[Key.albumsFilterAll]: "全部",
[Key.diary]: "日记",
[Key.diarySubtitle]: "记录生活点滴",
[Key.diaryCount]: "条动态",
[Key.diaryMinutesAgo]: "分钟前",
[Key.diaryHoursAgo]: "小时前",
[Key.diaryDaysAgo]: "天前",
[Key.diaryNoResults]: "暂无动态",
[Key.diaryTips]: "每一个瞬间都值得珍藏",
```

#### 9.4 添加其他语言翻译

根据需要，在以下文件中添加翻译：
- `src/i18n/languages/zh_TW.ts`（繁体中文）
- `src/i18n/languages/ja.ts`（日文）
- `src/i18n/languages/ru.ts`（俄文）

---

### 修复时间格式化工具

**文件路径**：`src/utils/timeFormat.ts`

确保使用正确的时区属性名：

```ts
// 确保使用 siteConfig.timezone 而不是 siteConfig.timeZone
const timezone = siteConfig.timezone;
	if (timezone) {
		const match = timezone.match(/([+-]\d{2}):?(\d{2})?$/);
		if (match) {
			timeGap = parseInt(match[1], 10);
		} else if (timezone === "Asia/Shanghai") {
			timeGap = 8;
		} else if (timezone === "UTC") {
			timeGap = 0;
	}
```

---

## 🔧 配置选项说明

### 日记数据结构 (DiaryItem)

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | number | ✅ | 唯一标识符 |
| `content` | string | ✅ | 日记内容，支持 `\n` 换行 |
| `date` | string | ✅ | ISO 8601 格式日期 |
| `images` | string[] | ❌ | 图片URL数组 |
| `location` | string | ❌ | 位置名称 |
| `locationUrl` | string | ❌ | 位置链接（百度地图等） |
| `mood` | string | ❌ | 心情表情 |
| `tags` | string[] | ❌ | 标签数组 |
| `avatar` | string | ❌ | 头像URL（默认使用全局配置） |

### 站点配置 (siteConfig)

```ts
diary: {
    defaultAvatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Hyde",
}
```

| 配置项 | 类型 | 说明 |
|--------|------|------|
| `defaultAvatar` | string | 默认头像URL |

---

## 📱 响应式布局

日记页面图片网格响应式规则：

| 图片数量 | 布局 | 说明 |
|---------|------|------|
| 1张 | 单列大图 | 最大宽度 400-500px |
| 2张 | 双列 | 平均分配，最大宽度 500-560px |
| 3张 | 1大+2小 | 第一张占两行高，最大宽度 500-560px |
| 4+张 | 3×3网格 | 固定三列，最大宽度 600-700px |

---

## 🎨 样式定制

### 自定义头像大小

在 `MomentCard.astro` 中`新增`：

```css
.bg-gray-100 {
    /* 默认头像大小40px */
    width: 40px; 
    height: 40px;
	}
```

### 自定义头像形状
**文件路径**：`src/components/features/diary/MomentCard.astro`修改其 class 属性：

```html
<!-- 头像 -->
<div class="flex-shrink-0">
    <img
        src={avatarUrl}
        alt="avatar"
        class="w-10 h-10 rounded-lg object-cover bg-gray-100 dark:bg-gray-800"
    />
</div>
```

- 圆形：`rounded-full`
- 圆角方形：`rounded-lg`（当前使用）
- 方形：`rounded-none`

### 修改图片网格列数

在 `MomentCard.astro` 的 `<style>` 中修改：

```css
.diary-images-grid {
    grid-template-columns: repeat(3, 1fr);  /* 修改3数字即可 */
}
```

---

## 🚀 构建和部署

### 开发环境预览

```bash
npm run dev
# 访问 http://localhost:4321/diary/
```

### 生产构建

```bash
pnpm build
# 输出到 dist/ 目录
```

---

## ❓ 常见问题

### 1. 构建时报错 "loadIconify is not exported"

**解决方案**：移除 `diary.astro` 中不必要的 `loadIconify` 导入。

### 2. 页面显示 404

**解决方案**：检查 `siteConfig.pages.diary` 是否设置为 `true`。

### 3. 图片无法加载

**解决方案**：
- 检查图片 URL 是否可访问
- 如果是小红书等防盗链图片，建议下载到本地或使用图床
- 可以在 `siteConfig.imageOptimization.noReferrerDomains` 中添加域名

### 4. 时间显示不正确

**解决方案**：
- 检查 `siteConfig.timezone` 配置
- 确认日期格式为 ISO 8601（如 `2026-05-01T10:30:00Z`）

---

## 📚 相关资源

- [Astro 文档](https://docs.astro.build/)
- [Tailwind CSS 文档](https://tailwindcss.com/)
- [DiceBear 头像生成器](https://www.dicebear.com/)

---

*文档版本：1.0*
*最后更新：2026-05-07*
