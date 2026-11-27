---
title: Edgeone-Imgbed 完整部署教程
published: 2026-11-26
pinned: false
image: "api"
slug: /edgeone-imgbed-deploy
tags: ["EdgeOne", "图床"]
category: 开源项目
draft: false
series: "开源项目"
description: "Edgeone-Imgbed 是一个基于腾讯云 EdgeOne Pages 与 CNB 对象存储构建的轻量级无服务器图床，零成本部署、全球 CDN 加速，支持多存储桶、PicGo 客户端和在线设置同步。本文从环境准备、依赖安装、配置修改到服务启动验证，完整覆盖部署全流程。"
descriptionSource: ai
---

## 一、项目简介

### 1.1 项目定位

Edgeone-Imgbed（CNB 图床）是一个轻量级、无服务器的图片托管服务。它基于腾讯云 **EdgeOne Pages** 与 **CNB 对象存储**构建，实现了零成本部署与全球 CDN 加速，同时支持多存储桶（S3 兼容）与在线设置同步。

::github{repo="Jacky088/Edgeone-Imgbed"}

项目采用纯前端 + 边缘函数的架构，无需购买服务器、无需管理运行时，所有计算与存储均由 EdgeOne 和 CNB 托管，个人使用完全免费。

### 1.2 技术架构

| 组成 | 技术选型 | 作用 |
| ---- | ---- | ---- |
| 前端 | Vue 3 + TypeScript + Vite + TailwindCSS | 上传界面、图片管理、设置页 |
| 后端 | EdgeOne Pages Node Functions（Express） | 上传 API、图片代理、鉴权、限流 |
| 边缘函数 | EdgeOne Pages Functions | KV 记录读写（`functions/image-records`） |
| 存储 | CNB 对象存储（默认）+ 任意 S3 兼容桶 | 存放图片文件 |
| 数据库 | EdgeOne KV | 全量索引 + 超限自动分片 + 服务端分页 |

### 1.3 核心功能

- **上传**：拖拽 / 点击 / Ctrl+V 粘贴 / 整个文件夹递归上传，批量多选；兼容 PicGo 客户端
- **压缩**：浏览器端 WebP 压缩（质量、长边可调）；GIF 自动跳过以保留动画
- **多存储桶**：默认 CNB，可添加任意 S3 兼容桶（R2 / OSS / COS / MinIO），每桶可设空间配额
- **链接**：一键复制直链 / Markdown / HTML / BBCode（单张与批量），结果卡自带二维码
- **图片列表**：搜索、排序、筛选、多选批量操作、JSON 备份导入导出、键盘快捷键
- **两级删除**：删除进回收站（30 天可恢复），彻底删除联动清理源文件
- **安全**：访问密码保护（可选）、HMAC 签名令牌、接口限流

### 1.4 适用场景

- 需要自建图床、但不想买 VPS 或折腾 Docker 的个人用户
- 已经在用 EdgeOne / CNB 生态，希望所有服务收敛到一个面板
- 博客作者、开发者需要批量管理图片并生成 Markdown 链接
- 预算为零的学生党、白嫖党

---

## 二、前置依赖清单

在开始部署前，请确认以下环境与服务已经就绪：

### 2.1 账号与服务依赖

