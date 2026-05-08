// 日记数据配置
// 用于管理日记页面的数据

export interface DiaryItem {
	id: number;
	content: string;
	date: string;
	images?: string[];
	location?: string;
	locationUrl?: string;
	mood?: string;
	tags?: string[];
	avatar?: string;
}

// 示例日记数据
const diaryData: DiaryItem[] = [
	{
		id: 1,
		content:
			"📍𝘾𝙝𝙪𝙖𝙣𝙓𝙞丨川西\n勇敢的人先享受高反再享受世界🗺️✨🤣",
		date: "2026-05-01T10:30:00Z",
		location: "阿坝藏族羌族自治州·四姑娘山景区",
		locationUrl: "https://j.map.baidu.com/cf/2M",
		images: ["https://i.postimg.cc/Z54VY6DF/1040g2sg31fatmlv6me7g5ndqintg8sfbhhno2so-nd-dft-wlteh-webp-3.webp", 
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
			item.tags.forEach((tag) => tags.add(tag));
		}
	});
	return Array.from(tags).sort();
};