/**
 * AI 摘要生成脚本
 * 运行方式: pnpm fill-descriptions
 * 等价于: npx tsx scripts/fill-descriptions/index.ts
 *
 * 功能：
 * - 扫描 src/content/posts/ 下所有 .md/.mdx 文件
 * - 跳过已有 description 的文章
 * - 调用千问 API 生成摘要
 * - 写回 frontmatter (description + descriptionSource)
 */

import { fileURLToPath } from "node:url";
import fs from "fs";
import path from "path";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function loadEnvFile() {
  const envPath = path.join(PROJECT_ROOT, ".env");
  // 按 \r?\n 分割，兼容 Windows；.env 中的值覆盖空环境变量
  for (const line of fs.readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIdx = trimmed.indexOf("=");
    if (equalsIdx === -1) continue;

    const key = trimmed.slice(0, equalsIdx).trim();
    let val = trimmed.slice(equalsIdx + 1).trim();

    // 去除引号
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }

    if (val) process.env[key] = val;
  }
}

loadEnvFile();

const QWEN_BASE_URL =
  process.env.QWEN_BASE_URL ||
  "https://dashscope.aliyuncs.com/compatible-mode/v1";
const QWEN_MODEL = process.env.QWEN_MODEL || "qwen-plus";
const QWEN_API_KEY = process.env.QWEN_API_KEY || "";

const POSTS_DIR = path.join(PROJECT_ROOT, "src/content/posts");

// 每篇文章最多取前 2600 字作为上下文
const MAX_CONTEXT_CHARS = 2600;

// API 失败最多重试 2 次
const MAX_RETRIES = 2;

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
 * 解析 frontmatter（只返回 frontmatter 内容和正文）
 */
function parseFrontmatter(raw: string): { frontmatter: string; body: string } | null {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n[\s\S]*)$/);
  if (!match) return null;
  return { frontmatter: match[1], body: match[2] };
}

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

/**
 * 校验并清洗 AI 返回的摘要文本
 * 过滤无效输出，避免假成功
 */
function sanitizeDescription(text: string): string | null {
  const cleaned = text
    .replace(/^(摘要|简介|…).{0,8}[：:]\s*/i, "")
    .replace(/\*\*/g, "")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length < 15) return null;
  if (/^[\*\-_=.\s，。！？、]+$/.test(cleaned)) return null;
  return cleaned;
}

/**
 * 格式化 YAML 字符串（安全的单行格式）
 */
function formatYamlString(value: string): string {
  const oneLine = value.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
  return JSON.stringify(oneLine);
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
        const errorText = await resp.text();
        console.error(`  API 请求失败 (状态码: ${resp.status}): ${errorText.substring(0, 200)}`);
        if (attempt < MAX_RETRIES) {
          console.log(`  重试中... (${attempt + 1}/${MAX_RETRIES})`);
          await sleep(1500 * (attempt + 1));
          continue;
        }
        return null;
      }

      const json = (await resp.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
      };
      
      if (json.error) {
        console.error(`  API 返回错误: ${json.error.message}`);
        if (attempt < MAX_RETRIES) {
          console.log(`  重试中... (${attempt + 1}/${MAX_RETRIES})`);
          await sleep(1500 * (attempt + 1));
          continue;
        }
        return null;
      }
      
      const text = json?.choices?.[0]?.message?.content?.trim() ?? "";

      if (!text) {
        console.log(`  API 返回空内容，重试中... (${attempt + 1}/${MAX_RETRIES})`);
        if (attempt < MAX_RETRIES) {
          await sleep(1500 * (attempt + 1));
          continue;
        }
        return null;
      }

      // 使用 sanitizeDescription 校验并清洗输出
      const cleaned = sanitizeDescription(text);
      if (!cleaned) {
        console.log(`  内容校验失败（可能太短或无效），重试中... (${attempt + 1}/${MAX_RETRIES})`);
        if (attempt < MAX_RETRIES) {
          await sleep(1500 * (attempt + 1));
          continue;
        }
        return null;
      }

      return cleaned;
    } catch (err: any) {
      console.error(`  请求异常: ${err.message}`);
      if (attempt < MAX_RETRIES) {
        console.log(`  重试中... (${attempt + 1}/${MAX_RETRIES})`);
        await sleep(1500 * (attempt + 1));
        continue;
      }
      return null;
    }
  }
  return null;
}

/**
 * 写回 frontmatter（重建方式，更安全）
 */
function writeFrontmatter(
  filePath: string,
  raw: string,
  description: string,
  source: "ai" | "manual"
): void {
  const parsed = parseFrontmatter(raw);
  if (!parsed) return;

  // 去掉旧的 description 和 descriptionSource 字段
  const frontmatter = parsed.frontmatter
    .replace(/^description\s*:.*$/m, "")
    .replace(/^descriptionSource\s*:.*$/m, "")
    .trimEnd();

  // 重组文件内容
  const newContent = [
    "---",
    frontmatter,
    `description: ${formatYamlString(description)}`,
    `descriptionSource: ${source}`,
    "---",
    parsed.body.replace(/^\r?\n?/, "\n"),
  ].join("\n");

  fs.writeFileSync(filePath, newContent, "utf-8");
}

/**
 * 主流程
 */
async function main() {
  if (!QWEN_API_KEY) {
    console.error("请设置环境变量 QWEN_API_KEY");
    process.exit(1);
  }

  console.log(`扫描目录: ${POSTS_DIR}`);

  const mdFiles = collectMarkdownFiles(POSTS_DIR);
  console.log(`共找到 ${mdFiles.length} 个文件`);

  const missing: MissingItem[] = [];
  let skipped = 0;

  for (const filePath of mdFiles) {
    const raw = fs.readFileSync(filePath, "utf-8");
    // 只检查 frontmatter 区块内是否有 description
    if (hasDescription(raw)) {
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