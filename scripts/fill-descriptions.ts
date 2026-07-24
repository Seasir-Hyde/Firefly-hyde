/**
 * AI 摘要生成脚本
 * 运行方式: npx tsx scripts/fill-descriptions.ts
 *
 * 功能：
 * - 扫描 src/content/blog/ 下所有 .md/.mdx 文件
 * - 跳过已有 description 的文章
 * - 调用千问 API 生成摘要
 * - 写回 frontmatter (description + descriptionSource)
 */

// 千问 API 配置（DashScope 兼容 OpenAI 格式）
const QWEN_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const QWEN_MODEL = "qwen-plus";

// API 密钥 - 直接写在脚本里，文件已加入 .gitignore
const QWEN_API_KEY = process.env.QWEN_API_KEY;
if (!QWEN_API_KEY) {
  console.error("请设置环境变量 QWEN_API_KEY");
  process.exit(1);
}

// 每篇文章最多取前 2600 字作为上下文
const MAX_CONTEXT_CHARS = 2600;

// API 失败最多重试 2 次
const MAX_RETRIES = 2;

// 内容目录
const CONTENT_DIR = "src/content/blog";

import fs from "fs";
import path from "path";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface MissingItem {
  filePath: string;
  title: string;
  raw: string;
}

/**
 * 收集所有 markdown 文件
 */
function collectMarkdownFiles(dir: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(fullPath));
    } else if (entry.isFile() && /\.(md|mdx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * 解析 frontmatter
 */
function parseFrontmatter(content: string): { data: Record<string, unknown>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { data: {}, body: content };
  }

  const yamlStr = match[1];
  const body = match[2];
  const data: Record<string, unknown> = {};

  // 简单的 YAML 解析
  for (const line of yamlStr.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    let value: unknown = line.slice(colonIdx + 1).trim();

    // 去除引号
    if ((value as string).startsWith('"') && (value as string).endsWith('"')) {
      value = (value as string).slice(1, -1);
    } else if ((value as string).startsWith("'") && (value as string).endsWith("'")) {
      value = (value as string).slice(1, -1);
    }

    data[key] = value;
  }

  return { data, body };
}

/**
 * 从正文中提取纯文本上下文
 */
function extractContext(body: string, maxChars: number): string {
  const cleaned = body
    .replace(/^---[\s\S]*?---\n?/, "") // 去掉 frontmatter
    .replace(/#{1,6}\s+/g, "") // 去掉标题标记
    .replace(/```[\s\S]*?```/g, "[代码块]") // 代码块替换为占位符
    .replace(/`[^`]+`/g, "[代码]") // 行内代码替换
    .replace(/!\[.*?\]\(.*?\)/g, "") // 去掉图片
    .replace(/\[([^\]]*)\]\(.*?\)/g, "$1") // 保留链接文字，去掉 URL
    .replace(/\n{3,}/g, "\n\n") // 压缩多余空行
    .trim();

  return cleaned.length > maxChars
    ? `${cleaned.slice(0, maxChars)}...`
    : cleaned;
}

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

/**
 * 调用 API 生成摘要
 */
async function generateDescription(
  title: string,
  content: string
): Promise<string | null> {
  const context = extractContext(content, MAX_CONTEXT_CHARS);
  const userMsg = `文章标题：${title}\n\n文章内容（节选）：\n${context}`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
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

      if (!resp.ok) {
        if (attempt < MAX_RETRIES) {
          await sleep(1500 * (attempt + 1));
          continue;
        }
        return null;
      }

      const json = (await resp.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = json?.choices?.[0]?.message?.content?.trim() ?? "";

      // 清理 AI 可能加上的前缀
      const cleaned = text
        .replace(
          /^(摘要|简介|内容简介|文章摘要|本文|这篇文章|总的来说|总之|概括).{0,8}[：:]\s*/i,
          ""
        )
        .replace(/\s*---\s*$/, "")
        .trim();

      return cleaned || null;
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      return null;
    }
  }
  return null;
}

/**
 * 写回 frontmatter
 */
function writeFrontmatter(
  filePath: string,
  raw: string,
  description: string,
  source: "ai" | "manual"
): void {
  let fm = raw;

  // 检查 description 是否为空或不存在
  const descMatch = fm.match(/^description\s*:\s*(.*)$/m);
  const descValue = descMatch ? descMatch[1].trim() : "";
  const hasRealDesc = descValue !== "" && descValue !== '""' && descValue !== "''";

  if (!hasRealDesc) {
    const safeDesc = `"${description.replace(/"/g, '\\"')}"`;

    if (descMatch) {
      // description 存在但为空，替换整行
      fm = fm.replace(/^description\s*:\s*.*$/m, `description: ${safeDesc}`);
    } else {
      // description 不存在，在 frontmatter 结束标记前插入
      const closingIdx = fm.indexOf("---", 4);
      const beforeClose = fm.slice(0, closingIdx);
      const afterClose = fm.slice(closingIdx);
      fm = `${beforeClose.trimEnd()}\ndescription: ${safeDesc}\n\n${afterClose.trimStart()}`;
    }
  }

  // 处理 descriptionSource 字段
  const hasSource = /^descriptionSource\s*:\s*/m.test(fm);
  if (!hasSource) {
    const closingIdx = fm.indexOf("---", 4);
    const beforeClose = fm.slice(0, closingIdx);
    const afterClose = fm.slice(closingIdx);
    fm = `${beforeClose.trimEnd()}\ndescriptionSource: ${source}\n\n${afterClose.trimStart()}`;
  }

  fs.writeFileSync(filePath, fm, "utf-8");
}

