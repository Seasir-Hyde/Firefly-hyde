---
title: ChronoFrame 详细部署教程
published: 2026-11-14
pinned: false
description: "ChronoFrame 详细部署教程"
image: "images/xueshan.webp"
slug: /ChronoFrame
# 标签
tags: ["ChronoFrame"]
# 分类
category: 开源项目
draft: false
series: "ChronoFrame 扩展特性"
descriptionSource: ai

---

## ChronoFrame 是什么？

### 项目定位

ChronoFrame 是一个可以自行部署的照片画廊。上传照片后，应用会提取 EXIF、生成预览并整理拍摄地点；访客可以按时间、相册或地图浏览，也能查看大图和播放实况照片

::github{repo="HoshinoSuzumi/chronoframe"}

在线演示：[https://photo.seasir.top/](https://photo.seasir.top/)

## 🐳 部署（推荐）

### Docker Compose部署

Docker Compose 是官方推荐的部署方式，便于管理和维护

- 创建工作目录

```sh
mkdir chronoframe && cd chronoframe
```

在当前目录下创建 `docker-compose.yml` 文件，内容如下：

```yaml
services:
  chronoframe:
    image: ghcr.io/hoshinosuzumi/chronoframe:latest
    container_name: chronoframe
    restart: unless-stopped
    ports:
      - '3000:3000'
    volumes:
      - ./data:/app/data
```

- 启动容器

```sh
docker-compose up -d
```

- 查看运行状态

```sh
docker-compose ps
```

### Docker 命令直接部署

```sh
docker run -d \
  --name chronoframe \
  --restart unless-stopped \
  -p 3000:3000 \
  -v "$(pwd)/data:/app/data" \
  ghcr.io/hoshinosuzumi/chronoframe:latest
```

## 访问
- 容器启动后，访问 `http://你的服务器IP:3000` 进入安装向导
- 输入管理员邮箱，设置管理员密码，确认密码

## 配置域名

- 进入域名托管平台，名称填写 `photo`，添加 A 记录指向你的服务器 IP 地址，配置 DNS 解析，等待解析生效

## 配置反代

- 配置反向代理以便于通过域名访问，进入[极目Linux桌面](https://www.gm.cn/)找到站点管理器，`创建反向代理站点`

- 输入站点名称，填写域名 例如：`photo.seasir.top`，端口：`443`，SSL 开关：`开启`，目标代理地址：填写 `http://127.0.0.1:3000`，其他默认即可

![](https://resource-ai.helplook.net/docker_production/qkknm3s7/article/xik3H9Oz/image_6af82247b2708.png)

## 证书管理

- 证书申请教程可以参考[AllinSSL](https://teek.seasir.top/Tool/AllinSSL)

- 将AllinSSL证书管理的`证书内容（PEM）`和`私钥内容（PEM）`上传到极目Linux桌面，配置 SSL 证书，重启站点
 