// (边缘函数之 Supabase + friends 完整版：友链CRUD+审核+搜索+三主题+钉钉/飞书消息推送)
// 必填环境变量（控制台配置，无硬编码密钥）
// SUPABASE_URL
// SUPABASE_KEY
// ADMIN_USER
// ADMIN_PASS
// PUSH_SWITCH      on / off 推送总开关
// PUSH_PLATFORM    推送平台名称 (dingtalk/feishu)
// PUSH_TOKEN        平台webhook/token/密钥
// PUSH_KEYWORD      钉钉关键词（如果机器人配置了关键词校验）
// PUSH_SECRET       钉钉加签密钥（SEC开头，如果机器人配置了签名校验）
// === 1. 全局配置 ===
const API_PREFIX = "/api";
const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_KEY;
const ADMIN_USER = env.ADMIN_USER;
const ADMIN_PASS = env.ADMIN_PASS;
// 推送配置
const PUSH_SWITCH = (env.PUSH_SWITCH || "off").toLowerCase();
const PUSH_PLATFORM = (env.PUSH_PLATFORM || "").toLowerCase();
const PUSH_TOKEN = env.PUSH_TOKEN || "";
const PUSH_KEYWORD = env.PUSH_KEYWORD || "";
const PUSH_SECRET = env.PUSH_SECRET || "";
// 支持的推送平台列表（仅保留钉钉和飞书）
const SUPPORT_PUSH_PLATFORMS = [
  "dingtalk",
  "feishu",
];

// 环境变量校验
if (!SUPABASE_URL || !SUPABASE_KEY || !ADMIN_USER || !ADMIN_PASS) {
  throw new Error(
    "缺少基础环境变量：SUPABASE_URL/SUPABASE_KEY/ADMIN_USER/ADMIN_PASS",
  );
}
// 推送配置校验（开关开启时必须配置平台和token）
if (PUSH_SWITCH === "on") {
  if (!SUPPORT_PUSH_PLATFORMS.includes(PUSH_PLATFORM)) {
    throw new Error(
      `PUSH_PLATFORM 平台不支持，可选：${SUPPORT_PUSH_PLATFORMS.join(",")}`,
    );
  }
  if (!PUSH_TOKEN) {
    throw new Error("推送开关开启时，必须配置 PUSH_TOKEN");
  }
}

const ADMIN_PREFIX = `${API_PREFIX}/admin`;
// === 2. 基础工具函数 ===
function json(data, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=UTF-8",
    "Access-Control-Allow-Origin": "*",
    "X-Powered-By": "W3C",
  });
  for (const [k, v] of Object.entries(extraHeaders)) {
    headers.set(k, v);
  }
  return new Response(JSON.stringify(data, null, 2), { status, headers });
}

// === 2.1 会话令牌工具（替代浏览器原生 Basic 弹窗登录） ===
const SESSION_COOKIE = "hyde_admin_token";
// 令牌签名密钥：基于管理员密码派生，修改密码后旧令牌自动失效
const SESSION_SECRET = `hyde-edge-${ADMIN_PASS}`;
// 登录页 / 登录接口 / 退出接口为公开路径，无需鉴权
const PUBLIC_ADMIN_PATHS = new Set([
  `${ADMIN_PREFIX}/login`,
  `${ADMIN_PREFIX}/logout`,
]);

/**
 * HMAC-SHA256 签名
 * @param {string} data 待签名数据
 * @param {string} secret 签名密钥
 * @returns {Promise<string>} Base64 签名
 */
async function hmacSign(data, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  const bytes = new Uint8Array(sig);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * 创建会话令牌（payload.signature）
 * @param {number} maxAgeSec 有效期（秒）
 * @returns {Promise<string>} 签名令牌
 */
async function createSessionToken(maxAgeSec) {
  const payload = { exp: Date.now() + maxAgeSec * 1000 };
  const payloadStr = btoa(JSON.stringify(payload));
  const sig = await hmacSign(payloadStr, SESSION_SECRET);
  return `${payloadStr}.${sig}`;
}

/**
 * 校验会话令牌有效性（签名 + 过期时间）
 * @param {string} token 待校验令牌
 * @returns {Promise<boolean>} 是否有效
 */
async function verifySessionToken(token) {
  if (!token || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payloadStr, sig] = parts;
  const expectedSig = await hmacSign(payloadStr, SESSION_SECRET);
  // 长度不符直接拒绝
  if (sig.length !== expectedSig.length) return false;
  // 常量时间比较，缓解计时攻击
  let diff = 0;
  for (let i = 0; i < sig.length; i++) {
    diff |= sig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  }
  if (diff !== 0) return false;
  try {
    const payload = JSON.parse(atob(payloadStr));
    if (typeof payload.exp !== "number" || Date.now() > payload.exp)
      return false;
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * 从请求头解析 Cookie
 * @param {Request} request
 * @returns {Record<string, string>}
 */
function parseCookies(request) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const cookies = {};
  cookieHeader.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx < 0) return;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    if (key) cookies[key] = decodeURIComponent(val);
  });
  return cookies;
}

/**
 * 构造写入会话 Cookie 的 Set-Cookie 头值
 * HttpOnly 防 XSS 读取；SameSite=Lax 防基础 CSRF；Secure 仅 HTTPS 下生效
 * @param {string} token 令牌
 * @param {number} maxAgeSec 有效期（秒）
 * @returns {string}
 */
function buildSessionCookie(token, maxAgeSec) {
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/api/admin",
    `Max-Age=${maxAgeSec}`,
    "HttpOnly",
    "SameSite=Lax",
    "Secure",
  ].join("; ");
}

/**
 * 构造清除会话 Cookie 的 Set-Cookie 头值
 * @returns {string}
 */
function buildClearCookie() {
  return [
    `${SESSION_COOKIE}=`,
    "Path=/api/admin",
    "Max-Age=0",
    "HttpOnly",
    "SameSite=Lax",
    "Secure",
  ].join("; ");
}

/**
 * 管理后台鉴权：校验会话令牌
 * - 浏览器页面请求（GET 且接受 HTML）未登录时重定向到登录页
 * - 接口请求未登录时返回 401 JSON，由前端处理跳转
 * @param {Request} request
 * @param {string} pathname
 * @returns {Promise<Response|null>} 未通过则返回响应，通过返回 null
 */
async function checkAdminAuth(request, pathname) {
  if (!pathname.startsWith(ADMIN_PREFIX)) return null;
  if (PUBLIC_ADMIN_PATHS.has(pathname)) return null;
  const cookies = parseCookies(request);
  const token = cookies[SESSION_COOKIE] || "";
  if (await verifySessionToken(token)) return null;
  const accept = request.headers.get("Accept") || "";
  if (request.method === "GET" && accept.includes("text/html")) {
    return Response.redirect(
      new URL("/api/admin/login", request.url).toString(),
      302,
    );
  }
  return json(
    { success: false, code: "UNAUTHORIZED", message: "未登录或会话已过期，请重新登录" },
    401,
  );
}

// === 3.1 钉钉加签工具函数 ===
/**
 * 钉钉机器人加签（HMAC-SHA256）
 * @param {string} secret 加签密钥
 * @returns {Promise<{timestamp: number, sign: string}>} 时间戳和签名
 */
