# Firefly 管理后台

Firefly 博客的 Web 管理后台。**已并站进主博客项目**：admin 前端走博客域名 `/admin/` 子路径（HashRouter），后端 Edge/Cloud Functions 与博客静态站同库共存、`/api/*` 同域命中，由主博客根 `package.json` 的 `build` 脚本统一构建、根 `.cnb.yml` 用 `edgeone makers deploy` 一次部署到 EdgeOne Makers 项目 `firefly-xiangfeng`。
完整并站方案见仓库根目录 `docs/admin-merge-plan.md`；admin 原始设计文档见 `docs/admin-console-plan.md`。

## 技术栈

- Vite 5 + React 18 + TypeScript
- Semi Design（`@douyinfe/semi-ui` + `@douyinfe/semi-icons`）
- React Router（HashRouter，规避 EdgeOne 不支持 SPA rewrite 的限制）
- TanStack Query（请求缓存 / 失效重取）
- md-editor-rt（Markdown 编辑器；Semi 只有 `MarkdownRender` 渲染器无编辑器）

## 目录

```
admin/
├─ src/                 前端 SPA（React + Semi，base=/admin/）
├─ edge-functions/      Edge Runtime 函数：读 CNB API、KV、JWT 签验、公开只读 API
├─ cloud-functions/     Node.js 20 函数：isomorphic-git 写文件回 CNB 仓库
├─ middleware.js        全局 JWT 鉴权中间件
├─ scripts/             部署产物打包脚本（含独立部署应急退路）
└─ edgeone.json         EdgeOne 项目配置（maxDuration、/assets/* 缓存）
```

> 生产构建时，根 `scripts/assemble-admin-dist.mjs` 会把 `admin/dist`（Vite 产物）拷到主博客 `dist/admin/`，并把 `edge-functions/`、`cloud-functions/`、`middleware.js`、`edgeone.json` 拍平到主博客 `dist/` 根级，由 Makers 按根约定发现函数。

## 本地开发

```bash
# 首次
cd admin
pnpm install
edgeone makers link         # 关联 firefly-xiangfeng 项目，同步 KV 绑定与环境变量

# 前端 + 函数一体化联调（推荐）
edgeone makers dev          # 默认 localhost:8088

# 或者仅前端（函数将 fetch 失败）
pnpm dev                    # localhost:5173，vite proxy /api/* → 8088
```

## 构建

```bash
# 仅构建 admin（产出 admin/dist/，不组装到主博客）
pnpm build:vite

# 完整 build（产出 admin/deploy-dist/，含函数拍平，供独立部署应急退路用）
pnpm build
```

`deploy-dist/` 是 admin **应急独立部署**的目标：包含 Vite 产物、`edge-functions/`、`cloud-functions/`、`middleware.js`、`edgeone.json`、根 `package.json`。生产路径不从此处部署，只在主博客统一部署出问题时作热回退（见下方"手动部署后台"）。

## 部署

**生产路径（默认）**：由根 `.cnb.yml` 触发，主博客一次构建含 admin（CNB 已 `export BUILD_ADMIN=1`）：

```bash
# 仓库根目录（本地复现需显式开启 admin 构建）
BUILD_ADMIN=1 pnpm build        # astro build + pagefind + assemble-admin-dist（admin 并入 dist/）
edgeone makers deploy ./dist -n firefly-xiangfeng --token $EDGEONE_PAGES_API_TOKEN
```

> `BUILD_ADMIN` 开关：`assemble-admin-dist.mjs` 仅在 `BUILD_ADMIN=1` 时把 admin 产物拍平进 `dist/`，否则跳过只出博客。这是为了让普通主题用户 `pnpm build` 不被 admin 拖累；本仓库 CNB 流水线已显式开启。

push 到 main 分支后 CNB 自动跑上述流程。访问 `https://博客域名/admin/` 进入后台，`/api/*` 同域命中函数。

## 环境变量（生产）

在 EdgeOne 控制台 **`firefly-xiangfeng`** 项目设置中配置（生产 + 预览），完整说明见 `docs/admin-console-plan.md` 7.1 节。并站后 secrets 跟主博客同一项目，不再分散。

