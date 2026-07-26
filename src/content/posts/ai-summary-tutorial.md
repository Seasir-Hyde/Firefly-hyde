---
title: AI 摘要实现
published: 2026-07-27
pinned: false

image: api
slug: /ai-summary-tutorial
tags: ["Firefly"]
category: Firefly
draft: false
description: "最近给博客折腾了个 AI 摘要功能，效果挺有意思。今天就把我在 Firefly 项目里摸爬滚打总结的实战经验全盘托出。从挑大模型、写构建脚本到搞定打字机动画，顺便分享几个我踩过的坑，希望能帮想给博客加 AI 元素的你少走点弯路。"
descriptionSource: ai
---
AI 摘要提前在构建阶段生成并存入文章元数据，前端页面读取后带动画展示，页面访问无需实时调用 AI，无额外接口开销。

## 架构概览

Firefly 博客的 AI 摘要功能分为两部分：

```
┌─────────────────────────────────────────────────────┐
│                   构建时 (Build Time)                │
│                                                     │
│  scripts/fill-descriptions/index.ts                 │
│  ├── 扫描 src/content/posts/ 下所有 .md/.mdx         │
│  ├── 跳过已有 description 的文章                      │
│  ├── 调用千问 API 生成摘要                            │
│  └── 写回 frontmatter (description + descriptionSource) │
└─────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────┐
│                   运行时 (Runtime)                   │
│                                                     │
│  src/components/widget/AiSummary.astro              │
│  ├── 读取 description 和 descriptionSource           │
│  ├── IntersectionObserver 监听滚动进入视口            │
│  ├── 逐字打字机动画，标点处自动停顿                    │
│  └── astro:page-load 支持 Swup 站内导航              │
└─────────────────────────────────────────────────────┘
```

## 文件目录
| 文件路径 | 作用 |
| ---- | ---- |
| `src/components/widget/AiSummary.astro` | 摘要卡片 + 打字机动画 |
| `src/pages/posts/[...slug].astro` | 文章页条件渲染摘要组件 |
| `src/content.config.ts` | `description` / `descriptionSource` 字段校验 |
| `scripts/fill-descriptions/index.ts` | 千问 API 批量补全缺失摘要 |
| `.env` | 存放 `QWEN_API_KEY`（`勿提交 Git`） |

---

## 配置 API 密钥

在项目根目录创建 `.env` 文件：

```env
# 千问 API 配置
QWEN_API_KEY=你的API密钥
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen-plus
```
> [!warning] 注意
> 📌 将 `.env` 添加到 `.gitignore`，避免泄露密钥！

