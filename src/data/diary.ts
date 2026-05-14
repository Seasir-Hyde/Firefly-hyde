// 日记数据配置
// 用于管理日记页面的数据

export interface DiaryItem {
	id: number;
	content: string;
	date: string;
	images?: string[];
	video?: string;
	location?: string;
	locationUrl?: string;
	mood?: string;
	tags?: string[];
	avatar?: string;
	// 图片展示配置
	imageDisplay?: {
		type: "carousel" | "grid"; // 显示类型：轮播图或网格布局
		autoPlay?: boolean; // 是否自动播放（仅carousel模式），默认 true
		interval?: number; // 自动播放间隔（毫秒），默认 4000ms
		showIndicator?: boolean; // 是否显示位置指示器（仅carousel模式），默认 true
		showControls?: boolean; // 是否显示控制按钮（仅carousel模式），默认 true
	};
}

// 示例日记数据
const diaryData: DiaryItem[] = [
	{
		id: 1,
		content: "📍𝘾𝙝𝙪𝙖𝙣𝙓𝙞丨川西\n勇敢的人先享受高反再享受世界🗺️✨🤣",
		date: "2026-05-01T10:30:00Z",
		location: "阿坝藏族羌族自治州·四姑娘山景区",
		locationUrl: "https://j.map.baidu.com/cf/2M",
		images: [
			"https://i.postimg.cc/Z54VY6DF/1040g2sg31fatmlv6me7g5ndqintg8sfbhhno2so-nd-dft-wlteh-webp-3.webp",
			"https://i.postimg.cc/52bn98k8/1040g2sg31fatmlv6me805ndqintg8sfbee0hv3o-nd-dft-wlteh-webp-3.webp",
			"https://i.postimg.cc/zG80DTPy/1040g2sg31fatmlv6me905ndqintg8sfbdnvlebo-nd-dft-wlteh-webp-3.webp",
			"https://i.postimg.cc/rwMQy5Yy/1040g2sg31fatmlv6me9g5ndqintg8sfbkfu6ja0-nd-dft-wlteh-webp-3.webp",
			"https://i.postimg.cc/3xYnr2bw/1040g2sg31fatmlv6meb05ndqintg8sfbe4ho350-nd-dft-wlteh-webp-3.webp",
			"https://i.postimg.cc/zG80DTPG/1040g3qg31vmkbstgjq0g4ark0mecm6c2ogerg5o-nd-dft-wlteh-webp-3.webp",
			"https://i.postimg.cc/kXxTdTwB/1040g3qg31vmkbstgjq6g4ark0mecm6c2hceerd8-nd-dft-wlteh-webp-3.webp",
			"https://i.postimg.cc/g2mNc3BL/1040g3qg31vmkgeuuia104ark0mecm6c2ensa8n8-nd-dft-wlteh-webp-3.webp",
			"https://i.postimg.cc/dt85K5ny/1040g3qg31vmkgeuuia304ark0mecm6c27chnl9g-nd-dft-wlteh-webp-3.webp",
		],
		tags: ["川西", "高反", "世界"],
		mood: "😊",
		imageDisplay: {
			type: "grid", // 'carousel' 轮播模式 | 'grid' 网格布局模式
			autoPlay: true,
			interval: 4000,
			showIndicator: true,
			showControls: true,
		},
	},
	{
		id: 1,
		content: "轮播示例",
		date: "2026-05-01T10:30:00Z",
		// location: "阿坝藏族羌族自治州·四姑娘山景区",
		locationUrl: "https://j.map.baidu.com/cf/2M",
		images: [
			"https://tc.alcy.cc/tc/20260429/91e113df15bffb3f8bdb26815a657eb2.webp",
			"https://tc.alcy.cc/tc/20260429/f24f72bb6ddd659014616eb988b17385.webp",
			"https://tc.alcy.cc/tc/20260429/64fd71741c204cf10b3f39c6a2c22216.webp",
			"https://tc.alcy.cc/tc/20260429/3203d4425f7c3c8704ecc63d59fad1be.webp",
		],
		tags: ["轮播示例"],
		mood: "😊",
		imageDisplay: {
			type: "carousel", // 'carousel' 轮播模式 | 'grid' 网格布局模式
			autoPlay: true,
			interval: 4000,
			showIndicator: true,
			showControls: true,
		},
	},
	{
		id: 2,
		content: "YouTube",
		date: "2026-05-01T10:30:00Z",
		// location: "YouTube示例视频",
		// locationUrl: "https://j.map.baidu.com/cf/2M",
		images: [],
		video: "https://www.youtube.com/embed/5gIf0_xpFPI?si=N1WTorLKL0uwLsU_",

		tags: ["YouTube"],
		mood: "😊",
	},
	{
		id: 2,
		content: "Bilibili",
		date: "2026-05-01T10:30:00Z",
		// location: "Bilibili示例视频",
		locationUrl: "https://j.map.baidu.com/cf/2M",
		images: [],
		video: "https://www.bilibili.com/video/BV1uzRjBAEjL?t=3.6",
		tags: ["Bilibili"],
		mood: "😊",
	},
];

// 获取日记列表（按时间倒序）
export const getDiaryList = (limit?: number) => {
	const sortedData = [...diaryData].sort(
		(a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
	);

	if (limit && limit > 0) {
		return sortedData.slice(0, limit);
	}

	return sortedData;
};

// 获取所有标签
export const getAllTags = () => {
	const tags = new Set<string>();
	diaryData.forEach((item) => {
		if (item.tags) {
			item.tags.forEach((tag) => {
				tags.add(tag);
			});
		}
	});
	return Array.from(tags).sort();
};