async function dingTalkSign(secret) {
  const timestamp = Date.now();
  const stringToSign = `${timestamp}\n${secret}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(stringToSign);
  const secretBuffer = encoder.encode(secret);
  const key = await crypto.subtle.importKey(
    "raw",
    secretBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, data);
  const bytes = new Uint8Array(signature);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return { timestamp, sign: btoa(binary) };
}

// === 3.2 消息推送核心函数（钉钉/飞书适配）
/**
 * 统一推送入口
 * @param {string} title 推送标题
 * @param {string} content 推送正文内容
 * @returns {Promise<boolean>} 是否推送成功
 */
async function sendPushNotice(title, content) {
  // 推送总开关关闭，直接返回
  if (PUSH_SWITCH !== "on") return false;
  const platform = PUSH_PLATFORM;
  const token = PUSH_TOKEN;
  let pushUrl = "";
  let pushBody = null;
  let pushHeaders = { "Content-Type": "application/json" };

  // 钉钉加签（如果配置了密钥）
  let dingSignResult = null;
  if (platform === "dingtalk" && PUSH_SECRET) {
    dingSignResult = await dingTalkSign(PUSH_SECRET);
  }

  switch (platform) {
    // 钉钉
    case "dingtalk":
      pushUrl = token;
      // 如果配置了加签密钥，添加timestamp和sign参数
      if (dingSignResult) {
        const separator = pushUrl.includes("?") ? "&" : "?";
        pushUrl += `${separator}timestamp=${dingSignResult.timestamp}&sign=${encodeURIComponent(dingSignResult.sign)}`;
      }
      // 如果配置了关键词，在消息开头添加关键词（钉钉关键词校验）
      const dingContent = PUSH_KEYWORD ? `${PUSH_KEYWORD}\n【${title}】\n${content}` : `【${title}】\n${content}`;
      pushBody = {
        msgtype: "text",
        text: { content: dingContent },
      };
      break;
    // 飞书（卡片式消息）
    case "feishu":
      pushUrl = token;
      pushBody = {
        msg_type: "interactive",
        card: {
          header: {
            title: {
              content: title,
              tag: "plain_text",
            },
          },
          elements: [
            {
              tag: "div",
              text: {
                tag: "lark_md",
                content: content.replace(/\n/g, "\n\n"),
              },
            },
            {
              tag: "action",
              actions: [
                {
                  tag: "button",
                  text: {
                    content: "访问后台管理",
                    tag: "lark_md",
                  },
                  url: "https://seasir.top/api/admin",
                  type: "default",
                  value: {},
                },
              ],
            },
          ],
        },
      };
      pushHeaders = { "Content-Type": "application/json" };
      break;
    default:
      console.error("不支持的推送平台");
      return false;
  }

  try {
    const fetchOpt = { method: "POST", headers: pushHeaders };
    if (pushBody !== null) {
      // 钉钉/飞书均使用 JSON 请求体
      fetchOpt.body = JSON.stringify(pushBody);
    }
    const res = await fetch(pushUrl, fetchOpt);
    // 解析响应体，检查钉钉/飞书平台的错误码
    let responseBody = "";
    try {
      responseBody = await res.text();
    } catch (parseErr) {
      console.error("推送响应解析失败：", parseErr);
    }
    // 钉钉/飞书平台返回200但响应体包含错误码
    if (platform === "dingtalk" || platform === "feishu") {
      try {
        const jsonRes = JSON.parse(responseBody);
        // 钉钉错误码：0表示成功，其他表示失败
        if (jsonRes.errcode !== undefined && jsonRes.errcode !== 0) {
          console.error(`推送失败 [${platform}]：errcode=${jsonRes.errcode}, errmsg=${jsonRes.errmsg || jsonRes.message}`);
          return false;
        }
      } catch (e) {
        // 非JSON响应，按HTTP状态判断
      }
    }
    // 按HTTP状态判断
    if (!res.ok) {
      console.error(`推送失败 [${platform}]：status=${res.status}, body=${responseBody}`);
      return false;
    }
    console.log(`推送成功 [${platform}]：${title}`);
    return true;
  } catch (e) {
    console.error("推送请求异常：", e);
    return false;
  }
}

// === 4. Supabase 请求封装 ===
async function fetchApi(path, init = {}) {
  const method = (init?.method || "GET").toUpperCase();
  const url = new URL(path, SUPABASE_URL);
  const headers = new Headers(init?.headers || {});
  headers.set("apikey", SUPABASE_KEY);
  headers.set("Authorization", `Bearer ${SUPABASE_KEY}`);
  if (!headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  if ((method === "GET" || method === "HEAD") && !headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  return fetch(
    new Request(url.toString(), { method, headers, body: init?.body }),
  );
}

async function apiJson(path) {
  const resp = await fetchApi(path);
  if (!resp.ok) return null;
  return resp.json();
}

async function readJson(request) {
  try {
    return { body: await request.json() };
  } catch (_) {
    return { error: json({ success: false, message: "无效 JSON" }, 400) };
  }
}

async function patchFriend(id, patch) {
  const resp = await fetchApi(
    `/rest/v1/friends?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(patch),
    },
  );
  return resp.ok ? null : json({ success: false, message: "更新失败" }, 500);
}

async function fullUpdateFriend(id, data) {
  const weightNum = Number(data.weight);
  const payload = {
    title: data.title,
    desc: data.desc,
    siteUrl: data.siteUrl,
    imgUrl: data.imgUrl || "",
    email: data.email || "",
    message: data.message || "",
    tags: Array.isArray(data.tags) ? data.tags : [],
    status: data.status || "pending",
    weight: Number.isFinite(weightNum) ? weightNum : 0,
    updatedAt: Date.now(),
  };
  const resp = await fetchApi(
    `/rest/v1/friends?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(payload),
    },
  );
  return resp.ok
    ? null
    : json({ success: false, message: "编辑保存失败" }, 500);
}

async function createFriend(data, clientIp = "") {
  const weightNum = Number(data.weight);
  const payload = [
    {
      title: data.title,
      desc: data.desc,
      siteUrl: data.siteUrl,
      imgUrl: data.imgUrl || "",
      email: data.email || "",
      message: data.message || "",
      tags: Array.isArray(data.tags) ? data.tags : [],
      status: data.status || "pending",
      weight: Number.isFinite(weightNum) ? weightNum : 0,
      ip: clientIp,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];
  const resp = await fetchApi(`/rest/v1/friends`, {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(payload),
  });
  return resp.ok
    ? null
    : json({ success: false, message: "已有重复友链，请更换" }, 500);
}

async function deleteFriend(id) {
  const resp = await fetchApi(
    `/rest/v1/friends?id=eq.${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    },
  );
  return resp.ok ? null : json({ success: false, message: "删除失败" }, 500);
}

function mapFriendBase(a) {
  const weightNum = Number(a.weight);
  return {
    title: a.title,
    desc: a.desc,
    siteUrl: a.siteUrl,
    imgUrl: a.imgUrl,
    tags: a.tags || [],
    weight: Number.isFinite(weightNum) ? weightNum : 0,
  };
}

async function readFriends() {
  const rows = await apiJson(
    `/rest/v1/friends?select=title,desc,siteUrl,imgUrl,tags,weight&status=eq.approved&order="weight".desc,createdAt.asc`,
  );
  if (rows === null) return [];
  return (rows || []).map((a) => mapFriendBase(a));
}

async function readAllFriends() {
  const resp = await fetchApi(
    `/rest/v1/friends?select=id,title,desc,"siteUrl","imgUrl",email,message,tags,status,ip,weight,"createdAt","updatedAt"&order="weight".desc,"createdAt".desc`,
  );
  if (!resp.ok) return null;
  const rows = await resp.json();
  return (rows || []).map((a) => ({
    ...mapFriendBase(a),
    id: a.id,
    email: a.email,
    message: a.message,
    status: a.status,
    ip: a.ip,
    weight: typeof a.weight === "number" ? a.weight : Number(a.weight) || 0,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  }));
}