密钥在 [阿里云 DashScope 控制台](https://dashscope.console.aliyun.com/) 申请。脚本通过 `import.meta.url` 定位项目根目录并读取 `.env` 文件（兼容 Windows `\r\n` 换行），也可临时用环境变量：

```shell
QWEN_API_KEY=sk-xxx pnpm fill-descriptions
```

可选环境变量：

| 变量 | 默认值 | 说明 |
| ---- | ---- | ---- |
| `QWEN_API_KEY` | （必填） | 千问 API 密钥 |
| `QWEN_MODEL` | `qwen-plus` | 文本模型；**不要用** `qwen-math-turbo` 等数学/代码模型 |
| `QWEN_BASE_URL` | DashScope 兼容端点 | 使用自定义 MaaS 端点时再改 |

## 构建时脚本详解

脚本路径：`scripts/fill-descriptions/index.ts`

### 核心配置

```typescript
const QWEN_BASE_URL = process.env.QWEN_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1";
const QWEN_MODEL = process.env.QWEN_MODEL || "qwen-plus";
const QWEN_API_KEY = process.env.QWEN_API_KEY || "";
const POSTS_DIR = path.join(PROJECT_ROOT, "src/content/posts");
```

### 脚本做了什么
- 递归扫描 src/content/posts/ 下所有 .md / .mdx
- 仅在 frontmatter 区块检测是否存在 description，不会误判正文代码块内的示例 `description:`
- 提取文章标题 + 正文前2600字作为生成上下文
- 调用千问 API，使用优化提示词自动生成文章摘要
- 校验摘要输出质量（长度校验、过滤**等无效内容），不合格自动重试生成
- 重写文件 frontmatter，写入 `description` 与 `descriptionSource: ai`
- 仅修改 frontmatter 区域，文章正文内容完全不改动


### 扫描与过滤

```typescript
/**
 * 判断文章是否已有 description（只检查 frontmatter 区块内，且值不能为空）
 */
function hasDescription(raw: string): boolean {
  const parsed = parseFrontmatter(raw);
  if (!parsed) return false;
  
  const descMatch = parsed.frontmatter.match(/^description\s*:\s*(.+)$/m);
  if (!descMatch) return false;
  
  let value = descMatch[1].trim();
  // 去掉引号
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  
  return value.length > 0;
}
```
> [!warning] 注意
> ⚠️ **新手陷阱**：若用整篇文件匹配 `description:`，在正文里展示 frontmatter 示例的文章会被误判为"已有描述"。务必限定在 frontmatter 区块内检测！

### 上下文提取

```typescript
function extractContext(body: string, maxChars: number): string {
  const cleaned = body
    .replace(/^---[\s\S]*?---\n?/, "")           // 去掉 frontmatter
    .replace(/#{1,6}\s+/g, "")                   // 去掉标题标记
    .replace(/```[\s\S]*?```/g, "[代码块]")       // 代码块替换
    .replace(/`[^`]+`/g, "[代码]")               // 行内代码替换
    .replace(/!\[.*?\]\(.*?\)/g, "")             // 去掉图片
    .replace(/\[([^\]]*)\]\(.*?\)/g, "$1")       // 保留链接文字
    .replace(/\n{3,}/g, "\n\n")                  // 压缩空行
    .trim();

  return cleaned.length > maxChars
    ? `${cleaned.slice(0, maxChars)}...`
    : cleaned;
}
```

### 提示词设计

```typescript
const SYSTEM_PROMPT = `你是一个以第一视角写作的个人博客作者。你的博客记录技术学习、日常生活和真实感悟。

你的任务是：读完一篇博客文章后，为它写一段友好、自然、像博客导语一样的"文章摘要"。

核心规则：
1. 输出只要一段摘要文字，不要标题、不要列表、不要"本文""这篇文章""总之"之类的套话。
2. 表达要自然、口语化，像一个真实的博主在跟读者打招呼或做开场铺垫，有一点"人味"。
3. 不要堆砌概念、不要写得像说明书或提纲总结。
4. 贴近原文真实内容，保留原作者的情绪和语气。
5. 技术文章保持清晰但不要生硬，生活/感悟类文章语气柔和一些。
6. 字数控制在 60～120 字左右，越短、越准越好，不要啰嗦。
7. 纯正文内容输出（不带任何前缀或说明）。`;
```

### API 调用与重试

```typescript
const resp = await fetch(`${QWEN_BASE_URL}/chat/completions`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${QWEN_API_KEY}`,
  },
  body: JSON.stringify({
    model: QWEN_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMsg },
    ],
    temperature: 0.75,
    max_tokens: 256,
  }),
});
```

### 运行脚本

完整脚本获取：[fill-descriptions/index.ts](https://cnb.cool/W3C/Hyde/Firefly-hyde/-/blob/main/fill-descriptions/index.ts)

```bash
pnpm fill-descriptions
```

### 构建前自动补全（可选）

希望每次部署前自动补全新文章摘要，可在 package.json 的 build 前加上脚本：

```bash
{
  "scripts": {
    "build": "pnpm fill-descriptions && node scripts/generate-icons.js && npx tsx scripts/generate-lqips.ts && astro build && pagefind --site dist"
  }
}
```
注意：每次 build 都会扫描并可能调用 API，会消耗额度。文章量大时建议只在本地或 CI 需要时手动跑 `pnpm fill-descriptions`。

## 运行时组件详解

组件路径：`src/components/widget/AiSummary.astro`

完整组件获取：[AiSummary.astro](https://cnb.cool/W3C/Hyde/Firefly-hyde/-/blob/main/src/components/widget/AiSummary.astro)

### Props 定义

```typescript
interface Props {
  description: string;
  descriptionSource?: "manual" | "ai" | string;
}
```

### 模板设计

```astro
<div class="ai-summary-wrapper rounded-xl mb-6">
  <div class="ai-summary">
    <div class="ai-summary-inner">
      <div class="ai-summary-header">
        <div class="ai-summary-icon">
          <Icon name={iconName} class="text-base" />
        </div>
        <span class="ai-summary-label">{sourceLabel}</span>
      </div>
      <p
        class="ai-summary-text js-ai-summary-text"
        data-full-text={description}
      ></p>
    </div>
  </div>
</div>
```
> [!NOTE] 提示
> ⚠️使用 class 而非固定 id，避免 Swup 多页残留冲突；用 `data-typing-init` 防止重复初始化。

### 打字机动画核心

```typescript
(function initAiSummaryTypewriter() {
  function run() {
    const el = document.querySelector(".js-ai-summary-text");
    if (!el || el.dataset.typingInit === "1") return;
    el.dataset.typingInit = "1";

    const fullText = el.getAttribute("data-full-text") || "";

    // 无障碍：减少动态效果
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.textContent = fullText;
      return;
    }

    let hasRun = false;
    const speed = 45;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !hasRun) {
            hasRun = true;
            observer.unobserve(el);
            startTyping(el, fullText, speed);
          }
        }
      },
      { threshold: 0.3 },
    );

    observer.observe(el);
  }

  run();
  document.addEventListener("astro:page-load", run);
})();
```

### 标点停顿设计

| 字符 | 延迟 | 说明 |
|------|------|------|
| 普通字 | 45ms | 基础速度 |
| ，、；: | 90ms（2×） | 短停顿 |
| 。！？… | 135ms（3×） | 长停顿 |

### 文章页集成

在 `src/pages/posts/[...slug].astro` 中添加：
组件获取：[[...slug].astro](https://cnb.cool/W3C/Hyde/Firefly-hyde/-/blob/main/src/pages/posts/%5B...slug%5D.astro)
```astro
import AiSummary from "@/components/widget/AiSummary.astro";

<!-- AI 摘要 - 打字机动画 -->
{
  entry.data.description && (
    <AiSummary
      description={entry.data.description}
      descriptionSource={entry.data.descriptionSource}
    />
  )
}
```

## Content Schema 配置

在 `src/content.config.ts` 中添加：

```typescript {2,7}
type PostData = {
descriptionSource?: "manual" | "ai";
}

const postsCollection: ContentCollection<PostData> = defineCollection({
  schema: z.object({
    descriptionSource: z.enum(["manual", "ai"]).optional(),
  }),
});
```

---

## 优化技巧

| 参数 | 作用 | 推荐值 | 说明 |
|------|------|--------|------|
| `temperature` | 控制随机性 | 0.75 | 略有个性，避免死板 |
| `max_tokens` | 最大输出长度 | 256 | 摘要短，足够 |
| `top_p` | 核采样 | 0.9 | 控制生成多样性 |

### 输入优化

- 去掉无关的格式标记
- 代码块用占位符替代（节省 token）
- 控制输入长度（推荐 2000-3000 字）

---

## 陷阱清单

| 陷阱 | 说明 | 规避方法 |
|------|------|----------|
| **API Key 泄露** | 将密钥硬编码到代码中 | 使用 .env 文件，加入 .gitignore |
| **用整篇文件匹配 description** | 正文代码块里的示例 description 会被误识别为已存在摘要 | 只在 frontmatter 区块内检测字段 |
| **Swup 兼容** | 页面切换后打字机动画无法重新触发，组件失效 | 组件监听 `astro:page-load`，站内切页后打字机仍会正常初始化 |
| **模型选择** | 选用数学、代码专用模型生成文章摘要，输出内容质量差、不符合文案需求 | 默认 `qwen-plus`；数学/代码专用模型不适合写摘要，脚本启动时会给出警告 |
| **教程类文章** | 教程正文代码块中存在 `description:` 示例文本，旧脚本会误判文章已有摘要，跳过生成 | 当前版本仅在 frontmatter 区域检测字段，不受正文代码示例干扰，可正常补全摘要 |
| **请求无间隔** | 循环批量调用千问API，请求频率过高触发平台限流，脚本中断报错 | 添加 600ms 以上的请求间隔 |
| **输入内容过长** | 全文无限制传入API，消耗大量token，同时超长文本会降低AI摘要精准度 | 正文内容截断到 2000-3000 字后再传入模型 |
| **忽略编码问题** | Windows系统读写md文件时默认编码非UTF-8，中文摘要出现乱码 | 读写文件时强制指定 UTF-8 编码 |
| **未校验输出** | AI返回空内容、仅符号、无意义文本等无效摘要，直接写入文件 | 使用 sanitizeDescription 函数校验、清洗AI输出内容 |
| **提示词过于复杂** | 提示词冗余、逻辑混乱，AI无法准确理解摘要生成要求，产出效果差 | 提示词清晰简洁，分点明确告知AI生成规则与要求 |
| **使用固定 id** | 多页面共用相同DOM id，Swup页面缓存残留，打字机组件渲染冲突 | 使用 class 选择器替代固定id |
| **空字符串误判** | frontmatter 内 `description: ""` 空字符串被判定为已有摘要，跳过自动补全 | 使用 hasDescription 函数精准判断字段是否存在有效文本 |

## 快速检查清单
- [ ] `AiSummary.astro` 组件文件已创建
- [ ] `[...slug].astro` 文章页面已引入摘要组件
- [ ] `content/content.config.ts` 配置文件包含 descriptionSource 字段校验
- [ ] `.env` 环境变量文件已配置 `QWEN_API_KEY`
- [ ] 执行过命令 `pnpm fill-descriptions` 批量生成摘要，或手动填写过 description
- [ ] 本地启动 `pnpm dev`，打开带有摘要的文章页面，滚动至摘要区域，验证打字机动画正常展示
