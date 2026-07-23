export type DynamicConfig = {
	title?: string;
	description?: string;
	showComment?: boolean;
	itemsPerPage?: number;
	// 动态数据 json 地址，本地默认 "/api/dynamic.json"
	// 可改为第三方接口地址，如 "https://firefly.cuteleaf.cn/api/dynamic.json"
	// 数据结构可打开上方链接地址参考
	apiUrl?: string;
};
