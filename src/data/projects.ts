// Project data configuration file
// Used to manage data for the project display page

export interface Project {
	id: string;
	title: string;
	description: string;
	image: string;
	category: "web" | "mobile" | "desktop" | "other";
	techStack: string[];
	status: "completed" | "in-progress" | "planned";
	liveDemo?: string;
	sourceCode?: string;
	visitUrl?: string;
	startDate: string;
	endDate?: string;
	featured?: boolean;
	tags?: string[];
	showImage?: boolean;
}

export const projectsData: Project[] = [
	{
		id: "Firefly", //(必填) 项目的唯一标识符，通常是字符串格式的名称。用于内部引用和过滤。
		title: "Firefly", //(必填) 项目的名称，显示在项目列表中。
		// 项目的详细描述，可以多行文本。
		description:
			"Firefly 是一款基于 Astro 框架和 Fuwari 模板开发的清新美观且现代化个人博客主题模板，专为技术爱好者和内容创作者设计。该主题融合了现代 Web 技术栈，提供了丰富的功能模块和高度可定制的界面，让您能够轻松打造出专业且美观的个人博客网站。",
		// (必填) 项目展示图片的路径，通常放在 public/images/projects/ 目录下。
		image: "https://docs-firefly.cuteleaf.cn/images/1.webp",
		//"web" | "mobile" | "desktop" | "other": (必填) 项目的类型分类，用于筛选。
		category: "web",
		// (必填) 项目使用的技术栈数组，如 ["React", "Node.js"]。
		techStack: ["Astro", "TypeScript", "Tailwind CSS", "Svelte"],
		// "completed" | "in-progress" | "planned": (必填) 项目的当前状态，用于筛选。
		status: "completed",
		//  (可选) 项目源代码仓库的URL地址，通常是GitHub链接。
		sourceCode: "https://github.com/CuteLeaf/Firefly",
		//  (可选) 项目访问链接，可以是演示链接或项目主页。
		visitUrl: "https://firefly.cuteleaf.cn/",
		// (必填) 项目开始日期，格式为 "YYYY-MM-DD"。
		startDate: "2025-10-111",
		// (可选) 项目结束日期，格式为 "YYYY-MM-DD"。对于进行中的项目，此字段可省略。
		endDate: "2024-06-01",
		// (可选) 是否为特色项目，特色项目会优先展示。
		featured: true,
		// (可选) 项目标签数组，用于更细致的分类。
		tags: ["Blog", "Theme", "Open Source"],
	},
	{
		id: "vue-pure-admin",
		title: "vue-pure-admin",
		description:
			"一款开源免费且开箱即用的中后台管理系统模块版本。完全采用ECMAScript模块（ESM）规范来编写和组织代码，使用了最新的Vue3、 Vite、Element-Plus、TypeScript、Pinia、Tailwindcss等主流技术开发",
		image:
			"https://camo.githubusercontent.com/56acae4e405b42111d2ba2b56a85c3d07a93fe0d2e4865960da81df74386af3c/68747470733a2f2f7869616f7869616e3532312e6769746875622e696f2f68797065726c696e6b2f696d672f7675652d707572652d61646d696e2f312e6a7067",
		category: "mobile",
		techStack: [
			"Vue3",
			"Vite",
			"Element-Plus++",
			"TypeScript",
			"Pinia",
			"Tailwindcss",
		],
		status: "in-progress",
		sourceCode: "https://github.com/pure-admin/vue-pure-admin",
		visitUrl: "https://pure-admin.github.io/vue-pure-admin/#/login",
		startDate: "2024-03-01",
		featured: true,
		tags: ["Android", "Root", "Kernel"],
	},
	{
		id: "file-transfer-go",
		title: "文件快传 - P2P文件传输工具",
		description:
			"Go/React开发的端到端webrtc的文件传输/文字传输/桌面共享，安全，隐私，数据不经过服务器。",
		image:
			"https://raw.githubusercontent.com/MatrixSeven/file-transfer-go/refs/heads/main/img.png",
		category: "desktop",
		techStack: ["Go", "React "],
		status: "completed",
		sourceCode: "https://github.com/MatrixSeven/file-transfer-go",
		visitUrl: "https://transfer.52python.cn/",
		startDate: "2026-02-01",
		endDate: "2026-02-28",
		tags: ["Android", "Tool", "Desktop"],
		showImage: true,
	},
];

// Get project statistics
export const getProjectStats = () => {
	const total = projectsData.length;
	const completed = projectsData.filter((p) => p.status === "completed").length;
	const inProgress = projectsData.filter(
		(p) => p.status === "in-progress",
	).length;
	const planned = projectsData.filter((p) => p.status === "planned").length;

	return {
		total,
		byStatus: {
			completed,
			inProgress,
			planned,
		},
	};
};

// Get projects by category
export const getProjectsByCategory = (category?: string) => {
	if (!category || category === "all") {
		return projectsData;
	}
	return projectsData.filter((p) => p.category === category);
};

// Get featured projects
export const getFeaturedProjects = () => {
	return projectsData.filter((p) => p.featured);
};

// Get all tech stacks
export const getAllTechStack = () => {
	const techSet = new Set<string>();
	projectsData.forEach((project) => {
		project.techStack.forEach((tech) => {
			techSet.add(tech);
		});
	});
	return Array.from(techSet).sort();
};
