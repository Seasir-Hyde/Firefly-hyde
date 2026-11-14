---
title: NodeWarden密码管理器
published: 2026-09-17
pinned: false
image: "images/xueshan.webp"

slug: /nodewarden
tags: ["NodeWarden"]
category: 开源项目
draft: false
series: "Cloudflare Workers"
description: "最近想自己折腾密码管理，就盯上了 NodeWarden 这个开源项目。今天就来聊聊我是怎么把它搭起来、日常用起来感觉如何，顺便分享点配置时的踩坑经验。如果你也想把数据安全握在自己手里，不妨跟我一起看看。"
descriptionSource: ai
---

## 一、NodeWarden 是什么？

### 项目定位

一个轻量的 Bitwarden 兼容服务端，支持密码管理、密码同步、密码加密等功能。

::github{repo="shuaiplus/NodeWarden"}


### 1.1 项目背景

密码管理器里，[Bitwarden](https://bitwarden.com/) 是为数不多**客户端和服务端都开源**的产品，但官方服务端部署起来相当重：依赖 Docker、要跑数据库、吃内存，还得有一台 24 小时开机的服务器。

于是社区出现了 [Vaultwarden](https://github.com/dani-garcia/vaultwarden)（Rust 重写的第三方兼容服务端），资源占用大幅降低，但它**依然需要一台 VPS**：你要自己装 Docker、配 HTTPS 证书、盯着更新、记得备份。

[NodeWarden](https://github.com/shuaiplus/NodeWarden) 走了第三条路——**把整个 Bitwarden 兼容服务端直接跑在 Cloudflare Workers 上**。不用买服务器，不用管 SSL，不用做进程守护，Cloudflare 免费额度就够用。项目 2026 年 2 月开源，使用 LGPL-3.0 协议，技术栈为 TypeScript + Preact。

### 1.2 技术架构

NodeWarden 完全构建在 Cloudflare 的免费基础设施之上：

| 组成 | 使用的 Cloudflare 服务 | 作用 |
| ---- | ---- | ---- |
| 计算 | Cloudflare Workers | 无服务器函数，承载全部 API |
| 数据库 | Cloudflare D1 | Cloudflare 版 SQLite，存放账号、密码库元数据等 |
| 附件存储 | R2 或 KV（二选一） | 存放附件、Send 文件 |
| 前端 | Preact 构建的原版 Web Vault | 与官方一致的网页密码库界面，支持 PWA 离线安装 |

最重要的一点：它延续了 Bitwarden 的**零知识（Zero-Knowledge）架构**，加解密全部在你的客户端本地完成，服务端（以及 Cloudflare）拿到的只是密文。即使服务端数据泄露，攻击者没有你的主密码也无法解密。

### 1.3 核心功能

根据官方 README，目前支持的能力包括：

- ✅ **原版 Web Vault 界面**，并支持 PWA 安装、离线使用
- ✅ **官方 Bitwarden 客户端全兼容**：Windows / Linux 桌面端、手机 App、浏览器扩展（macOS 桌面端尚未完全验证）
- ✅ 密码同步、自动填充、实时推送同步（多设备）
- ✅ **TOTP 两步验证**，甚至支持 `steam://` 格式的 Steam 令牌
- ✅ Passkey 无密码登录、YubiKey、2FA 恢复码
- ✅ 附件与 Bitwarden Send（R2 模式单文件最大 100 MB，KV 模式 25 MiB）
- ✅ 导入 / 导出（Bitwarden JSON、CSV、ZIP）
- ✅ **云端备份中心**：定时 WebDAV / S3 增量备份（官方免费版都没有的功能）
- ✅ 设备管理、跨设备登录请求审批
- ✅ API Key、域名规则（等效域名、全局排除）、fill-assist
- ✅ 多用户：通过**邀请码**注册
- ❌ 不支持组织 / 集合 / 成员角色、SSO / SCIM / 企业目录

### 1.4 主要特点

1. **真正零成本**：Workers、D1、KV/R2 都在 Cloudflare 免费额度内，个人使用完全够。
2. **免运维**：没有服务器要维护，HTTPS 证书由 Cloudflare 自动处理，全球边缘节点加速。
3. **部署门槛低**：点点鼠标（Workers Builds）或一行 `npm run deploy` 都能完成，D1 数据表在**首次访问时自动初始化**，不需要手动导入 SQL。
4. **升级省心**：Fork 仓库后在 GitHub 点一下 `Sync fork` 即可；也可以开启仓库自带的 Actions，每天自动同步上游。
5. **数据自持**：所有数据都在你自己的 Cloudflare 账号里。

### 1.5 适用 / 不适用场景

**适合：**

- 想自托管密码库、但不想买 VPS / 折腾 Docker 的个人用户
- 已经在用 Cloudflare、希望一切服务都收敛到一个面板里的人
- 需要手机、电脑、浏览器扩展多端同步，并且看重 TOTP、附件、Send 的用户
- 预算为零的学生党、白嫖党

**不适合：**

- 团队共享密码库（需要组织 / 集合 / 权限角色）——这类需求请用官方 Bitwarden 组织版或 Vaultwarden
- 网络环境无法稳定访问 Cloudflare / `workers.dev` 域名，且没有可接入 Cloudflare 的自定义域名的用户
- 对 macOS 桌面端有强依赖的用户（目前尚未完全验证，可用浏览器扩展替代）

### 1.6 与同类方案对比

| 对比项 | Bitwarden 官方服务端 | Vaultwarden | NodeWarden |
| ---- | ---- | ---- | ---- |
| 语言 | C# | Rust | TypeScript |
| 运行方式 | Docker / VPS | Docker / VPS | Cloudflare Workers（无服务器） |
| 数据库 | SQL Server | SQLite / MySQL / PostgreSQL | Cloudflare D1 |
| 附件 | 本地/对象存储 | 本地文件系统 | R2 或 KV |
| HTTPS | 自行配置 | 自行配置 | Cloudflare 自动签发 |
| 日常维护 | 更新、备份、监控 | 更新、备份、监控 | Fork 同步，全自动 |
| 成本 | 服务器费用 | 服务器费用 | 免费额度内 ¥0 |
| TOTP | 免费版受限 | 支持 | 支持（含 steam://） |
| 组织 / 集合 | ✅ | ✅ | ❌ |

一句话总结：**个人用选 NodeWarden，团队用选 Vaultwarden / 官方版。**

---

## 二、部署前的准备

NodeWarden 提供两种部署方式，二选一即可：

- **方式一：Cloudflare 面板可视化部署（推荐新手）**——全程网页点选，电脑上不用装任何东西；
- **方式二：本地 CLI 部署**——适合熟悉命令行、想本地调试或自定义配置的玩家。

### 2.1 必备账号

| 账号 | 注册地址 | 用途 | 是否需要信用卡 |
| ---- | ---- | ---- | ---- |
| GitHub 账号 | [github.com](https://github.com/) | Fork 源码、后续一键更新 | 否 |
| Cloudflare 账号 | [dash.cloudflare.com](https://dash.cloudflare.com/) | 运行 Worker、D1、KV/R2 | 看存储模式（见下表） |

### 2.2 先选好存储模式：R2 还是 KV？

部署前唯一需要做的决策，是附件存储用 **R2** 还是 **KV**：

| 存储模式 | 是否需要绑信用卡 | 单个附件 / Send 文件上限 | 免费额度 | 部署命令 |
| ---- | ---- | ---- | ---- | ---- |
| **R2（默认，推荐）** | 需要（只是验证，免费额度内不扣款） | 100 MB（软限制，可调） | 10 GB | `npm run deploy` |
| **KV（免信用卡）** | **不需要** | 25 MiB（Cloudflare 硬限制） | 1 GB | `npm run deploy:kv` |

选择建议：

- 只是存密码、偶尔传小附件 → **KV 模式**足矣，免去绑卡；
- 需要传大附件、截图、证件扫描件 → 选 **R2 模式**。

> 💡 密码库本身的文本数据存在 D1，与附件存储互不影响，以后想换模式重新部署即可。

### 2.3 本地 CLI 部署才需要的环境（方式一可跳过本节）

如果你选择面板部署，可以直接跳到[第三章](#三方式一面板可视化部署新手推荐)。CLI 部署需要本机准备：

| 软件 | 版本要求 | 说明 |
| ---- | ---- | ---- |
| Node.js | **18.12+，推荐 20 LTS 或更新** | 带 npm；可在 [nodejs.org](https://nodejs.org/) 下载安装包 |
| Git | 任意较新版本 | 用于拉取源码 |
| Cloudflare 账号 | —— | `wrangler login` 走浏览器授权 |
| 代码编辑器（可选） | VS Code 等 | 想改配置时用 |

验证安装：

```bash
node -v
# 期望输出 v20.x.x（或 >= v18.12）

npm -v
git --version
```

Windows 用户推荐用 PowerShell 或 Windows Terminal；macOS / Linux 直接用终端即可。

---

## 三、方式一：面板可视化部署（新手推荐）

整个流程不需要在本地敲一行命令，只需在两个网页之间操作。

### 第 1 步：Fork 仓库

1. 浏览器打开项目主页：[https://github.com/shuaiplus/NodeWarden](https://github.com/shuaiplus/NodeWarden)
2. 点击页面右上角的 **`Fork`** 按钮；
3. 跳转到创建页面后，仓库名保持默认 `NodeWarden` 即可，`Copy the main branch only` 保持默认勾选，直接点击 **`Create fork`**；
4. 稍等几秒，你会得到一个属于自己的仓库，地址形如 `https://github.com/你的用户名/NodeWarden`。

> 🔑 为什么必须先 Fork？因为 Cloudflare 要连接你自己的仓库来构建；以后更新也全靠这个 Fork（见第七章）。

### 第 2 步：在 Cloudflare 创建 Worker 并连接 GitHub

1. 打开 Cloudflare 创建入口：[Workers & Pages → Create](https://dash.cloudflare.com/?to=/:account/workers-and-pages/create)
2. 在创建页面找到 **`Import a repository`**（导入仓库）/ **`Connect to Git`** 一类入口，点击 **`Continue with GitHub`**；
3. 第一次连接时按提示授权 Cloudflare 访问你的 GitHub，可以只勾选 `NodeWarden` 这一个仓库；
4. 回到选择列表，选中你刚刚 Fork 的 `NodeWarden` 仓库，点击 **`Begin setup`** / 开始设置。

### 第 3 步：填写构建配置

在构建配置页面，按下表填写：

| 配置项 | R2 模式（默认） | KV 模式（免信用卡） |
| ---- | ---- | ---- |
| Project name（项目名） | `nodewarden`（随意，会成为三级域名的一部分） | 同左 |
| Branch（分支） | `main` | `main` |
| Build command（构建命令） | `npm run build` | `npm run build` |
| Deploy command（部署命令） | `npm run deploy` | **`npm run deploy:kv`** |

填好后点击 **`Deploy`**（部署）。

### 第 4 步：等待首次构建完成

1. 保存后会自动跳转到部署日志页，滚动能看到 `npm install → build → deploy` 的过程；
2. 第一次大约需要 1～3 分钟，看到 **`Deployment complete`** / 绿色对勾即为成功；
3. 部署过程中会**自动创建所需的资源绑定**（D1 数据库、R2 存储桶或 KV 命名空间），名字由仓库根目录的 `wrangler.toml`（R2 模式）或 `wrangler.kv.toml`（KV 模式）定义，无需手动新建。

> ⚠️ R2 模式下，如果账号从未开通 R2，日志可能提示你先启用 R2（需要绑定信用卡验证）。按日志里的链接到面板开通后，重新部署一次即可。完全不想绑卡就改用 KV 模式：把部署命令换成 `npm run deploy:kv` 后重新触发部署。

### 第 5 步：设置 JWT_SECRET（必做，最重要的一步）

1. 部署完成后，打开 Worker 的访问地址（如 `https://dash.cloudflare.com/a9d21f407514e204238da710be47c992/workers/services/view/nodewarden/production/settings`）；
2. 页面会提示 **缺少 `JWT_SECRET`**——这是服务端签发登录令牌用的密钥，**必须配置一个强随机值**，且不要使用任何示例值；
3. 生成一个至少 32 位的随机字符串，任选一种方式或者使用`NodeWarden`页面生成的随机串：

**macOS / Linux 终端：**

```bash
openssl rand -base64 24
```

**Windows PowerShell（本机装了 Node.js 时最省事，跨平台通用）：**

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

4. 回到 Cloudflare 面板：进入 **Workers & Pages → 你的 nodewarden 服务 → Settings（设置）→ Variables and Secrets（变量和机密）**；
5. 点击 **`添加变量`**，密钥：`JWT_SECRET`，值值粘贴刚才生成的随机串，然后点击小三角保存，而不是部署，接着点击`编辑`类型选择 **`Secret`（密钥）**，`部署`即可；
6. 保存后 Worker 会自动重新部署，等待几十秒后**刷新**你的站点页面。

> 🔒 `JWT_SECRET` 一定要用 Secret 类型而不是普通文本变量；一旦设置不要随意更换，否则所有已登录设备需要重新登录。请把它和主密码一样妥善保管。

### 第 6 步：按需添加可选变量

同在 **Variables and Secrets** 页面，还可以配置：

| 变量名 | 类型 | 值 | 作用 |
| ---- | ---- | ---- | ---- |
| `HIDE_WEB_VAULT` | Text（文本） | `1` | 隐藏服务器上的网页版密码库（前端页面与静态资源返回 404），客户端 API 照常可用；适合只用桌面/手机 App 的人 |
| `TOTP_SECRET` | Secret | Base32 种子 | 给**登录本身**开启 TOTP 二次验证（见 5.4 节，向导也会给出生成器） |

不需要就全部留空。删除变量或把 `HIDE_WEB_VAULT` 改成非 `1` 的值即可恢复网页版。

### 第 7 步：跟随初始化向导创建账号

再次打开站点，NodeWarden 自带一个初始化向导（Setup），按提示一路 Next：

1. **JWT_SECRET 检查**：通过则继续；
2. **同步策略（可选）**：讲解如何 Fork 同步更新，可先跳过；
3. **创建账号**：填写邮箱、主密码、姓名，注册你的第一个（也是管理员）账号；
4. **登录 TOTP（可选）**：向导会生成一个 Base32 种子和二维码，需要的话先去设置 `TOTP_SECRET`，再用验证器扫码；
5. **完成**：页面显示你的服务器 URL，后续所有 Bitwarden 客户端都填这个地址。

> 👤 主密码是整个密码库的唯一加密密钥，**零知识架构下遗忘无法找回**。建议同时把主密码离线记录在安全的地方。

---

## 四、方式二：本地 CLI 部署

喜欢命令行，或者想在本地先跑起来看看，可以用这种方式。

### 第 1 步：拉取源码并安装依赖

```bash
git clone https://github.com/shuaiplus/NodeWarden.git
cd NodeWarden
npm install
```

### 第 2 步：登录 Cloudflare

```bash
npx wrangler login
```

执行后会自动打开浏览器，登录你的 Cloudflare 账号并点击 **`Allow`** 授权。回到终端看到 `Successfully logged in` 即成功。

### 第 3 步：部署

```bash
# 默认：R2 模式（单附件最大 100 MB，免费 10 GB，账号需绑卡验证 R2）
npm run deploy

# 或者：KV 模式（免信用卡，单文件 25 MiB，免费 1 GB）
npm run deploy:kv
```

部署脚本会自动完成 Worker 发布以及 D1、R2/KV 绑定的创建，日志末尾会输出 Worker 的访问 URL。

### 第 4 步：设置 JWT_SECRET

```bash
# 生成随机密钥
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

# 写入 Secret（执行后粘贴上一步生成的值，回车确认）
npx wrangler secret put JWT_SECRET
```

可选的登录 TOTP 种子同理：

```bash
npx wrangler secret put TOTP_SECRET
```

### 第 5 步：本地开发调试（可选）

```bash
npm run dev       # R2 模式本地开发
npm run dev:kv    # KV 模式本地开发
```

本地调试完成后，再执行 `npm run deploy` 发布即可。

### 4.1 关于权限与配置文件

- 绑定名称统一写在仓库根目录的 `wrangler.toml`（R2）/ `wrangler.kv.toml`（KV）中，**不要随意改动资源名**，否则代码里的绑定会找不到；
- D1 数据表在**第一次请求站点时自动迁移创建**，无需手动上传 SQL；
- CLI 部署默认使用你 wrangler 当前登录的账号（`npx wrangler whoami` 可查看），注意别部署错账号。

---

## 五、客户端接入（部署后必做）

服务跑起来之后，真正日常使用的是 Bitwarden **官方客户端**。NodeWarden 兼容官方客户端，去 [bitwarden.com/download](https://bitwarden.com/download/) 下载你需要的平台即可，已测试通过：Windows 桌面端、Linux 桌面端、手机 App、浏览器扩展。

### 5.1 通用原则：把服务器地址改成你自己的

所有客户端的登录/注册页，都要找到**自托管（Self-hosted）服务器**设置入口，填入：

```text
https://nodewarden.你的子域.workers.dev
```

注意：

- 必须带 `https://`，结尾**不要**加斜杠；
- 填的是你自己的 Worker 域名，不是 `nodewarden.app`，也不是官方地址。

### 5.2 浏览器扩展

1. 打开 Bitwarden 扩展，点击登录页左下角的 **齿轮图标（Settings）**；
2. 在 **Self-hosted environment / 自托管环境** 区域，勾选自定义服务器；
3. Server URL 填入你的 Worker 地址，保存；
4. 回到登录页，点击 **`Create account`（注册账号）**——如果你还没在网页向导注册，也可以直接在这里注册；
5. 用主密码登录，先手动点一次同步，看到密码库出现即为成功。

### 5.3 桌面端 / 手机 App

- **桌面端（Windows / Linux）**：登录窗口左下角同样有齿轮图标，入口与扩展一致；
- **手机 App**：登录页点击右上角/左下角的 **设置（齿轮）**，找到「自托管服务器」，填入地址后保存，再登录。

### 5.4（可选）给登录开启 TOTP 两步验证

1. 先在 Worker 的 Variables and Secrets 中添加 `TOTP_SECRET`（初始化向导会提供一个 Base32 种子与二维码）；
2. 用 Google Authenticator、Authy、2FAS 等验证器扫描二维码；
3. 以后在新设备登录时，除主密码外还需输入 6 位动态码。

这与密码库条目的 TOTP 是两回事：前者保护**账号登录**，后者用来自动填充其他网站的验证码。

### 5.5 绑定自定义域名（可选，但国内网络建议配置）

`workers.dev` 默认域名在部分网络环境下可能无法直连。如果你的域名已接入 Cloudflare：

1. 进入 **Workers & Pages → nodewarden → Settings → Domains & Routes**；
2. 添加一个你自己的子域名，例如 `vault.example.com`；
3. 证书自动签发，等一两分钟生效；
4. 把客户端里的服务器地址换成新域名。

---

## 六、部署后的验证清单

按下面清单逐项确认，全部通过说明部署完整可用：

- [ ] 浏览器打开 Worker 域名，能正常显示 Web Vault 登录页，而不是 `缺少 JWT_SECRET` 报错；
- [ ] 初始化向导中 `JWT_SECRET check passed`；
- [ ] 成功注册账号并登录网页版，能新建一条密码条目；
- [ ] Cloudflare 面板中确认 D1 数据库已自动建好表（D1 → 选择数据库 → Console，可见若干数据表）；
- [ ] 至少一个官方客户端（扩展或手机 App）配置自托管地址后**登录成功**；
- [ ] 在一端新增/修改一条密码，另一端点「同步」后能**实时看到变更**；
- [ ] 上传一个附件（R2 模式可传较大文件，KV 模式控制在 25 MiB 内）并能下载；
- [ ] （可选）开启 TOTP 的账号重新登录一次，验证动态码流程；
- [ ] 退出登录后，确认未登录状态无法查看任何密码库数据。

也可以用「导出加密备份 → 新建测试条目 → 删除 → 重新导入」的方式，熟悉一遍导入导出流程，确保以后迁移心里有底。

---

## 七、如何升级到新版本

NodeWarden 更新很活跃，升级有两种方式。

### 7.1 手动更新（推荐先看 changelog）

1. 打开你 Fork 的 GitHub 仓库主页；
2. 文件列表上方若出现 **`This branch is behind ...`** 提示条，点击 **`Sync fork`**；
3. 点击 **`Update branch`**，等待几秒；
4. 因为你的 Worker 连接了这个 Fork，同步提交会**自动触发 Cloudflare 重新构建部署**，去 Cloudflare 部署日志页确认成功即可。

### 7.2 自动更新

仓库自带了每日同步上游的 GitHub Actions 工作流：

1. 进入你的 Fork → **`Actions`** 标签页；
2. 点击绿色按钮 **`I understand my workflows, go ahead and enable them`**；
3. 默认每天 **03:00** 自动检查并同步；也可以随时点击对应工作流 → **`Run workflow`** 立即执行。

> 建议大版本更新前先去 [Releases 页面](https://github.com/shuaiplus/NodeWarden/releases)看一眼 changelog，确认是否有需要手动处理的变更。

### 7.3 从一键部署示例仓库换成自己的 Fork

如果你最初是通过别人给的一键部署按钮创建的服务，需要先解绑示例仓库：Cloudflare 面板 → 你的服务 → **Settings → Builds and deployments → Source code**，解除当前绑定后，重新绑定你自己的 Fork，之后才能正常收到更新。

---

## 八、常见问题（FAQ）

**Q1：打开站点一直提示缺少 `JWT_SECRET`？**
确认变量名拼写完全一致（全大写、下划线），类型是 **Secret**；保存后等 Worker 自动重新部署完成（约几十秒），再强制刷新页面（Ctrl/Cmd + Shift + R）。

**Q2：客户端无法登录 / 一直转圈 / 同步失败？**
依次排查：① 服务器地址是否带 `https://` 且结尾无多余斜杠；② 浏览器能否正常打开该地址；③ 当前网络能否访问 `workers.dev`，不行就绑自定义域名；④ 客户端是否为官方 Bitwarden 客户端（第三方兼容客户端未测试）。

**Q3：KV 模式下附件上传失败？**
KV 单值有 **25 MiB 硬限制**，超过必然失败。请改传小文件，或重新部署为 R2 模式（附件上限 100 MB）。

**Q4：需要手动建数据库表吗？**
不需要。D1 的表结构在**首次访问站点时自动迁移创建**。只要 D1 绑定正确即可，不要手动执行来历不明的 SQL。

**Q5：主密码忘了怎么办？**
没有办法。零知识加密意味着服务端不保存、也无法验证你的主密码内容，官方与作者都无法帮你找回。只能凭记忆恢复，或清空数据重新开始（所以从其他密码管理器迁移前，务必保留旧库一段时间）。

**Q6：可以多人一起用吗？**
支持通过**邀请码**注册多个普通用户，但没有组织、集合、角色权限体系，适合家人各自独立使用，不适合团队共享密码库。

**Q7：部署时 R2 开通失败 / 不想绑信用卡？**
直接改用 KV 模式：面板部署把部署命令改成 `npm run deploy:kv`；CLI 则执行 `npm run deploy:kv`。

**Q8：隐藏 Web Vault 后客户端还能用吗？**
可以。设置 `HIDE_WEB_VAULT=1` 后，服务器上的前端页面和静态资源返回 404，但登录、同步、附件、图标、通知等客户端 API 全部正常；已安装的 PWA 也能继续使用本地缓存的前端。

**Q9：数据怎么做备份？**
NodeWarden 内置「云端备份中心」，支持定时向 **WebDAV / S3** 目标做增量备份，在 Web Vault 设置中配置即可。此外也建议定期用官方客户端导出一份加密 JSON/ZIP 存档，异地保存。

**Q10：日志里出现语言高亮、构建警告怎么办？**
构建日志中的 npm warning、代码块语言 fallback 提示一般不影响运行；只有出现红色 `Error` 且部署状态为 Failed 时才需要处理，重点检查构建/部署命令是否按第三章的表格填写。

---

## 九、小结

NodeWarden 把「自托管 Bitwarden」的最后一点门槛也抹掉了：**一台服务器都不用买，免费额度就能拥有完整的多端密码同步体验**。整个部署过程可以概括为：

```text
Fork 仓库 → Cloudflare 连接 GitHub → 填 build/deploy 命令
→ 设置 JWT_SECRET → 打开域名注册账号 → 官方客户端填入地址
```

数据在自己的 Cloudflare 账号里、加解密在自己的设备上完成，再加上 WebDAV/S3 增量备份，个人密码资产的自主性和安全性都拉满了。唯一需要你牢记的，就是那个**无法找回的主密码**——设好之后，先备份，再使用。

祝大家用得安心，永不脱库 🔐

> 参考资料：[NodeWarden GitHub 仓库](https://github.com/shuaiplus/NodeWarden) · [官方 Wiki](https://nodewarden.app/) · [Cloudflare Workers 文档](https://workers.cloudflare.com/) · [Bitwarden 客户端下载](https://bitwarden.com/download/)
