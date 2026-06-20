// 外部笔记数据源配置（基于 GitHub Gist，完全免费）
// 每个笔记本有独立的 Gist 仓库，避免单个 Gist 空间不足
// 与说说后端共用同一套认证机制

export const externalNotebooksConfig = {
	// 是否启用外部笔记数据源
	enable: true,

	// 每个笔记本对应的 Gist ID
	// 在 https://gist.github.com 创建 Secret Gist，文件名 notebooks-entries.json，内容 []
	// 创建后把 Gist ID 填在对应笔记本名后面
	notebookGists: {
		每日总结: "85e22c520b3ea86d80d0a2f7f5154a67",
		日记本: "04da78da60cd6363041605ee65f56bdb",
		日常随笔: "a3707e728f5797612a0b8a9560035686",
		喜马拉雅: "f189e7928f9d5e98700eb17c0b5853fa",
		我和宝宝的日常: "5cabb89043f03efa0099f828505fd9ea",
		记录100件事: "05da9de9c20e47f14849a4937b715d65",
	} as Record<string, string>,

	// 笔记模板（Admin 页面快速选择）
	// {name} 会被替换为今天的日期，如 2026-06-11
	templates: [
		{
			id: "daily",
			icon: "📅",
			name: "每日总结",
			title: "{name} 每日总结",
			content: "✅️今天做了：  \n🤔今日感悟：  \n⏰明天计划：",
		},
		{
			id: "diary",
			icon: "📖",
			name: "日记",
			title: "{name}",
			content: "## 天气\n\n## 今天发生了什么\n\n## 心情\n\n## 想说的话\n\n",
		},
		{
			id: "reading",
			icon: "📚",
			name: "读书笔记",
			title: "",
			content:
				"## 📖 书籍信息\n\n- 书名：\n- 作者：\n- 阅读进度：\n\n## 核心观点\n\n## 精彩摘录\n\n> \n\n## 我的思考\n\n",
		},
		{
			id: "idea",
			icon: "💡",
			name: "灵感",
			title: "💡 {name} 灵感",
			content: "## 灵感来源\n\n## 具体想法\n\n## 下一步行动\n\n- [ ] \n",
		},
		{
			id: "todo",
			icon: "✅",
			name: "待办",
			title: "📋 {name} 待办",
			content:
				"## 重要且紧急\n\n- [ ] \n\n## 重要不紧急\n\n- [ ] \n\n## 紧急不重要\n\n- [ ] \n\n## 其他\n\n- [ ] \n",
		},
		{
			id: "free",
			icon: "📝",
			name: "空白",
			title: "",
			content: "",
		},
	] as Array<{
		id: string;
		icon: string;
		name: string;
		title: string;
		content: string;
	}>,

	// 后台登录密码的 SHA-256 哈希（与说说后台共用同一密码）
	adminPasswordHash:
		"b5d9ded2ab2812e8653f06fc4d3246a4b13642e8371bc74a7f1003eb4fb4e637",

	// GitHub Token（优先从环境变量 GITHUB_TOKEN 读取）
	githubToken: process.env.GITHUB_TOKEN || "",
};