// === 5.1 独立登录页面（替代浏览器原生 Basic 弹窗） ===
function loginHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>管理后台登录 · Hyde 友链审核</title>
<link rel="icon" href="https://seasir.top/favicon/favicon.ico" type="image/x-icon" />
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f6f5fa" />
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#1b1b2a" />
<meta name="color-scheme" content="light dark" />
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
/* 沿用站点品牌色相 270（OKLCH），与 Firefly 主题保持一致，避免 AI 紫色渐变 */
:root {
  --hue: 270;
  --page-bg: oklch(0.96 0.008 var(--hue));
  --card-bg: oklch(1 0 0);
  --card-shadow: 0 16px 48px oklch(0.25 0.02 var(--hue) / 0.12);
  --text-primary: oklch(0.25 0.02 var(--hue));
  --text-secondary: oklch(0.50 0.02 var(--hue));
  --text-muted: oklch(0.60 0.015 var(--hue));
  --border-color: oklch(0.90 0.005 var(--hue));
  --input-bg: oklch(0.97 0.005 var(--hue));
  --input-border: oklch(0.88 0.006 var(--hue));
  --input-focus: oklch(0.58 0.16 var(--hue));
  --focus-ring: oklch(0.58 0.16 var(--hue) / 0.20);
  --primary: oklch(0.55 0.17 var(--hue));
  --primary-hover: oklch(0.49 0.17 var(--hue));
  --error-bg: oklch(0.96 0.03 25);
  --error-text: oklch(0.52 0.20 25);
  --error-border: oklch(0.85 0.06 25);
  --error-ring: oklch(0.52 0.20 25 / 0.18);
  --link: oklch(0.55 0.17 var(--hue));
  --link-hover: oklch(0.49 0.17 var(--hue));
}
html.dark {
  --page-bg: oklch(0.16 0.014 var(--hue));
  --card-bg: oklch(0.23 0.015 var(--hue));
  --card-shadow: 0 16px 48px oklch(0 0 0 / 0.5);
  --text-primary: oklch(0.95 0.005 var(--hue));
  --text-secondary: oklch(0.72 0.015 var(--hue));
  --text-muted: oklch(0.62 0.02 var(--hue));
  --border-color: oklch(0.33 0.015 var(--hue));
  --input-bg: oklch(0.19 0.012 var(--hue));
  --input-border: oklch(0.33 0.015 var(--hue));
  --input-focus: oklch(0.75 0.14 var(--hue));
  --focus-ring: oklch(0.75 0.14 var(--hue) / 0.24);
  --primary: oklch(0.72 0.14 var(--hue));
  --primary-hover: oklch(0.78 0.14 var(--hue));
  --error-bg: oklch(0.30 0.06 25);
  --error-text: oklch(0.82 0.14 25);
  --error-border: oklch(0.40 0.10 25);
  --error-ring: oklch(0.82 0.14 25 / 0.22);
  --link: oklch(0.75 0.14 var(--hue));
  --link-hover: oklch(0.80 0.14 var(--hue));
}
html, body { height: 100%; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif;
  background: var(--page-bg);
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
  transition: background 0.3s var(--ease-standard, ease), color 0.3s ease;
}
.login-card {
  position: relative;
  width: 100%;
  max-width: 420px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 20px;
  box-shadow: var(--card-shadow);
  padding: 40px 36px 32px;
  animation: cardIn 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  transition: background-color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
}
@keyframes cardIn {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
.brand { text-align: center; margin-bottom: 28px; }
.brand h1 { font-size: 22px; font-weight: 700; margin-bottom: 6px; }
.brand p { font-size: 13px; color: var(--text-secondary); }
.form-group { margin-bottom: 18px; }
.form-label {
  display: block; font-size: 13px; font-weight: 600;
  color: var(--text-primary); margin-bottom: 8px;
}
.input-wrap { position: relative; }
.input-icon {
  position: absolute; left: 14px; top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted); pointer-events: none; display: flex;
}
.input-icon svg { width: 18px; height: 18px; }
.form-input {
  width: 100%; height: 46px;
  padding: 0 14px 0 42px;
  border: 1px solid var(--input-border);
  border-radius: 10px;
  background: var(--input-bg);
  color: var(--text-primary);
  font-size: 14px;
  transition: border-color 0.2s, box-shadow 0.2s, background-color 0.3s ease, color 0.3s ease;
  outline: none;
}
.form-input::placeholder { color: var(--text-muted); }
.form-input:focus {
  border-color: var(--input-focus);
  box-shadow: 0 0 0 3px var(--focus-ring);
}
.form-input.has-error {
  border-color: var(--error-text);
  box-shadow: 0 0 0 3px var(--error-ring);
}
.password-toggle {
  position: absolute; right: 12px; top: 50%;
  transform: translateY(-50%);
  background: none; border: none; cursor: pointer;
  color: var(--text-muted); padding: 4px; display: flex; border-radius: 6px;
}
.password-toggle:hover { color: var(--text-secondary); }
.password-toggle svg { width: 18px; height: 18px; }
.form-input.password { padding-right: 42px; }
.field-error {
  font-size: 12px; color: var(--error-text);
  margin-top: 6px; display: none;
}
.field-error.visible { display: block; }
.alert {
  background: var(--error-bg); color: var(--error-text);
  border: 1px solid var(--error-border);
  padding: 10px 14px; border-radius: 10px;
  font-size: 13px; margin-bottom: 18px;
  display: none; align-items: center; gap: 8px;
}
.alert.visible { display: flex; }
.alert svg { width: 16px; height: 16px; flex-shrink: 0; }
.form-row {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 24px; font-size: 13px;
}
.checkbox-wrap {
  display: flex; align-items: center; gap: 8px;
  cursor: pointer; user-select: none; color: var(--text-secondary);
}
.checkbox-wrap input {
  width: 16px; height: 16px; accent-color: var(--primary); cursor: pointer;
}
.link { color: var(--link); text-decoration: none; cursor: pointer; }
.link:hover { color: var(--link-hover); text-decoration: underline; }
.submit-btn {
  width: 100%; height: 48px; border: none; border-radius: 10px;
  background: var(--primary); color: #fff;
  font-size: 15px; font-weight: 600; cursor: pointer;
  transition: background 0.2s, transform 0.1s;
  display: flex; align-items: center; justify-content: center; gap: 8px;
}
.submit-btn:hover:not(:disabled) { background: var(--primary-hover); }
.submit-btn:active:not(:disabled) { transform: scale(0.99); }
.submit-btn:disabled { opacity: 0.7; cursor: not-allowed; }
.spinner {
  width: 18px; height: 18px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff; border-radius: 50%;
  animation: spin 0.7s linear infinite; display: inline-block;
}
@keyframes spin { to { transform: rotate(360deg); } }
.card-footer {
  text-align: center; margin-top: 24px; padding-top: 20px;
  border-top: 1px solid var(--border-color);
  font-size: 12px; color: var(--text-muted);
}
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.5);
  display: none; align-items: center; justify-content: center;
  padding: 24px; z-index: 1000;
}
.modal-overlay.visible { display: flex; }
.modal {
  background: var(--card-bg); border-radius: 16px;
  padding: 28px; max-width: 380px; width: 100%;
  box-shadow: var(--card-shadow); animation: cardIn 0.3s ease;
}
.modal h3 { font-size: 17px; margin-bottom: 12px; }
.modal p { font-size: 14px; color: var(--text-secondary); line-height: 1.6; margin-bottom: 8px; }
.modal code {
  background: var(--input-bg); padding: 2px 6px; border-radius: 4px;
  font-size: 13px; color: var(--primary);
}
.modal-btn {
  width: 100%; height: 42px; margin-top: 16px; border: none;
  border-radius: 10px; background: var(--primary); color: #fff;
  font-size: 14px; font-weight: 600; cursor: pointer;
}
.modal-btn:hover { background: var(--primary-hover); }
/* 主题切换按钮：固定在登录卡片右上角 */
.theme-toggle {
  position: absolute; top: 16px; right: 16px;
  width: 36px; height: 36px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--input-bg);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}