| 变量 | 说明 |
|------|------|
| `ADMIN_USERNAME` | 后台登录用户名 |
| `ADMIN_PASSWORD_HASH` | 登录密码哈希，格式 `pbkdf2$100000$<salt>$<hash>`，用 `node scripts/generate-password-hash.mjs "<明文>"` 生成；真实值勿写进仓库 |
| `JWT_SECRET` | 会话 JWT 签名密钥 |
| `CNB_TOKEN` / `CNB_USERNAME` / `CNB_REPO` / `CNB_BRANCH` | 写回 Git / 触发仓库的 CNB 凭据 |
| `PUBLIC_ALLOWED_ORIGIN` | 公开 API 的 CORS 允许来源（博客域名，如 `https://your-blog.example`） |
| `WECHAT_WORK_WEBHOOK` | 企业微信群机器人 Webhook；构建通知 + 友链申请通知共用 |
| `FRIEND_APPLY_WEBHOOK` | 可选，覆盖友链申请专用机器人；未设则用 `WECHAT_WORK_WEBHOOK`（一个机器人时无需配此项） |
| `QINIU_ACCESS_KEY` / `QINIU_SECRET_KEY` | 七牛图床直传 / 列表 / 删除代理用凭据（图床功能启用时需要） |

## KV 绑定

KV namespace 绑定到 `firefly-xiangfeng` 项目，**绑定的变量名必须叫 `firefly_kv`**——admin 代码全部通过全局变量 `firefly_kv` 访问 KV（`typeof firefly_kv === "undefined"` 为真即返回"KV 未绑定"）。namespace 可与原 firefly-admin 共用同一份数据。

## 功能页面

| 路由 | 页面 | 说明 |
|------|------|------|
| `/dashboard` | 仪表盘 | 文章 / 说说 / 公告 / 每日一言统计、最近构建、快捷入口 |
| `/posts` `/posts/new` `/posts/edit` | 文章管理 | 列表、新建 / 编辑、存草稿（不构建）、保存并发布、批量发布草稿 |
| `/moments` | 说说 | 列表 + 图片轮播 / 网格、CRUD（KV） |
| `/announcements` | 公告 | 列表 + 可选链接、CRUD（KV） |
| `/quotes` | 每日一言 | 列表、CRUD（KV） |
| `/data` | 资料数据 | 友链 / 申请审核 / 项目 / 设备 / 技能 / 时间线 多 Tab |
| `/pages` | 页面内容 | about / guestbook 等特殊页面 MDX 编辑 |
| `/builds` | 构建记录 | CNB 构建状态轮询 |
| `/site-config/*` | 博客配置 | 站点 / 布局 / 功能 / 内容 / 外观 / 开发者 等配置域 |
| `/settings` | 系统设置 | 图床（七牛）等系统级配置 |

## 数据通道

- **KV 通道（秒级生效，无需构建）**：说说、公告、每日一言、友链、设备、友链申请、动态数据快照开关（site-flags）
- **Git 通道（写回仓库并触发构建，约 3-5 分钟生效）**：文章、项目、技能、时间线、站点配置

## 脚本

| 脚本 | 用途 |
|------|------|
| `scripts/build-deploy-dist.mjs` | 组装 `deploy-dist/`（Vite 产物 + edge/cloud-functions + middleware + edgeone.json） |
| `scripts/bundle-isomorphic-git.mjs` | 预打包 isomorphic-git 为自含 vendor bundle（写链路依赖，缺失部署后会 545） |
| `scripts/generate-password-hash.mjs` | 生成登录密码 hash（PBKDF2-SHA256 / 10 万次） |
| `scripts/seed-all.mjs` | 登录后台后给说说 / 公告 / 每日一言 / 设备灌初始种子数据（幂等，`--force` 强制重种） |
| `scripts/smoke-moments.mjs` | 说说 CRUD 真机冒烟（会建 / 改 / 删测试数据） |
| `scripts/smoke-announcements-quotes.mjs` | 公告 / 每日一言 CRUD 冒烟 |

