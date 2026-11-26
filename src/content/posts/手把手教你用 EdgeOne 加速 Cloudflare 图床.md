---
title: 用 EdgeOne 加速 Cloudflare 图床
published: 2026-11-24
pinned: false

image: "images/xueshan.webp"
slug: /Cloudflare-Image
# 标签
tags: ["EdgeOne", "Cloudflare","ImgBed"]
# 分类
category: 开源项目
draft: false
series: "开源项目"
description: ""
descriptionSource: ai
---

> [!NOTE] 提示
> 本文是在博主 [团子和蛋糕](https://blog.tsh520.cn/) 文章：[手把手教你用 EdgeOne 加速 Cloudflare 图床，国内访问从 8 秒降到 0.15 秒](https://blog.tsh520.cn/posts/%E6%8A%80%E6%9C%AF%E5%88%86%E4%BA%AB/edgeone-accelerate-cloudflare-imgbed/) 基础上增加了自己实践过程的一些细节，转载无需和我联系，但请注明文章来源。如果侵权之处，请联系博主进行删除，谢谢~

## 写在前面
Cloudflare 的服务器节点大多部署在海外，国内用户直接访问 CF‑Workers / CF‑Pages 图床，图片加载经常 2‑8 秒，体验很差。
腾讯云 EdgeOne 在国内拥有大量边缘节点，可以把图片缓存到国内，**缓存命中后图片加载可以做到 0.1~0.2 秒**。

> ⚠️重要前提：开启【中国大陆可用区】加速，**域名必须完成 ICP 备案**；无备案域名只能选择全球（不含中国大陆）可用区，无法享受国内节点加速。

### 加速前后效果对比
|指标|加速前(CF直连)|EdgeOne加速后|
|---|---|---|
|图片加载耗时|2‑8s|0.12‑0.19s|
|图片上传(500KB)|9s|7s|
|首页TTFB|1.0‑1.9s|0.8‑1.0s|

> 缓存命中后图片访问速度提升 **10‑50倍**，上传接口走回源不受CDN缓存影响，提升幅度有限。

### 加速原理
Cloudflare 的服务器主要在海外，国内用户访问要绕一大圈。EdgeOne 是腾讯云的 CDN 服务，在国内有大量节点。
```sh
无加速：浏览器 → 跨网访问海外 Cloudflare 节点 → 返回图片（慢）
EdgeOne 加速：浏览器 → 国内 EdgeOne 边缘节点
├─节点已有缓存 → 直接返回图片
└─无缓存 → EdgeOne 回源请求 Cloudflare 源站，拉取资源缓存后返回给用户
```


## 准备工作
1. **已完成ICP备案的域名**（国内节点加速强制要求）
2. 腾讯云账号，开通 EdgeOne（个人有免费额度可使用）
3. Cloudflare账号，已经部署好图床（Workers 或者 Pages）
4. 获取源站地址：
   - Pages：`xxx.pages.dev`
   - Workers：**不建议直接使用 `xxx.workers.dev`，容易被机房IP风控522**，建议给Worker绑定自定义域名，如`worker-img.example.com`作为回源源站。

> 避坑提醒：`*.workers.dev` 域名对云厂商机房IP风控严格，EdgeOne回源极易出现522连接超时；优先使用Worker绑定的自定义域名作为源站。

## 完整配置步骤
### Cloudflare侧准备
1. 如果是 **Workers图床**
    - Workers → 域 → 添加自定义域名，例如 `worker-imgbed.seasir.top`
    - Cloudflare DNS 会自动添加该子域名记录，**并自动开启橙色云（CF代理开启）**
    - 等待证书签发，浏览器直接访问 `https://worker-imgbed.seasir.top` 确认源站可以正常打开。

2. 如果是 **Pages图床**
    - Pages项目设置复制你的pages源站域名 `xxx.pages.dev`。
    - Pages → Custom Domains，**不要提前绑定对外加速域名，后续EdgeOne回源会处理证书问题**。

### EdgeOne控制台添加加速域名
1. 登录边缘安全加速平台EdgeOne控制台，添加你的主站点，完成域名归属权验证。
2. 左侧菜单：域名管理 → 加速域名 → 添加域名。

填写配置：
|配置项|填写示例|说明|
|---|---|---|
|加速域名|`imgbed.seasir.top`|对外给用户访问的域名|
|IPv6 访问|遵循站点配置| 域名跟着站点的 IPv6 开关走|
|源站配置|`worker-imgbed.seasir.top` / `xxx.pages.dev`|填写你的CF源站域名，**禁止填workers.dev原生域名**|
|回源协议|HTTPS|CF强制https，不能选http|
|回源端口|443|只勾选443端口|
|回源HOST头|使用源站域名|**不要填加速域名！！**，填源站域名，避免重定向循环525、423|
|推荐模板|网站加速| |

提交后EdgeOne会分配CNAME地址，格式：`imgbed.seasir.top.eo.dnse2.com`，复制保存该地址。

> ❗坑：回源HOST如果填写对外加速域名，会触发重定向循环，出现页面重定向过多/423报错。

### 修改DNS解析，指向EdgeOne
回到你的DNS解析后台（Cloudflare DNS），添加/修改记录：
- 记录类型：`CNAME`
- 主机记录：`imgbed`（子域名前缀）
- 记录值：EdgeOne分配的 `imgbed.example.com.eo.dnse2.com`
- ⚠️代理状态：**灰色云朵【仅DNS】，不能开启橙色CF代理！**

保存，等待DNS生效，一般1‑5分钟，部分DNS服务商最长10分钟。

> 验证DNS是否生效，PowerShell执行：
```powershell
nslookup -qt=cname imgbed.example.com
```
## 选择缓存策略

EdgeOne 会根据你选的「网站加速」模板自动配置缓存。你也可以手动调整：

- 图片文件：缓存 30 天
- HTML 页面：缓存 5 分钟
- API 请求：不缓存

## 替换项目中的旧域名
```
find src/content -type f -name "*.md" \
  -exec sed -i 's|https://旧图床地址|https://img.example.com|g' {} +
```

别忘了：

> [!WARNING] 警告
> .env 文件中的图床地址
部署平台（Vercel 等）的环境变量中的图床地址