.theme-toggle:hover { color: var(--text-primary); border-color: var(--input-focus); }
.theme-toggle svg { width: 18px; height: 18px; }
.theme-toggle .icon-moon { display: none; }
.theme-toggle .icon-sun { display: block; }
html.dark .theme-toggle .icon-moon { display: block; }
html.dark .theme-toggle .icon-sun { display: none; }
@media (max-width: 480px) {
  .login-card { padding: 32px 24px 24px; border-radius: 16px; }
  .brand h1 { font-size: 20px; }
}
</style>
</head>
<body>
  <div class="login-card">
    <button type="button" class="theme-toggle" id="themeToggle" aria-label="切换亮色/暗色模式" title="切换亮色/暗色模式">
      <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="5"/>
        <line x1="12" y1="1" x2="12" y2="3"/>
        <line x1="12" y1="21" x2="12" y2="23"/>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
        <line x1="1" y1="12" x2="3" y2="12"/>
        <line x1="21" y1="12" x2="23" y2="12"/>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
      </svg>
      <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
      </svg>
    </button>
    <div class="brand">
      <h1>管理后台登录</h1>
      <p>Hyde 友链审核系统</p>
    </div>

    <div class="alert" id="alert" role="alert">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span id="alertText"></span>
    </div>

    <form id="loginForm" novalidate>
      <div class="form-group">
        <label class="form-label" for="username">用户名 / 邮箱</label>
        <div class="input-wrap">
          <span class="input-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </span>
          <input type="text" id="username" class="form-input" placeholder="请输入用户名或邮箱" autocomplete="username" maxlength="100" />
        </div>
        <div class="field-error" id="usernameError"></div>
      </div>

      <div class="form-group">
        <label class="form-label" for="password">密码</label>
        <div class="input-wrap">
          <span class="input-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </span>
          <input type="password" id="password" class="form-input password" placeholder="请输入密码" autocomplete="current-password" maxlength="100" />
          <button type="button" class="password-toggle" id="pwdToggle" aria-label="显示或隐藏密码">
            <svg id="eyeIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
        </div>
        <div class="field-error" id="passwordError"></div>
      </div>

      <div class="form-row">
        <label class="checkbox-wrap">
          <input type="checkbox" id="remember" />
          <span>记住我</span>
        </label>
        <span class="link" id="forgotLink">忘记密码？</span>
      </div>

      <button type="submit" class="submit-btn" id="submitBtn">
        <span class="spinner" id="spinner" style="display:none"></span>
        <span id="btnText">登 录</span>
      </button>
    </form>

    <div class="card-footer">© Hyde 友链审核系统 · 请使用管理员账号登录</div>
  </div>

  <div class="modal-overlay" id="forgotModal">
    <div class="modal">
      <h3>忘记密码？</h3>
      <p>管理员账号密码通过环境变量配置，无法在页面端找回。</p>
      <p>如需重置，请在边缘函数环境变量中修改：</p>
      <p><code>ADMIN_USER</code> / <code>ADMIN_PASS</code></p>
      <button class="modal-btn" id="closeModal">我已知晓</button>
    </div>
  </div>

  <script>
  (function() {
    // 主题：与后台保持一致（读取 localStorage 中的 themeMode）
    var savedTheme = localStorage.getItem("themeMode") || "system";
    function isDark(mode) {
      return mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    }
    function applyTheme(mode) {
      var dark = isDark(mode);
      document.documentElement.classList.toggle("dark", dark);
      // 同步浏览器地址栏 / 状态栏主题色
      var metas = document.querySelectorAll('meta[name="theme-color"]');
      metas.forEach(function(m) { m.setAttribute("content", dark ? "#1b1b2a" : "#f6f5fa"); });
    }
    applyTheme(savedTheme);
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function() {
      if ((localStorage.getItem("themeMode") || "system") === "system") applyTheme("system");
    });
    // 后台在其它标签页切换主题时，同步刷新登录页主题
    window.addEventListener("storage", function(e) {
      if (e.key === "themeMode") applyTheme(localStorage.getItem("themeMode") || "system");
    });
    // 主题切换按钮：在 亮色 ↔ 暗色 间切换，并持久化到 localStorage
    document.getElementById("themeToggle").addEventListener("click", function() {
      var current = localStorage.getItem("themeMode") || "system";
      // 当前实际为暗色则切到亮色，否则切到暗色
      var next = isDark(current) ? "light" : "dark";
      localStorage.setItem("themeMode", next);
      applyTheme(next);
    });

    var form = document.getElementById("loginForm");
    var usernameInput = document.getElementById("username");
    var passwordInput = document.getElementById("password");
    var usernameError = document.getElementById("usernameError");
    var passwordError = document.getElementById("passwordError");
    var alertBox = document.getElementById("alert");
    var alertText = document.getElementById("alertText");
    var submitBtn = document.getElementById("submitBtn");
    var btnText = document.getElementById("btnText");
    var spinner = document.getElementById("spinner");
    var pwdToggle = document.getElementById("pwdToggle");
    var eyeIcon = document.getElementById("eyeIcon");
    var forgotLink = document.getElementById("forgotLink");
    var forgotModal = document.getElementById("forgotModal");
    var closeModal = document.getElementById("closeModal");

    var EYE_SHOW = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
    var EYE_HIDE = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';

    function showError(input, errorEl, msg) {
      input.classList.add("has-error");
      errorEl.textContent = msg;
      errorEl.classList.add("visible");
    }
    function clearError(input, errorEl) {
      input.classList.remove("has-error");
      errorEl.classList.remove("visible");
    }
    function showAlert(msg) { alertText.textContent = msg; alertBox.classList.add("visible"); }
    function hideAlert() { alertBox.classList.remove("visible"); }

    usernameInput.addEventListener("input", function() { clearError(usernameInput, usernameError); hideAlert(); });
    passwordInput.addEventListener("input", function() { clearError(passwordInput, passwordError); hideAlert(); });

    // 密码显示 / 隐藏
    pwdToggle.addEventListener("click", function() {
      if (passwordInput.type === "password") {
        passwordInput.type = "text";
        eyeIcon.innerHTML = EYE_HIDE;
      } else {
        passwordInput.type = "password";
        eyeIcon.innerHTML = EYE_SHOW;
      }
    });

    // 忘记密码弹窗
    forgotLink.addEventListener("click", function() { forgotModal.classList.add("visible"); });
    closeModal.addEventListener("click", function() { forgotModal.classList.remove("visible"); });
    forgotModal.addEventListener("click", function(e) { if (e.target === forgotModal) forgotModal.classList.remove("visible"); });

    function validate() {
      var ok = true;
      var u = usernameInput.value.trim();
      var p = passwordInput.value;
      if (!u) { showError(usernameInput, usernameError, "请输入用户名或邮箱"); ok = false; }
      else { clearError(usernameInput, usernameError); }
      if (!p) { showError(passwordInput, passwordError, "请输入密码"); ok = false; }
      else { clearError(passwordInput, passwordError); }
      return ok;
    }

    function setLoading(loading) {
      submitBtn.disabled = loading;
      spinner.style.display = loading ? "inline-block" : "none";
      btnText.textContent = loading ? "登录中..." : "登 录";
    }

    form.addEventListener("submit", function(e) {
      e.preventDefault();
      hideAlert();
      if (!validate()) return;
      setLoading(true);
      fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: usernameInput.value.trim(),
          password: passwordInput.value,
          remember: document.getElementById("remember").checked
        })
      }).then(function(res) {
        return res.json().then(function(data) {
          if (res.ok && data.success) {
            submitBtn.disabled = true;
            spinner.style.display = "none";
            btnText.textContent = "登录成功，正在跳转...";
            window.location.href = "/api/admin";
          } else {
            setLoading(false);
            showAlert(data.message || "登录失败，请稍后重试");
          }
        });
      }).catch(function() {
        setLoading(false);
        showAlert("网络异常，请检查网络后重试");
      });
    });

    // 用户名回车跳到密码，密码回车提交
    usernameInput.addEventListener("keypress", function(e) {
      if (e.key === "Enter") { e.preventDefault(); passwordInput.focus(); }
    });
    // 自动聚焦用户名
    usernameInput.focus();
  })();
  </script>