| 依赖项 | 说明 | 注册地址 |
| ---- | ---- | ---- |
| GitHub 账号 | Fork 仓库并触发自动部署 | [github.com](https://github.com) |
| 腾讯云 EdgeOne 账号 | 承载 Pages 部署、Node Functions、KV | [console.cloud.tencent.com/edgeone](https://console.cloud.tencent.com/edgeone) |
| CNB 账号 | 提供对象存储仓库（图床数据源） | [cnb.cool](https://cnb.cool) |

> 国际版用户可使用 [edgeone.ai](https://edgeone.ai)（面向海外，无需腾讯云账号）。

### 2.2 本地开发环境（可选，仅本地调试需要）

| 依赖项 | 版本要求 | 安装方式 | 说明 |
| ---- | ---- | ---- | ---- |
| Node.js | `^20.19.0` 或 `>=22.12.0` | [官网](https://nodejs.org/) 或 nvm/fnm 管理 | 项目 `engines` 字段严格指定；Node 22.12+ 推荐 |
| pnpm | `10.18.2` | `npm install -g pnpm@10.18.2` | 项目 `packageManager` 字段锁定版本 |
| Git | 任意较新版本 | 系统自带或 [git-scm.com](https://git-scm.com) | 用于克隆 / Fork 仓库 |

> 如果你选择纯云端一键部署（无需本地开发），则**不需要**安装 Node.js 和 pnpm，EdgeOne 控制台会在云端自动构建。

可通过以下命令验证本地环境：

```bash
node -v      # 应输出 v20.19.x 或 v22.12.x 及以上
pnpm -v      # 应输出 10.18.2
git --version
```

### 2.3 关键依赖版本一览

| 依赖 | 版本 | 类别 |
| ---- | ---- | ---- |
| vue | ^3.5.22 | 运行时 |
| express | ^5.1.0 | 后端框架 |
| tailwindcss | ^4.1.14 | 样式 |
| vite（rolldown-vite） | npm:rolldown-vite@7.1.15 | 构建工具 |
| typescript | ~5.9.0 | 类型 |
| vue-tsc | ^3.1.0 | 前端类型检查 |
| vitest | ^5.0.2 | 单元测试 |
| @edgeone/pages-blob | ^0.0.18 | EdgeOne Blob SDK |

---

## 三、部署前准备

### 3.1 Fork 项目仓库

1. 打开 [https://github.com/Jacky088/Edgeone-Imgbed](https://github.com/Jacky088/Edgeone-Imgbed)
2. 点击右上角 **Fork** 按钮，将仓库复制到你自己的 GitHub 账号下
3. 保持仓库名称不变（默认 `Edgeone-Imgbed`），点击 **Create fork**

> 后续所有环境变量、KV 绑定均在 EdgeOne 控制台配置，**不需要**在本地修改任何代码。

### 3.2 创建 CNB 对象存储仓库

CNB 对象存储是本项目的默认图片存储后端，需要先准备好仓库：

1. 登录 [CNB 官网](https://cnb.cool/)
2. 点击右上角 **新建仓库**（New Repository）
3. 填写仓库名，例如 `imgbed-storage`
4. **关键设置**：将仓库可见性设为 **公开（Public）**——否则图片直链无法被外部访问
5. 完成创建后，记录下你的仓库路径，格式为 `用户名/仓库名`，例如 `W3C/Hyde/Edgeone-Imgbed`
6. 这个路径就是后续环境变量 `SLUG_IMG` 的值

> ⚠️ **CNB 仓库单张图片最大支持 5MB**，超过此大小的图片会被拒绝上传。如需要更大文件，可在部署后于设置页接入其他 S3 兼容桶（R2 / OSS / COS / MinIO）。

### 3.3 获取 CNB 访问令牌

1. 登录 CNB 官网，点击右上角头像 → **个人设置**
2. 左侧菜单选择 **访问令牌**（Access Tokens）
3. 点击 **生成新令牌**
4. 按下表勾选所需权限：

| 权限 | 说明 | 依赖的功能 |
| ---- | ---- | ---- |
| `repo-code:rw` | 仓库代码读写 | **上传图片（基础必需）** |
| `repo-manage:rw` | 仓库管理读写（包含只读能力） | 孤儿扫描与总量统计（最低 `:r`）；删除源文件（需 `:rw`） |
| `group-resource:r` | 组织资源只读 | 侧栏存储用量与配额实测（组织级接口） |

5. **资源范围**必须选择 **全部** 或 **指定组织**——若选「指定仓库」，`group-resource:r` 将无法勾选，存储卡会显示 403
6. 生成后立即复制 Token（只展示一次），这就是后续环境变量 `TOKEN_IMG` 的值

> 💡 最小可用配置：仅勾选 `repo-code:rw` 即可完成上传。其余权限缺失时，对应功能会显示明确提示，不影响基础上传。

---

## 四、一键部署（推荐）

### 4.1 通过 EdgeOne 控制台创建项目

[![点击使用国内版EdgeOne Pages 部署](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://console.cloud.tencent.com/edgeone/pages/new?repository-url=https%3A%2F%2Fgithub.com%2FJacky088%2FEdgeone-Imgbed%2F)


[![点击使用国际版EdgeOne Pages 部署](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://edgeone.ai/pages/new?repository-url=https%3A%2F%2Fgithub.com%2FJacky088%2FEdgeone-Imgbed%2F)

或手动操作：

1. 进入 EdgeOne Pages 控制台 → **创建项目**
2. 选择 **导入现有 Git 仓库**
3. 授权并选择你刚 Fork 的 `Edgeone-Imgbed` 仓库
4. 加速区域选择 **全球可用区 （含中国大陆）**
5. 仓库属性选择 **公共**
6. 点击 **立即部署**，等待首次构建完成（约 1-3 分钟）

### 4.2 配置环境变量

在 EdgeOne 控制台进入项目 → **设置** → **环境变量**，添加以下变量：

| 变量名 | 是否必填 | 示例值 | 说明 |
| ---- | ---- | ---- | ---- |
| `BASE_IMG_URL` | **必填** | `https://img.example.com/` | 图床图片访问域名，**必须以 `/` 结尾** |
| `SLUG_IMG` | **必填** | `W3C/Hyde/Edgeone-Imgbed` | CNB 仓库名（用户名/仓库名）如果不在W3C组织下去掉即可 |
| `TOKEN_IMG` | **必填** | `cnb_xxxxxxxxxxxx` | 第三步获取的 CNB 访问令牌 |
| `AUTH_SECRET` | **多桶时必填** | 随机长字符串 | 令牌与内部接口签名密钥；修改后所有登录令牌立即失效 |
| `SITE_PASSWORD` | 可选 | `my-strong-pwd` | 站点访问密码；不设则免登录直达 |
| `PICGO_TOKEN` | 可选 | `picgo-token-123` | 启用 `/api/upload/picgo` 接口 |
| `MAX_UPLOAD_MB` | 可选 | `25` | 单文件大小上限（默认 25，最大 100；CNB 仓库限 5MB） |
| `UPLOAD_RATE_LIMIT` | 可选 | `120` | 上传限流（次/分钟/IP，默认 120） |

> ⚠️ `BASE_IMG_URL` 建议填写后续绑定的自定义域名，或使用 EdgeOne 分配的默认 `*.edgeone.app` 域名（同样需以 `/` 结尾）。

### 4.3 绑定 KV 命名空间（上传记录必需）

项目使用 EdgeOne KV 存储图片上传索引，**必须手动绑定**：

1. 在 EdgeOne 控制台进入 **存储 → KV**，点击 **开通**（如未开通）
2. 点击 **创建命名空间**，名称例如 `cnb-imgbed-records`
3. 回到你的 Pages 项目 → **设置 → 环境变量** → 找到 **KV 绑定**
4. 新增绑定：变量名**必须**为 `IMG_RECORDS_KV`，值选择刚创建的命名空间
5. 保存后**重新部署**一次项目，使 KV 绑定生效

> 没有绑定 KV，上传后记录将无法保存，图片列表为空。这是首次部署最容易遗漏的一步。

---

## 五、本地开发调试（可选）

如果你需要在本地修改代码或调试，可按以下步骤运行：

### 5.1 克隆仓库并安装依赖

```bash
# 克隆你 Fork 的仓库
git clone https://github.com/你的用户名/Edgeone-Imgbed.git
cd Edgeone-Imgbed

# 安装依赖（项目锁定 pnpm 版本）
pnpm install
```

### 5.2 启动开发服务器

项目需要同时运行前端 Vite 和本地 API 模拟服务器：

```bash
# 终端 1：启动前端开发服务器（http://localhost:5173）
pnpm dev

# 终端 2：启动本地 API + 边缘函数模拟器 + S3 Mock（http://localhost:8788）
pnpm dev:api
```

Vite 配置已内置代理，`/api` 和 `/image-records` 请求会自动转发到 `http://localhost:8788`，无需额外配置：

```ts
// vite.config.ts 中的代理配置（已内置）
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:8788',
      changeOrigin: true,
    },
    '/image-records': {
      target: 'http://localhost:8788',
      changeOrigin: true,
    },
  },
},
```

### 5.3 质量检查命令

在本地提交代码前，建议运行以下检查：

```bash
pnpm lint            # ESLint 检查并自动修复
pnpm type-check      # 前端 vue-tsc 类型检查
pnpm type-check:node # 后端 Node Functions tsc 类型检查
pnpm test            # Vitest 单元测试（含 SigV4 官方向量、KV 集成逻辑）
```

### 5.4 本地构建

```bash
# 完整构建（先类型检查，再 Vite 打包）
pnpm build

# 预览构建产物
pnpm preview
```

---

## 六、绑定自定义域名（可选但推荐）

### 6.1 添加域名

1. 在 EdgeOne 项目 → **域名管理** → **添加自定义域名**
2. 输入你想要的域名，例如 `img.example.com`
3. 按提示在你的 DNS 服务商处添加 CNAME 记录，指向 EdgeOne 提供的目标域名

### 6.2 更新环境变量

域名生效后，回到项目 **环境变量** 设置，将 `BASE_IMG_URL` 更新为新的自定义域名（同样以 `/` 结尾）：

```
BASE_IMG_URL=https://img.example.com/
```

保存后重新部署，使配置生效。

### 6.3 图片仓库公开访问确认

确保 CNB 仓库为公开状态，否则通过 `BASE_IMG_URL` 的图片直链会返回 403。

---

## 七、部署后功能验证

### 7.1 基础访问验证

1. 打开部署后的站点域名（例如 `https://img.example.com`）
2. 若设置了 `SITE_PASSWORD`，应先跳转到密码输入页，输入密码后进入上传页
3. 若未设密码，应直接进入上传界面——首屏不阻塞加载（通过 `/api/auth/status` 探测）

### 7.2 上传功能验证

1. 在上传页拖拽或点击选择一张图片（建议 < 5MB 的 JPG / PNG / WebP / GIF）
2. 观察是否触发浏览器端 WebP 压缩（GIF 应跳过压缩保留动画）
3. 上传成功后，结果卡片应显示：
   - 图片预览
   - 直链 / Markdown / HTML / BBCode 四种格式的复制按钮
   - 二维码
4. 点击复制直链，在新标签页打开，确认图片可正常访问

### 7.3 图片列表与记录验证

1. 进入 **图片列表** 页面
2. 确认刚上传的图片已出现在列表中（说明 KV 记录保存成功）
3. 尝试搜索、排序、筛选功能
4. 若列表为空但上传提示成功，说明 **KV 命名空间未绑定**，回到第 4.3 节检查

### 7.4 删除与回收站验证

1. 在图片列表选中一张图片，点击 **删除**
2. 确认图片移入回收站（30 天内可恢复），源文件仍在 CNB 仓库中
3. 进入回收站，对图片执行 **彻底删除**，确认 CNB 仓库中的源文件被联动清理

### 7.5 PicGo 接口验证（如配置了 PICGO_TOKEN）

配置了 `PICGO_TOKEN` 后，可通过命令行快速验证接口是否可用：

```bash
# 使用 curl 模拟 PicGo 上传（替换为你的域名和 token）
curl -X POST https://img.example.com/api/upload/picgo \
  -H "Authorization: Basic $(echo -n 'api:你的PICGO_TOKEN' | base64)" \
  -F "file=@/path/to/test.png"
```

返回 JSON 中 `result[0]` 应为图片直链地址。

### 7.6 PicGo 客户端配置（可选）

在 PicGo 中安装「自定义 Web 图床」插件，按以下参数填写：

| 配置项 | 值 |
| ---- | ---- |
| API 地址 | `https://img.example.com/api/upload/picgo` |
| 请求方式 | POST |
| 自定义请求头 | `Authorization: Basic base64("api:你的PICGO_TOKEN")` |
| JSON 路径 | `result[0]` |

---

## 八、常见问题排查

### Q1：首次部署后上传图片报错 401 / 403

**原因**：`TOKEN_IMG` 未配置或权限不足。

**排查**：
1. 检查环境变量 `TOKEN_IMG` 是否正确填写，是否与 CNB 个人设置中生成的令牌一致
2. 确认令牌至少勾选了 `repo-code:rw` 权限
3. 确认 CNB 仓库路径 `SLUG_IMG` 格式为 `用户名/仓库名`，无多余斜杠
4. 修改环境变量后需**重新部署**项目才生效

### Q2：图片列表为空，但上传提示成功

**原因**：KV 命名空间未绑定或变量名不匹配。

**排查**：
1. 在 EdgeOne 控制台确认已开通 KV 服务
2. 检查项目的 KV 绑定变量名是否为 **`IMG_RECORDS_KV`**（区分大小写，不能错）
3. 绑定后是否已重新部署

### Q3：图片直链无法打开，返回 403

**原因**：CNB 仓库未设为公开。

**排查**：
1. 登录 CNB 官网，进入对应仓库 → **设置** → 将可见性改为 **公开**
2. 确认 `BASE_IMG_URL` 以 `/` 结尾，且与自定义域名或 EdgeOne 默认域名一致
3. 检查 `BASE_IMG_URL` 与实际访问域名是否匹配（`/api/img` 代理会强制同源校验，避免 SSRF）

### Q4：上传超过 5MB 的图片被拒绝

**原因**：CNB 仓库单图上限为 5MB。

**解决**：
1. 若仍使用 CNB 存储，需在设置页开启浏览器端 WebP 压缩以减小体积
2. 或在设置页接入其他 S3 兼容桶（R2 / OSS / COS / MinIO），无 5MB 限制
3. 如需调大上限，设置 `MAX_UPLOAD_MB` 环境变量（默认 25，最大 100），但 CNB 仓库仍受 5MB 硬限制

### Q5：侧栏存储卡显示 403

**原因**：CNB 令牌的 `group-resource:r` 权限缺失或资源范围选择错误。

**排查**：
1. 编辑 CNB 访问令牌，将 **资源范围** 改为 **全部** 或 **指定组织**（选「指定仓库」时无法勾选 `group-resource:r`）
2. 保存并更新 `TOKEN_IMG` 环境变量，重新部署

### Q6：本地 `pnpm dev` 启动后接口请求失败

**原因**：未同时启动 `pnpm dev:api`。

**排查**：
1. 确认终端 2 已运行 `pnpm dev:api`，监听 `8788` 端口
2. 检查是否有端口占用：`netstat -ano | findstr 8788`
3. Vite 代理配置已内置，无需额外修改

### Q7：修改环境变量后配置不生效

**原因**：EdgeOne Pages 的环境变量和 KV 绑定在部署时注入，运行时修改不会自动更新。

**解决**：
1. 在控制台手动触发一次 **重新部署**（Redeploy）
2. 确认新部署的版本号已更新（在部署历史中查看）

### Q8：前端构建报错 `node: not found` 或 engines 警告

**原因**：EdgeOne 构建环境的 Node 版本不满足 `^20.19.0 || >=22.12.0`。

**解决**：
1. 在 EdgeOne 项目设置中找到 **Node 版本** 配置
2. 选择 Node 20.19+ 或 Node 22.12+
3. 重新部署

### Q9：PicGo 接口返回 401

**原因**：未配置 `PICGO_TOKEN` 或请求头格式错误。

**排查**：
1. 确认已设置 `PICGO_TOKEN` 环境变量并重新部署
2. 请求头格式必须为 `Authorization: Basic base64("api:你的PICGO_TOKEN")`
3. 注意 base64 编码的字符串是 `api:你的token`（含 `api:` 前缀）

---

## 九、生产环境优化建议

### 9.1 安全加固

- **必须设置 `AUTH_SECRET`**：使用多存储桶功能时必填，建议生成 32 位以上随机字符串。口令泄露时可通过修改此密钥强制所有设备下线
- **设置 `SITE_PASSWORD`**：避免公开访问导致图片被任意上传刷爆配额
- **定期轮换 CNB Token**：在 CNB 个人设置中重新生成令牌，更新环境变量后重新部署
- **合理设置 `UPLOAD_RATE_LIMIT`**：默认 120 次/分钟/IP，公开站点建议适当调低
- CORS / CSP 安全头已内置强化（v1.4.1+），无需额外配置

### 9.2 缓存与性能

- **自定义域名 + EdgeOne CDN**：静态资源（`/_astro/*`、图片）自动享受全球边缘缓存
- 图片代理支持 **ETag 304 条件缓存** 与 **HEAD 请求**，减少重复带宽消耗
- 浏览器端 WebP 压缩在上传时完成，减轻存储与带宽压力

### 9.3 存储与配额管理

- 在设置页为每个 S3 桶设置空间配额（GB），累计用量超 80% 橙色、超 90% 红色告警，超额自动拒绝上传
- 定期进入 **孤儿清理** 页面（仅 CNB），对比平台资产清单与上传记录，一键清理无引用的残留文件
- 利用图片列表的 **JSON 备份导出** 功能定期备份上传记录

### 9.4 运维监控

- 在 EdgeOne 控制台查看 **部署日志** 与 **运行时日志**，排查上传 / 代理异常
- 关注 **用量统计**：CNB 接官方接口实测，S3 桶按乐观计账估算
- 回收站内图片 30 天后自动清理源文件，注意定期检查

### 9.5 升级维护

1. 定期在你 Fork 的仓库页面点击 **Sync fork** 同步上游更新
2. 同步后 EdgeOne 会自动触发重新部署
3. 升级前建议在本地运行 `pnpm test` 验证单元测试通过
4. 重大版本（如 v1.7.0 多存储桶）升级后，检查 `AUTH_SECRET` 是否已配置

### 9.6 备份策略

- **上传记录**：通过图片列表的 JSON 导出功能定期备份
- **图片文件**：CNB 仓库本身就是 Git 仓库，可定期 `git clone --mirror` 备份
- **KV 数据**：EdgeOne KV 暂不支持直接导出，建议依赖 JSON 导出作为备份手段

---

## 十、总结

Edgeone-Imgbed 的核心优势在于**零成本、免运维、全球加速**：

| 对比维度 | 传统 VPS 图床 | Edgeone-Imgbed |
| ---- | ---- | ---- |
| 服务器费用 | 每月 ¥30+ | 0（免费额度内） |
| SSL 证书 | 需手动配置 | EdgeOne 自动签发 |
| CDN 加速 | 需额外接入 | 内置全球节点 |
| 运维负担 | 进程守护、磁盘清理 | 完全托管 |
| 部署时间 | 数小时 | 10 分钟 |

按照本教程，即使是只有基础技术能力的用户，也能在 10-15 分钟内完成从零到上线的全部流程。如有问题，优先查阅官方 README 与 EdgeOne 控制台日志。
