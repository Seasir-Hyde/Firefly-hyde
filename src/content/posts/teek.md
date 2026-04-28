---
title: 快速开始
published: 2026-04-28
description: Teek 是一个轻量、简洁高效、灵活配置、易于扩展的 VitePress 主题 ✨，是在默认主题的基础上进行拓展，支持 VitePress 的所有功能、配置，完全可以零成本迁移过来。使用 Teek 可以很方便的搭建一个结构化的知识库或博客。
image: ./images/hyde3.avif
tags: [vitepress, teek]
category: vitepress
draft: false
---

## 版本

[![Teek badge](https://img.shields.io/npm/v/vitepress-theme-teek.svg?style=flat-square)](https://www.npmjs.org/package/vitepress-theme-teek)

## VitePress 安装

### 前置准备 {#prerequisites}

- [Node.js](https://nodejs.org/) 18 及以上版本。
- 通过命令行界面 (CLI) 访问 VitePress 的终端。
- 支持 [Markdown](https://en.wikipedia.org/wiki/Markdown) 语法的编辑器。
- 推荐 [VSCode](https://code.visualstudio.com/) 及其[官方 Vue 扩展](https://marketplace.visualstudio.com/items?itemName=Vue.volar)。

VitePress 可以单独使用，也可以安装到现有项目中。在这两种情况下，都可以使用以下方式安装它：

::: code-group

```sh [pnpm]
$ pnpm add -D vitepress
```

```sh [npm]
$ npm add -D vitepress
```

```sh [yarn]
$ yarn add -D vitepress
```

```sh [yarn (pnp)]
$ yarn add -D vitepress vue
```

```sh [bun]
$ bun add -D vitepress
```

:::

### 安装向导 {#setup-wizard}

VitePress 附带一个命令行设置向导，可以帮助你构建一个基本项目。安装后，通过运行以下命令启动向导：

::: code-group

```sh [pnpm]
$ pnpm vitepress init
```

```sh [npm]
$ npx vitepress init
```

```sh [yarn]
$ yarn vitepress init
```

```sh [bun]
$ bun vitepress init
```

:::

将需要回答几个简单的问题：

```md
┌ Welcome to VitePress!
│
◇ Where should VitePress initialize the config?
│ ./docs
│
◇ Where should VitePress look for your markdown files?
│ ./docs
│
◇ Site title:
│ My Awesome Project
│
◇ Site description:
│ A VitePress Site
│
◇ Theme:
│ Default Theme
│
◇ Use TypeScript for config and theme files?
│ Yes
│
◇ Add VitePress npm scripts to package.json?
│ Yes
│
◇ Add a prefix for VitePress npm scripts?
│ Yes
│
◇ Prefix for VitePress npm scripts:
│ docs
│
└ Done! Now run pnpm run docs:dev and start writing.
```

## 在线安装<Badge type="tip" text="推荐" />

建议使用如下包管理器安装 `vitepress-theme-teek`：

- [pnpm](https://pnpm.io/)<Badge type="tip" text="推荐" />
- [yarn](https://classic.yarnpkg.com/lang/en/)
- [npm](https://www.npmjs.com/)

::: code-group

```sh [pnpm]
pnpm install vitepress-theme-teek -D
```

```sh [yarn]
yarn add vitepress-theme-teek -D
```

```sh [npm]
npm install vitepress-theme-teek -D
```

:::

## 在线与本地区别

如果想要基于 Teek 二次开发，自定义自己的风格，那么请采用本地安装方式。

Teek 不定期提供新特性或者修复 Bug，如果想要及时享用，那么请采用在线安装方式，届时只需要更新版本即可：

::: code-group

```sh [pnpm]
pnpm install vitepress-theme-teek@latest -D
```

```sh [yarn]
yarn add vitepress-theme-teek@latest -D
```

```sh [npm]
npm install vitepress-theme-teek@latest -D
```

:::

## 引入主题

根据 Vitepress 的要求，需要在 `.vitepress/theme/index.ts` 文件中引入 Teek 主题。如果没有该路径，需要先创建它。

```bash
cd docs\.vitepress
mkdir theme
```

```ts
import Teek from "vitepress-theme-teek";
import "vitepress-theme-teek/index.css";

export default {
  extends: Teek,
};
```

然后在 .vitepress/config.ts 文件中引入 Teek 的配置信息：

```ts
// .vitepress/config.mts
import { defineConfig } from "vitepress";
import { defineTeekConfig } from "vitepress-theme-teek/config";

// Teek 主题配置
const teekConfig = defineTeekConfig({});

// VitePress 配置
export default defineConfig({
  extends: teekConfig,
  // ...
});
```

## 安装依赖

::: tip 提示
`vue`是必须安装的；其他可选;
:::

```bash{2}
# 可选
pnpm install @waline/client @giscus/vue artalk -D #安装评论插件
pnpm add -D @mdit-vue/shared #安装 mdit-vue 共享模块,茂茂导航插件需要用
pnpm add -D canvas-confetti  # 安装 canvas 五彩纸屑动画库
pnpm add -D nprogress-v2  # 安装 nprogress-v2 进度条插件
pnpm add -D rollup-plugin-visualizer  # 安装 rollup 可视化插件
pnpm add -D terser  # 安装 terser 代码压缩工具
pnpm add -D vitepress-markdown-timeline  # 安装 vitepress 的 markdown 时间线插件
pnpm add -D vitepress-plugin-group-icons  # 安装 vitepress 的图标分组插件
pnpm add -D @vueuse/core  # 安装 VueUse 工具库
pnpm add -D oh-my-live2d  # 安装 oh-my-live2d 看板娘插件
pnpm add -D parallax-js  # 安装 parallax-js 视差滚动插件
pnpm add -D vite-plugin-imagemin  # 安装 vite 的图片压缩插件
pnpm add -D vue  # 安装 Vue 3 框架
pnpm add -D sass  #安装sass
pnpm add -D echarts # 安装 ECharts 数据可视化库，用于创建交互式图表
pnpm add -D typescript # 安装 TypeScript，用于编写类型安全的代码
pnpm add vitepress-plugin-rss # 安装 VitePress 插件，用于生成 RSS 订阅

#以下依赖已去除，不在使用导航栏音乐图标，已弃
pnpm add -D element-plus  # 安装 ElementPlus 组件库
pnpm add -D @element-plus/icons-vue  # 安装 ElementPlus 的 Vue 图标库
pnpm add -D vitepress-plugin-llms  # 安装 VitePress 插件，用于支持大语言模型相关功能
pnpm add -D vitepress-plugin-nprogress  # 安装 vitepress 的进度条插件
```

## 启动运行 {#up-and-running}

该工具还应该将以下 npm 脚本注入到 `package.json` 中：

```json [package.json]
{
  ...
  "scripts": {
    "docs:dev": "vitepress dev docs",
    "docs:build": "vitepress build docs",
    "docs:preview": "vitepress preview docs"
  },
  ...
}
```

`docs:dev` 脚本将启动具有即时热更新的本地开发服务器。使用以下命令运行它：

::: code-group

```sh [pnpm]
$ pnpm docs:dev
```

```sh [npm]
$ npm run docs:dev
```

```sh [yarn]
$ yarn docs:dev
```

```sh [bun]
$ bun run docs:dev
```

:::

除了 npm 脚本，还可以直接调用 VitePress：

::: code-group

```sh [pnpm]
$ pnpm vitepress dev docs
```

```sh [npm]
$ npx vitepress dev docs
```

```sh [yarn]
$ yarn vitepress dev docs
```

```sh [bun]
$ bun vitepress dev docs
```

:::

## 构建打包

请阅读[构建](/pages/b3dc08)

## 升级

::: code-group

```sh [pnpm]
$ pnpm add vitepress-theme-teek@latest -D
```

```sh [npm]
$ npm add vitepress-theme-teek@latest -D
```

```sh [yarn]
$ yarn add vitepress-theme-teek@latest -D
```

:::