/**
 * 主流程
 */
async function main() {
  const contentDir = path.resolve(CONTENT_DIR);
  console.log(`扫描目录: ${contentDir}`);

  const mdFiles = collectMarkdownFiles(contentDir);
  console.log(`共找到 ${mdFiles.length} 个文件`);

  const missing: MissingItem[] = [];
  let skipped = 0;

  for (const filePath of mdFiles) {
    const raw = fs.readFileSync(filePath, "utf-8");
    // 检查 description 是否为空或不存在
    const descMatch = raw.match(/^description\s*:\s*(.*)$/m);
    // 严格检查：如果值为空字符串（有无引号都要检查）
    const descValue = descMatch ? descMatch[1].trim() : "";
    const hasRealDesc = descValue !== "" && descValue !== '""' && descValue !== "''";
    if (hasRealDesc) {
      skipped++;
      continue;
    }
    // 提取标题
    const titleMatch = raw.match(/^title\s*:\s*(.*)$/m);
    const title = titleMatch
      ? titleMatch[1].replace(/^["']|["']$/g, "").trim()
      : path.basename(filePath, path.extname(filePath));
    missing.push({ filePath, title, raw });
  }

  console.log(`已有 description: ${skipped}`);
  console.log(`需要生成: ${missing.length}`);

  if (missing.length === 0) {
    console.log("没有需要生成摘要的文章");
    return;
  }

  let success = 0;
  let failed = 0;

  for (const item of missing) {
    console.log(`\n处理: ${item.title}`);
    const desc = await generateDescription(item.title, item.raw);
    if (!desc) {
      console.log(`  生成失败`);
      failed++;
      continue;
    }

    // 重新读取文件最新内容再写入
    const latestRaw = fs.readFileSync(item.filePath, "utf-8");
    writeFrontmatter(item.filePath, latestRaw, desc, "ai");
    console.log(`  生成成功: ${desc.slice(0, 50)}...`);
    success++;

    await sleep(600); // 每次请求间隔 600ms，避免限流
  }

  console.log(`\n完成! 成功: ${success}, 失败: ${failed}`);
}

main().catch(console.error);