</body>
</html>`;
}

function adminHtml() {
  const pushStatusText =
    PUSH_SWITCH === "on"
      ? `✅ 推送已开启 | 平台：${PUSH_PLATFORM}`
      : "❌ 推送已关闭";
  // 主题svg图标
  const themeSvg = `<svg t="1785146130734" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1730" width="24" height="24"><path d="M554.666667 839.111111v113.777778h-71.111111v-113.777778h71.111111z m220.885333-120.945778l80.455111 80.455111-50.275555 50.275556-80.455112-80.455111 50.275556-50.275556z m-512.881778 0l50.275556 50.275556-80.455111 80.455111-50.275556-50.275556 80.455111-80.455111zM512 256c141.383111 0 256 114.616889 256 256s-114.616889 256-256 256-256-114.616889-256-256 114.616889-256 256-256z m0 71.111111c-102.115556 0-184.888889 82.773333-184.888889 184.888889s82.773333 184.888889 184.888889 184.888889 184.888889-82.773333 184.888889-184.888889-82.773333-184.888889-184.888889-184.888889z m448 149.333333v71.111112h-113.777778v-71.111112h113.777778z m-768 0v71.111112h-113.777778v-71.111112h113.777778z m40.490667-301.340444l80.455111 80.455111-50.275556 50.275556-80.455111-80.455111 50.275556-50.275556z m573.240889 0l50.275555 50.275556-80.455111 80.455111-50.275556-50.275556 80.455112-80.455111zM554.666667 71.111111v113.777778h-71.111111V71.111111h71.111111z" fill="currentColor" p-id="1731"></path></svg>`;
  return `<!DOCTYPE html>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Hyde友链审核管理后台</title>
<link rel="icon" href="https://seasir.top/favicon/favicon.ico" type="image/x-icon" />
<link rel="preconnect" href="https://unpkg.com" crossorigin />
<link rel="stylesheet" href="//unpkg.com/element-plus/dist/index.css" media="print" onload="this.media='all'" />
<link rel="stylesheet" href="//unpkg.com/element-plus/theme-chalk/dark/css-vars.css" media="print" onload="this.media='all'" />
<script defer src="//unpkg.com/vue@3/dist/vue.global.prod.js"></script>
<script defer src="//unpkg.com/element-plus"></script>
<script defer src="//unpkg.com/element-plus/dist/locale/zh-cn.min.js"></script>
<style>
* {margin:0;padding:0;box-sizing:border-box;}
#app {padding:24px;margin:0 auto;}
.push-tip {margin-bottom:16px;padding:12px 16px;border-radius:8px;background:var(--el-fill-color-lighter);}
.header-bar {display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px;}
.header-theme-btn {padding:6px;cursor:pointer;color:var(--el-text-color-primary);border-radius:6px;border:1px solid var(--el-border-color);background:transparent;display:flex;align-items:center;justify-content:center;}
.header-theme-btn:hover {background:var(--el-fill-color-lighter);}
.filter-wrap {display:flex;gap:12px;align-items:center;margin-bottom:16px;flex-wrap:wrap;}
.search-input {flex:1;min-width:280px;}
.batch-bar {display:flex;gap:10px;align-items:center;padding:8px 12px;border-radius:6px;flex-wrap:wrap;}
.table-box {border-radius:8px;overflow:hidden;border:1px solid var(--el-border-color);}
.form-dialog .el-form-item {margin-bottom:18px;}
.avatar-img {width:40px;height:40px;border-radius:6px;object-fit:cover;}
.header-title {font-size:22px;font-weight:600;}
.header-actions {display:flex;gap:10px;align-items:center;}
.filter-select {width:100px;}
.table-link {color:var(--el-color-primary);word-break:break-all;}
.theme-option-item {padding:10px 16px;cursor:pointer;border-radius:6px;}
.theme-option-item:hover {background:var(--el-fill-color-lighter);}
.theme-option-item.active {background:var(--el-color-primary-light-3);color:var(--el-color-primary);}
.tags-ellipsis {display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.op-cell {display:flex;align-items:center;justify-content:center;height:100%;gap:4px;flex-wrap:nowrap;}
.pagination-wrap {display:flex;justify-content:space-between;align-items:center;margin-top:16px;padding-right:8px;gap:16px;}
.el-button--small {
    border-radius: calc(var(--el-border-radius-base) - 1px);
    padding: 5px 4px;
    font-size: 12px;
}
@media (max-width: 768px) {
  /* 筛选区保持单行，搜索框自适应，下拉框固定窄宽 */
  .filter-wrap {flex-wrap:nowrap;}
  .filter-wrap .search-input {flex:1;min-width:0;}
  .pagination-wrap {justify-content:center;flex-wrap:wrap;}
  .el-pagination {flex-wrap:wrap;justify-content:center;}
  .el-pagination__jump {display: none;}
  /* 弹窗宽度铺满屏幕，左右留边距 */
  .el-dialog {
    width: calc(100% - 24px);
    margin: 0 auto ;
    top: 10vh ;
    transform: translateY(0);
  }
  /* 弹窗内边距缩小 */
  .el-dialog__body {
    padding: 12px 16px;
  }
  .el-dialog__header {
    padding: 12px 16px ;
  }
  .el-dialog__footer {
    padding: 12px 16px;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    justify-content: flex-end;
  }
  /* 表单标签取消固定宽度，文字居上 */
  .form-dialog .el-form-item__label {
    width: auto;
    text-align: left;
    padding-bottom: 6px;
    display: block;
  }
  /* 表单项间距缩小 */
  .form-dialog .el-form-item {
    margin-bottom: 14px;
  }
  /* 输入框、下拉框100%宽度 */
  .form-dialog .el-input,
  .form-dialog .el-select {
    width: 100%;
  }
}

</style>
</head>
<body>
<div id="app">
  <div class="push-tip">${pushStatusText}</div>
  <div class="header-bar">
    <h1 class="header-title">友链审核管理</h1>
    <div class="header-actions">
      <el-button type="success" @click="openAddDialog">新增友链</el-button>
      <el-button @click="logout">退出登录</el-button>
      <button class="header-theme-btn" @click="themeDialogVisible = true">
        ${themeSvg}
      </button>
    </div>
  </div>

  <div class="filter-wrap">
    <el-input class="search-input" v-model="searchKeyword" placeholder="搜索标题/描述/链接/标签/IP/邮箱/权重" prefix-icon="Search"></el-input>
    <el-select v-model="filterStatus" placeholder="筛选状态" class="filter-select">
      <el-option label="全部状态" value=""></el-option>
      <el-option label="待审核" value="pending"></el-option>
      <el-option label="已通过" value="approved"></el-option>
      <el-option label="已拒绝" value="rejected"></el-option>
    </el-select>
  </div>

  <div class="table-box">
    <el-table :data="pagedTableData" border stripe v-loading="loading" @selection-change="handleSelectionChange" empty-text="暂无友链数据">
      <el-table-column type="selection" width="40"></el-table-column>
      <el-table-column label="头像" width="85">
        <template #default="scope">
          <img v-if="scope.row.imgUrl" class="avatar-img" :src="scope.row.imgUrl" @error="$event.target.style.display='none'" />
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="110">
        <template #default="scope">
          <el-tag :type="statusTypeMap[scope.row.status] || 'info'" size="small">
            {{ statusMap[scope.row.status] }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="站点名称" prop="title" min-width="130"></el-table-column>
    
      <el-table-column label="描述" prop="desc" min-width="200"></el-table-column>
      <el-table-column label="站点链接" prop="siteUrl" min-width="240">
        <template #default="scope">
          <a :href="scope.row.siteUrl" target="_blank" class="table-link">{{ scope.row.siteUrl }}</a>
        </template>
      </el-table-column>
      <el-table-column label="标签" min-width="160">
        <template #default="scope">
          <span class="tags-ellipsis" v-if="scope.row.tags && scope.row.tags.length > 0">{{ scope.row.tags.join(", ") }}</span>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column label="权重" prop="weight" width="80" align="center">
        <template #default="scope">
          <span v-if="normalizeWeight(scope.row.weight) !== null">{{ normalizeWeight(scope.row.weight) }}</span>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column label="IP" prop="ip" width="150"></el-table-column>
      <el-table-column label="邮箱" prop="email" min-width="200"></el-table-column>
      <el-table-column label="留言" prop="message" min-width="200"></el-table-column>
      <el-table-column label="申请时间" prop="createdAt" width="170">
        <template #default="scope">{{ formatTime(scope.row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="更新时间" prop="updatedAt" width="170">
        <template #default="scope">{{ formatTime(scope.row.updatedAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="scope">
          <div class="op-cell">
            <!-- 永久显示通过按钮 -->
            <el-button text type="success" size="small" @click="singlePass(scope.row.id)">通过</el-button>

            <el-dropdown @command="(cmd) => handleRowCommand(cmd, scope.row)">
              <el-button text size="small">更多</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="edit">编辑</el-dropdown-item>
                  <el-dropdown-item command="reject">拒绝</el-dropdown-item>
                  <el-dropdown-item command="delete">删除</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </template>
      </el-table-column>
    </el-table>
  </div>

  <div class="pagination-wrap">
    <div class="batch-bar">
      <span>已选中 {{ selectedIds.length }} 条</span>
      <el-dropdown @command="handleBatchCommand" :disabled="selectedIds.length === 0">
        <el-button type="primary" size="small" :disabled="selectedIds.length === 0">批量操作</el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="batchPass">批量通过</el-dropdown-item>
            <el-dropdown-item command="batchReject">批量拒绝</el-dropdown-item>
            <el-dropdown-item command="batchDelete">批量删除</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
    <el-pagination
      v-model:current-page="currentPage"
      v-model:page-size="pageSize"
      :total="filterTableData.length"
      :page-sizes="[15, 20, 30]"
      layout="total, sizes, prev, pager, next, jumper"
      background
    ></el-pagination>
  </div>

<!-- 新增友链表单 -->
  <el-dialog v-model="dialogVisible" :title="dialogTitle" width="640px" :close-on-click-modal="false">
    <el-form class="form-dialog" :model="formData" label-width="100px">
      <el-form-item label="站点名称">
        <el-input v-model="formData.title" maxlength="50" placeholder="1-50字符"></el-input>
      </el-form-item>
      <el-form-item label="站点描述">
        <el-input v-model="formData.desc" type="textarea" :rows="3" maxlength="200" placeholder="1-200字符"></el-input>
      </el-form-item>
      <el-form-item label="站点链接">
        <el-input v-model="formData.siteUrl" placeholder="https://example.com"></el-input>
      </el-form-item>
      <el-form-item label="头像链接">
        <el-input v-model="formData.imgUrl" placeholder="头像链接，必填"></el-input>
      </el-form-item>
      <el-form-item label="联系邮箱">
        <el-input v-model="formData.email" placeholder="用于站长联系（可选）"></el-input>
      </el-form-item>
      <el-form-item label="留言">
        <el-input v-model="formData.message" type="textarea" :rows="3" placeholder="留言内容（可选）"></el-input>
      </el-form-item>
      <el-form-item label="标签">
        <el-input v-model="formData.tagsStr" placeholder="多个标签用英文逗号分隔"></el-input>
      </el-form-item>
      <el-form-item label="审核状态">
        <el-select v-model="formData.status">
          <el-option label="待审核" value="pending"></el-option>
          <el-option label="已通过" value="approved"></el-option>
          <el-option label="已拒绝" value="rejected"></el-option>
        </el-select>
      </el-form-item>
      <el-form-item label="权重">
        <el-input-number v-model="formData.weight" :min="0" :step="1" step-strictly controls-position="right" placeholder="数字越大排序越靠前"></el-input-number>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" @click="submitForm">保存</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="themeDialogVisible" title="选择界面主题" width="360px" :close-on-click-modal="true">
    <div class="theme-option-item" :class="{active: themeMode === 'system'}" @click="selectTheme('system')">
      跟随系统
    </div>
    <div class="theme-option-item" :class="{active: themeMode === 'light'}" @click="selectTheme('light')">
      浅色模式
    </div>
    <div class="theme-option-item" :class="{active: themeMode === 'dark'}" @click="selectTheme('dark')">
      暗黑模式
    </div>
  </el-dialog>

  <!-- 删除二次确认弹窗：确认按钮 5s 倒计时（单条 / 批量复用） -->
  <el-dialog v-model="deleteConfirmVisible" :title="deleteMode === 'batch' ? '批量删除' : '危险操作'" width="420px" :close-on-click-modal="false" @close="stopDeleteCountdown">
    <span>{{ deleteConfirmText }}</span>
    <template #footer>
      <el-button @click="cancelDelete">取消</el-button>
      <el-button type="danger" :disabled="deleteCountdown > 0" @click="confirmDelete">
        {{ deleteCountdown > 0 ? '确认删除 (' + deleteCountdown + 's)' : '确认删除' }}
      </el-button>
    </template>
  </el-dialog>
</div>

<script>
document.addEventListener("DOMContentLoaded", () => {
const { createApp, ref, reactive, computed, onMounted, watch, onUnmounted } = Vue;
const { ElMessage, ElMessageBox } = ElementPlus;
const ADMIN_API = "${ADMIN_PREFIX}/friends";
// 统一 fetch 封装：会话过期（401）时自动跳转登录页
let isRedirectingToLogin = false;
const adminFetch = async (url, opts) => {
  const res = await fetch(url, opts);
  if (res.status === 401 && !isRedirectingToLogin) {
    isRedirectingToLogin = true;
    ElMessage.error("登录已过期，正在跳转登录页...");
    setTimeout(() => { window.location.href = "/api/admin/login"; }, 1200);
  }
  return res;
};

const statusMap = Object.freeze({
  pending: "待审核",
  approved: "已通过",
  rejected: "已拒绝"
});
const statusTypeMap = Object.freeze({
  approved: "success",
  pending: "warning",
  rejected: "danger"
});

createApp({
  setup() {
    const loading = ref(false);
    const tableData = ref([]);
    const searchKeyword = ref("");
    const filterStatus = ref("");
    const selectedIds = ref([]);
    const currentPage = ref(1);
    const pageSize = ref(15);

    const dialogVisible = ref(false);
    const dialogTitle = ref("新增友链");
    const editRowId = ref("");
    // 补全所有表单字段，消除赋值undefined报错
    const formData = reactive({
      title: "",
      desc: "",
      siteUrl: "",
      imgUrl: "",
      email: "",
      message: "",
      tagsStr: "",
      status: "pending",
      weight: 0
    });

    const themeDialogVisible = ref(false);
    const themeMode = ref(localStorage.getItem("themeMode") || "system");
    const systemDarkMedia = window.matchMedia("(prefers-color-scheme: dark)");

    // 移动端检测
    const isMobile = ref(window.innerWidth <= 768);
    let resizeTimer = null;
    const resizeHandler = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        isMobile.value = window.innerWidth <= 768;
      }, 150);
    };

    const formatTime = (timestamp) => {
      if (!timestamp) return "-";
      const d = new Date(timestamp);
      const pad = n => String(n).padStart(2, "0");
      return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
    };

    const normalizeWeight = (w) => {
      if (w === null || w === undefined || w === "") return null;
      const n = Number(w);
      return Number.isFinite(n) ? n : null;
    };

    const filterTableData = computed(() => {
      let list = tableData.value;
      const kw = debouncedKeyword.value.trim().toLowerCase();
      if (filterStatus.value) {
        list = list.filter(item => item.status === filterStatus.value);
      }
      if (kw) {
        list = list.filter(item => {
          const tagText = Array.isArray(item.tags) ? item.tags.join(",") : "";
          const weightText = item.weight != null ? String(item.weight) : "";
          const text = [item.title, item.desc, item.siteUrl, item.ip, item.email, tagText, weightText].join(" ").toLowerCase();
          return text.includes(kw);
        });
      }
      return list;
    });

    const pagedTableData = computed(() => {
      const start = (currentPage.value - 1) * pageSize.value;
      const end = start + pageSize.value;
      return filterTableData.value.slice(start, end);
    });

    watch([searchKeyword, filterStatus], () => {
      currentPage.value = 1;
    });

    // 搜索防抖：250ms，避免快速输入时频繁重算
    const debouncedKeyword = ref("");
    let searchDebounceTimer = null;
    watch(searchKeyword, (val) => {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        debouncedKeyword.value = val;
      }, 250);
    });

    watch([filterTableData, pageSize], ([newData]) => {
      const totalPages = Math.ceil(newData.length / pageSize.value);
      if (currentPage.value > totalPages && totalPages > 0) {
        currentPage.value = totalPages;
      } else if (totalPages === 0) {
        currentPage.value = 1;
      }
    });

    const applyTheme = (mode) => {
      const html = document.documentElement;
      html.classList.remove("dark");
      if (mode === "dark") {
        html.classList.add("dark");
      } else if (mode === "system") {
        if (systemDarkMedia.matches) html.classList.add("dark");
      }
      localStorage.setItem("themeMode", mode);
    };
    const selectTheme = (mode) => {
      themeMode.value = mode;
      applyTheme(mode);
      themeDialogVisible.value = false;
      ElMessage.success("主题切换完成");
    };
    const initTheme = () => {
      applyTheme(themeMode.value);
      systemDarkMedia.addEventListener("change", () => {
        if (themeMode.value === "system") applyTheme("system");
      });
    };

    const loadList = async () => {
      loading.value = true;

      try {
        const res = await adminFetch(ADMIN_API);
        const json = await res.json();
        if (json.success) {
          const items = json.items || [];
          items.sort((a, b) => (Number(b.weight) || 0) - (Number(a.weight) || 0));
          tableData.value = items;
        } else {
          ElMessage.error(json.message || "数据加载失败");
        }
      } catch (err) {
        ElMessage.error("网络请求失败");
        console.error(err);
      } finally {
        loading.value = false;
      }
    };

    const handleSelectionChange = (val) => {
      selectedIds.value = val.map(item => item.id);
    };

    const openAddDialog = () => {
      dialogTitle.value = "新增友链";
      editRowId.value = "";
      formData.title = "";
      formData.desc = "";
      formData.siteUrl = "";
      formData.imgUrl = "";
      formData.email = "";
      formData.message = "";
      formData.tagsStr = "";
      formData.status = "pending";
      formData.weight = 0;
      dialogVisible.value = true;
    };

    const logout = () => {
      ElMessageBox.confirm("确定要退出登录吗？", "退出确认", {
        confirmButtonText: "确认退出",
        cancelButtonText: "取消",
        type: "warning"
      }).then(() => {
        window.location.href = "/api/admin/logout";
      }).catch(() => {});
    };

    const openEditDialog = (row) => {
      dialogTitle.value = "编辑友链";
      editRowId.value = row.id;
      formData.title = row.title || "";
      formData.desc = row.desc || "";
      formData.siteUrl = row.siteUrl || "";
      formData.imgUrl = row.imgUrl || "";
      formData.email = row.email || "";
      formData.message = row.message || "";
      formData.tagsStr = Array.isArray(row.tags) ? row.tags.join(",") : "";
      formData.status = row.status || "pending";
      formData.weight = (() => {
        const n = Number(row.weight);
        return Number.isFinite(n) ? n : 0;
      })();
      dialogVisible.value = true;
    };

    const submitForm = async () => {
      const { title, desc, siteUrl, imgUrl, email, message, tagsStr, status, weight } = formData;
      if (!title || title.length > 50) return ElMessage.warning("标题必填，长度1-50字符");
      if (!desc || desc.length > 200) return ElMessage.warning("描述必填，长度1-200字符");
      if (!siteUrl) return ElMessage.warning("站点链接必填");
      try { new URL(siteUrl); } catch { return ElMessage.warning("站点链接格式不正确"); }
      if (!imgUrl) return ElMessage.warning("头像地址必填");
      const w = Number(weight);
      if (!Number.isFinite(w)) return ElMessage.warning("权重必须是数字");
      const tags = tagsStr.split(",").map(s => s.trim()).filter(s => s);
      const payload = { title, desc, siteUrl, imgUrl, email, message, tags, status, weight: w };

      try {
        if (editRowId.value) {
          payload.id = editRowId.value;
          const res = await adminFetch(ADMIN_API, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          const json = await res.json();
          if (json.success) {
            ElMessage.success("编辑成功");
            dialogVisible.value = false;
            loadList();
          } else {
            ElMessage.error(json.message || "编辑失败");
          }
        } else {
          const res = await adminFetch(ADMIN_API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          const json = await res.json();
          if (json.success) {
            ElMessage.success("新增成功");
            dialogVisible.value = false;
            loadList();
          } else {
            ElMessage.error(json.message || "新增失败");
          }
        }
      } catch (err) {
        ElMessage.error("操作失败，网络异常");
        console.error(err);
      }
    };

    const singlePass = (id) => {
      ElMessageBox.confirm("确定通过这条友链的审核？", "通过确认", {
        confirmButtonText: "确认通过",
        cancelButtonText: "取消",
        type: "success"
      }).then(() => updateSingleStatus(id, "approved"))
        .catch(() => ElMessage.info("已取消"));
    };
    const singleReject = (id) => {
      ElMessageBox.confirm("确定拒绝这条友链的审核？", "拒绝确认", {
        confirmButtonText: "确认拒绝",
        cancelButtonText: "取消",
        type: "warning"
      }).then(() => updateSingleStatus(id, "rejected"))
        .catch(() => ElMessage.info("已取消"));
    };
    const updateSingleStatus = async (id, status) => {
      try {
        const res = await adminFetch(ADMIN_API, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, status })
        });
        const json = await res.json();
        if (json.success) {
          ElMessage.success("操作成功");
          loadList();
        } else {
          ElMessage.error(json.message || "操作失败");
        }
      } catch {
        ElMessage.error("网络异常");
      }
    };

    // 删除二次确认：确认按钮 3s 倒计时（单条 / 批量复用）
    const deleteConfirmVisible = ref(false);
    const deleteMode = ref("single");
    const pendingDeleteId = ref("");
    const deleteCountdown = ref(0);
    let deleteCountdownTimer = null;

    const deleteConfirmText = computed(() => {
      return deleteMode.value === "batch"
        ? "确定永久删除选中的 " + selectedIds.value.length + " 条友链？删除后无法恢复！"
        : "确定永久删除这条友链？删除后无法恢复！";
    });

    const startDeleteCountdown = () => {
      deleteCountdown.value = 3;
      if (deleteCountdownTimer) clearInterval(deleteCountdownTimer);
      deleteCountdownTimer = setInterval(() => {
        deleteCountdown.value -= 1;
        if (deleteCountdown.value <= 0) {
          clearInterval(deleteCountdownTimer);
          deleteCountdownTimer = null;
          deleteCountdown.value = 0;
        }
      }, 1000);
    };

    const stopDeleteCountdown = () => {
      if (deleteCountdownTimer) {
        clearInterval(deleteCountdownTimer);
        deleteCountdownTimer = null;
      }
      deleteCountdown.value = 0;
    };

    const singleDelete = (id) => {
      deleteMode.value = "single";
      pendingDeleteId.value = id;
      deleteConfirmVisible.value = true;
      startDeleteCountdown();
    };

    const cancelDelete = () => {
      deleteConfirmVisible.value = false;
      stopDeleteCountdown();
      ElMessage.info("已取消删除");
    };

    const confirmDelete = async () => {
      if (deleteCountdown.value > 0) return;
      deleteConfirmVisible.value = false;
      stopDeleteCountdown();
      // 批量删除
      if (deleteMode.value === "batch") {
        const results = await Promise.allSettled(
          selectedIds.value.map(id =>
            adminFetch(ADMIN_API, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id })
            }).then(r => r.json())
          )
        );
        const success = results.filter(r => r.status === "fulfilled" && r.value.success).length;
        const fail = selectedIds.value.length - success;
        ElMessage.success("批量删除完成：成功" + success + "条，失败" + fail + "条");
        selectedIds.value = [];
        loadList();
        return;
      }
      // 单条删除
      const id = pendingDeleteId.value;
      try {
        const res = await adminFetch(ADMIN_API, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id })
        });
        const json = await res.json();
        if (json.success) {
          ElMessage.success("删除成功");
          loadList();
        } else {
          ElMessage.error(json.message || "删除失败");
        }
      } catch {
        ElMessage.error("网络异常");
      }
    };

    const batchPass = async () => {
      if (selectedIds.value.length === 0) return ElMessage.warning("请先勾选友链");
      const tipText = "确定批量通过选中的 " + selectedIds.value.length + " 条友链？";
      ElMessageBox.confirm(tipText, "批量操作", {
        confirmButtonText: "确认",
        cancelButtonText: "取消",
        type: "info"
      }).then(async () => {
        const results = await Promise.allSettled(
          selectedIds.value.map(id =>
            adminFetch(ADMIN_API, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id, status: "approved" })
            }).then(r => r.json())
          )
        );
        const success = results.filter(r => r.status === "fulfilled" && r.value.success).length;
        const fail = selectedIds.value.length - success;
        ElMessage.success("批量完成：成功" + success + "条，失败" + fail + "条");
        selectedIds.value = [];
        loadList();
      }).catch(() => ElMessage.info("已取消"));
    };
    const batchReject = async () => {
      if (selectedIds.value.length === 0) return ElMessage.warning("请先勾选友链");
      const tipText = "确定批量拒绝选中的 " + selectedIds.value.length + " 条友链？";
      ElMessageBox.confirm(tipText, "批量操作", {
        confirmButtonText: "确认",
        cancelButtonText: "取消",
        type: "info"
      }).then(async () => {
        const results = await Promise.allSettled(
          selectedIds.value.map(id =>
            adminFetch(ADMIN_API, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id, status: "rejected" })
            }).then(r => r.json())
          )
        );
        const success = results.filter(r => r.status === "fulfilled" && r.value.success).length;
        const fail = selectedIds.value.length - success;
        ElMessage.success("批量完成：成功" + success + "条，失败" + fail + "条");
        selectedIds.value = [];
        loadList();
      }).catch(() => ElMessage.info("已取消"));
    };
    const batchDelete = () => {
      if (selectedIds.value.length === 0) return ElMessage.warning("请先勾选友链");
      deleteMode.value = "batch";
      deleteConfirmVisible.value = true;
      startDeleteCountdown();
    };

    const handleRowCommand = (command, row) => {
      switch (command) {
        case "edit":
          openEditDialog(row);
          break;
        case "reject":
          singleReject(row.id);
          break;
        case "delete":
          singleDelete(row.id);
          break;
      }
    };

    const handleBatchCommand = (command) => {
      switch (command) {
        case "batchPass":
          batchPass();
          break;
        case "batchReject":
          batchReject();
          break;
        case "batchDelete":
          batchDelete();
          break;
      }
    };

    onMounted(() => {
      initTheme();
      loadList();
      window.addEventListener("resize", resizeHandler);
    });

    onUnmounted(() => {
      window.removeEventListener("resize", resizeHandler);
      stopDeleteCountdown();
      clearTimeout(searchDebounceTimer);
      clearTimeout(resizeTimer);
    });

    return {
      isMobile,
      loading,
      tableData,
      pagedTableData,
      filterTableData,
      searchKeyword,
      filterStatus,
      selectedIds,
      currentPage,
      pageSize,
      statusMap,
      statusTypeMap,
      dialogVisible,
      dialogTitle,
      formData,
      themeMode,
      themeDialogVisible,
      selectTheme,
      formatTime,
      normalizeWeight,
      handleSelectionChange,
      openAddDialog,
      logout,
      openEditDialog,
      submitForm,
      singlePass,
      singleReject,
      singleDelete,
      deleteConfirmVisible,
      deleteMode,
      deleteConfirmText,
      deleteCountdown,
      cancelDelete,
      confirmDelete,
      stopDeleteCountdown,
      batchPass,
      batchReject,
      batchDelete,
      handleRowCommand,
      handleBatchCommand
    };
  }
}).use(ElementPlus, { locale: ElementPlusLocaleZhCn }).mount("#app");
});
</script>
</body>
</html>`;
}