## 常见运维操作

### 修改登录密码

1. 本地生成新密码哈希（在 `admin/` 目录）：
   ```bash
   node scripts/generate-password-hash.mjs "你的新密码"
   ```
   输出形如 `pbkdf2$100000$<salt>$<hash>`，复制整行。
2. 在 EdgeOne 控制台 `firefly-xiangfeng` 环境变量里用该值替换 `ADMIN_PASSWORD_HASH` 并保存。
3. 重新部署一次（push main 触发 CNB 重建，或在控制台触发重新部署）让新 env 生效。

> 明文密码与 hash 都不要提交进仓库；`admin/.env` 仅本地调试用。

### 手动部署后台（应急独立部署退路）

生产默认走主博客统一部署（见上"部署"段）。**仅当主博客统一部署出问题、需要 admin 临时独立上线时**，用 admin 自带的 `deploy-dist/` 独立部署到一个备用 Makers 项目：

```bash
cd admin
pnpm install
pnpm build
npx edgeone makers deploy ./deploy-dist -n firefly-admin -t $EO_API_TOKEN
```

> 注：原 `firefly-admin` 项目已于并站后删除（见 `docs/admin-merge-plan.md` P6）。此应急路径需先在控制台重建同名项目、重配 secrets 与 KV 绑定（变量名仍 `firefly_kv`）才能使用。正常情况下**不要走这条路**。

部署后等约 40s 再 curl 验证；响应体必须是 JSON 而非 SPA HTML 才算函数真上线。

### 给动态内容灌初始数据（KV 为空时）

```bash
# 已绑自定义域名
node scripts/seed-all.mjs https://admin.example.com <USERNAME> '<PASSWORD>'

# 仍用预设域名过渡期（需带 eo_token）
node scripts/seed-all.mjs https://firefly-admin-xxxx.edgeone.cool <USERNAME> '<PASSWORD>' <EO_TOKEN>

# 强制重种（先清空再写，慎用于生产）
node scripts/seed-all.mjs https://admin.example.com <USERNAME> '<PASSWORD>' --force
```

### 轮换凭据

- **JWT_SECRET**：更换后所有已登录会话失效，需重新登录；后台与博客公开 API 不共享该密钥。
- **CNB_TOKEN**：在 CNB 个人设置生成新 token，同步到 EdgeOne 环境变量；旧 token 立即失效。
- **七牛密钥**：在七牛控制台重置 AK/SK，同步到 EdgeOne 环境变量；图床功能会短暂不可用直到换新。
- **企微 / 友链 webhook**：在群机器人重新获取 key，替换 `WECHAT_WORK_WEBHOOK`（或 `FRIEND_APPLY_WEBHOOK`）。

### 验证线上接口

并站后 admin 与博客同域，`<ADMIN_ORIGIN>` 即博客域名（如 `https://astro.cchaoka.cn`），无需跨域：

```bash
# 公开友链申请（无需登录，同域无需带 Origin 头验 CORS）
curl -s -X POST https://<BLOG_ORIGIN>/api/public/friend-apply \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{"title":"测试站","desc":"desc","siteurl":"https://example.com","imgurl":"https://example.com/a.png","website":""}'

# 受保护接口需先登录拿 cookie
curl -s -c cookies.txt -X POST https://<BLOG_ORIGIN>/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"<USERNAME>","password":"<PASSWORD>"}'
curl -s -b cookies.txt "https://<BLOG_ORIGIN>/api/friend-applications?status=pending"
```

## 注意事项

- **Edge Functions 必须单文件零本地 import**：多模块 import 会触发 545 且无日志（见 `docs/admin-console-plan.md` 坑 12/15）；JWT / KV / 响应封装全部内联。
- **博客侧硬约束**：绝不擅自改动博客前端 class / 样式（见根 `CLAUDE.md`）。
- **友链审核竞态**：通过申请会读改写 `friends_all`；若友链表有未保存草稿，先刷新再编辑，避免覆盖审核通过新写入的友链。
- **构建假成功**：任何部署 / 构建汇报必须先跑真命令看真输出，不凭预期编造。
