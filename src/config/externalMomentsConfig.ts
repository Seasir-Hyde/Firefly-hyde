// 外部说说数据源配置（基于 GitHub Gist，完全免费）
// 数据存储在 GitHub Gist 中，通过 GitHub API 读写
// 添加新说说不会修改仓库中的任何代码

export const externalMomentsConfig = {
	// 是否启用外部说说数据源
	enable: true,

	// GitHub Gist ID（创建 Gist 后从 URL 中获取）
	gistId: "ee329e8726b8d77b68f23c602ae76f8c",

	// Gist 中的文件名
	fileName: "moments.json",

	// 默认作者信息
	defaultAuthor: "Hyde",
	defaultAvatar:
		"https://i.postimg.cc/7YLVJqnp/wei-xin-tu-pian-2026-05-07-020150-883.jpg",

	// 后台登录密码的 SHA-256 哈希（明文密码不再存入代码）
	// 生成方式：echo -n "你的密码" | hyde189755
	adminPasswordHash:
		"b5d9ded2ab2812e8653f06fc4d3246a4b13642e8371bc74a7f1003eb4fb4e637",

	// GitHub Token（优先从环境变量 GITHUB_TOKEN 读取）
	// EdgeOne 部署时在环境变量中设置 GITHUB_TOKEN=你的token
	githubToken: process.env.GITHUB_TOKEN || "",
};