// === 6. 路由处理逻辑 ===
addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});
async function handleRequest(request) {
  const url = new URL(request.url);
  let pathname = url.pathname;
  if (pathname.length > 1 && pathname.endsWith("/"))
    pathname = pathname.slice(0, -1);
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods":
          "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
        "X-Powered-By": "W3C",
      },
    });
  }
  const adminAuthRes = await checkAdminAuth(request, pathname);
  if (adminAuthRes) return adminAuthRes;
  try {
    // 公开友链接口
    if (request.method === "GET" && pathname === `${API_PREFIX}/friends`) {
      const apps = await readFriends();
      return json({ items: apps });
    }
    // 游客提交友链（新增pending，自动推送通知）
    if (request.method === "POST" && pathname === `${API_PREFIX}/friends`) {
      const parsed = await readJson(request);
      if (parsed.error) return parsed.error;
      const { title, desc, siteUrl, imgUrl, email, message } = parsed.body || {};
      if (!title || typeof title !== "string" || title.length > 50)
        return json({ success: false, message: "title 无效 (1-50字符)" }, 400);
      if (!desc || typeof desc !== "string" || desc.length > 200)
        return json({ success: false, message: "desc 无效 (1-200字符)" }, 400);
      if (!siteUrl || typeof siteUrl !== "string")
        return json({ success: false, message: "siteUrl 无效" }, 400);
      try {
        new URL(siteUrl);
      } catch (_) {
        return json({ success: false, message: "siteUrl 不是有效 URL" }, 400);
      }
      if (!imgUrl || typeof imgUrl !== "string")
        return json({ success: false, message: "imgUrl 不能为空" }, 400);
      const clientIp = request.eo?.clientIp || "";
      const now = Date.now();
      const existResp = await fetchApi(
        `/rest/v1/friends?select=id&siteUrl=eq.${encodeURIComponent(siteUrl)}&limit=1`,
      );
      const existRows = existResp.ok ? await existResp.json() : [];
      if (existRows?.length) {
        const fail = await patchFriend(existRows[0].id, {
          title,
          desc,
          siteUrl,
          imgUrl: imgUrl || "",
          email: email || "",
          message: message || "",
          updatedAt: now,
        });
        if (fail) return fail;
      } else {
        const ins = await fetchApi(`/rest/v1/friends`, {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify([
            {
              title,
              desc,
              siteUrl,
              imgUrl: imgUrl || "",
              email: email || "",
              message: message || "",
              tags: [],
              status: "pending",
              ip: clientIp,
              createdAt: now,
              updatedAt: now,
            },
          ]),
        });
        if (!ins.ok) return json({ success: false, message: "提交失败" }, 500);
        // 新增友链申请，触发推送通知（await确保推送完成）
        await sendPushNotice(
          "新友链申请待审核",
          `站点名称：${title}\n站点描述：${desc}\n站点链接：${siteUrl}\n头像链接：${imgUrl}\n联系邮箱：${email || "-"}\n留言：${message || "-"}\n当前状态：待审核`,
        );
      }
      return json({ success: true });
    }
    // 登录页面（GET 返回登录 HTML；已登录则直接跳转后台）
    if (request.method === "GET" && pathname === `${ADMIN_PREFIX}/login`) {
      const cookies = parseCookies(request);
      const token = cookies[SESSION_COOKIE] || "";
      if (await verifySessionToken(token)) {
        return Response.redirect(
          new URL(ADMIN_PREFIX, request.url).toString(),
          302,
        );
      }
      return new Response(loginHtml(), {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=UTF-8",
          "X-Powered-By": "W3C",
          "Cache-Control": "no-store",
        },
      });
    }
    // 登录接口（POST 校验账号密码，成功则下发会话 Cookie）
    if (request.method === "POST" && pathname === `${ADMIN_PREFIX}/login`) {
      const parsed = await readJson(request);
      if (parsed.error) return parsed.error;
      const { username, password, remember } = parsed.body || {};
      if (!username || !password) {
        return json({ success: false, message: "请输入用户名和密码" }, 400);
      }
      // 统一失败提示，避免泄露用户名是否存在
      if (username !== ADMIN_USER || password !== ADMIN_PASS) {
        return json({ success: false, message: "用户名或密码错误" }, 401);
      }
      // 记住我：30 天；否则：12 小时
      const maxAge = remember ? 30 * 24 * 3600 : 12 * 3600;
      const token = await createSessionToken(maxAge);
      return json({ success: true }, 200, {
        "Set-Cookie": buildSessionCookie(token, maxAge),
      });
    }
    // 退出登录（清除 Cookie 后跳转登录页）
    if (request.method === "GET" && pathname === `${ADMIN_PREFIX}/logout`) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: new URL("/api/admin/login", request.url).toString(),
          "Set-Cookie": buildClearCookie(),
          "X-Powered-By": "W3C",
        },
      });
    }
    // 管理后台页面
    if (request.method === "GET" && pathname === ADMIN_PREFIX) {
      return new Response(adminHtml(), {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=UTF-8",
          "X-Powered-By": "W3C",
        },
      });
    }
    // 获取全部友链
    if (request.method === "GET" && pathname === `${ADMIN_PREFIX}/friends`) {
      const apps = await readAllFriends();
      if (apps === null)
        return json({ success: false, message: "读取失败" }, 500);
      return json({ success: true, items: apps });
    }
    // 修改审核状态（通过/拒绝）
    if (request.method === "PUT" && pathname === `${ADMIN_PREFIX}/friends`) {
      const parsed = await readJson(request);
      if (parsed.error) return parsed.error;
      const { id, status } = parsed.body || {};
      if (!id) return json({ success: false, message: "id 不能为空" }, 400);
      if (!status || !["approved", "rejected", "pending"].includes(status))
        return json({ success: false, message: "status 无效" }, 400);
      const fail = await patchFriend(id, { status, updatedAt: Date.now() });
      if (fail) return fail;
      // 可扩展：审核通过/拒绝推送通知
      return json({ success: true, data: { id, status } });
    }
    // 后台手动新增友链
    if (request.method === "POST" && pathname === `${ADMIN_PREFIX}/friends`) {
      const parsed = await readJson(request);
      if (parsed.error) return parsed.error;
      const body = parsed.body;
      if (
        !body.title ||
        typeof body.title !== "string" ||
        body.title.length > 50
      )
        return json({ success: false, message: "title 无效 (1-50字符)" }, 400);
      if (!body.desc || typeof body.desc !== "string" || body.desc.length > 200)
        return json({ success: false, message: "desc 无效 (1-200字符)" }, 400);
      if (!body.siteUrl)
        return json({ success: false, message: "siteUrl 不能为空" }, 400);
      try {
        new URL(body.siteUrl);
      } catch (_) {
        return json({ success: false, message: "siteUrl 不是有效URL" }, 400);
      }
      if (!body.imgUrl || typeof body.imgUrl !== "string")
        return json({ success: false, message: "imgUrl 不能为空" }, 400);
      const fail = await createFriend(body, request.eo?.clientIp || "");
      if (fail) return fail;
      // 后台手动新增也推送（await确保推送完成）
      const statusMap = { pending: "待审核", approved: "已通过", rejected: "已拒绝" };
      await sendPushNotice(
        "管理员新增友链",
        `站点名称：${body.title}\n站点描述：${body.desc}\n站点链接：${body.siteUrl}\n头像链接：${body.imgUrl}\n联系邮箱：${body.email || "-"}\n留言：${body.message || "-"}\n当前状态：${statusMap[body.status] || body.status}`,
      );
      return json({ success: true });
    }
    // 编辑友链
    if (request.method === "PATCH" && pathname === `${ADMIN_PREFIX}/friends`) {
      const parsed = await readJson(request);
      if (parsed.error) return parsed.error;
      const { id, ...data } = parsed.body || {};
      if (!id) return json({ success: false, message: "id不能为空" }, 400);
      const fail = await fullUpdateFriend(id, data);
      if (fail) return fail;
      return json({ success: true });
    }
    // 删除友链
    if (request.method === "DELETE" && pathname === `${ADMIN_PREFIX}/friends`) {
      const parsed = await readJson(request);
      if (parsed.error) return parsed.error;
      const { id } = parsed.body || {};
      if (!id) return json({ success: false, message: "id不能为空" }, 400);
      const fail = await deleteFriend(id);
      if (fail) return fail;
      return json({ success: true });
    }
    // 未匹配友链路由的请求（如 /api/dynamic.json、/api/allPostMeta.json 等 Astro 端点）
    // 透传回源，由 EdgeOne Pages 源站（Astro 构建产物）响应
    // 说明：fetch(request) 子请求访问 EdgeOne 节点缓存/回源，不会再次触发边缘函数，无递归风险
    return fetch(request);
  } catch (err) {
    return json(
      {
        success: false,
        message: err instanceof Error ? err.message : String(err),
        uuid: request.eo?.uuid || "",
      },
      500,
    );
  }
}
