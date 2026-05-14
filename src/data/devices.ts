// 设备数据配置文件

export interface Device {
	name: string;
	image: string;
	specs: string;
	description: string;
	link: string;
	price?: string;
}

// 设备类别类型，支持品牌和自定义类别
export type DeviceCategory = Record<string, Device[]> & {
	自定义?: Device[];
};

export const devicesData: DeviceCategory = {
	数码: [
		{
			name: "iPhone 17 Pro",
			image: "/images/device/iPhone 17 Pro.webp",
			specs: "深蓝色 / 12G + 256G",
			description: "创新设计，打造巅峰性能和超长续航",
			link: "https://www.apple.com.cn/iphone-17-pro/",
			price: "8999元",
		},
		{
			name: "Xiaomi 17 Ultra 徕卡版",
			image:
				"https://cdn.cnbj0.fds.api.mi-img.com/b2c-shopapi-pms/pms_1766544998.81921201.png",
			specs: "米白色/16G+1TB",
			description: "聚焦所见，忠于表达",
			link: "https://www.mi.com/shop/buy/detail?product_id=22423",
			price: "8999元",
		},
		{
			name: "XiaoMi 10 Pro",
			image: "/images/device/MI 10Pro.webp",
			specs: "珍珠白/12G+256G",
			description: "小米十周年梦幻之作",
			link: "https://www.mi.com/hk/buy/product/mi-10-pro?gid=4201400021",
			price: "4783元",
		},
		{
			name: "XiaoMi 6",
			image: "/images/device/XiaoMi 6.webp",
			specs: "黑色 / 6G + 64G",
			description: "变焦双摄，拍人更美",
			link: "https://www.mi.com/mi6",
			price: "2499元",
		},
		{
			name: "OPPO Enco Air4 Pro",
			image: "/images/device/OPPO Enco Air4 Pro.webp",
			specs: "晨曦白",
			description: "真无线降噪蓝牙耳机",
			link: "https://www.opposhop.cn/cn/web/products/27614.html",
			price: "219元",
		},
		{
			name: "小米AI音箱（第二代）",
			image: "/images/device/小米AI音箱（第二代）.webp",
			specs: "白色",
			description: "经典延续，体验升级",
			link: "https://www.mi.com/shop/buy/detail?product_id=13878",
			price: "179元",
		},
	],
	运动相机: [
		{
			name: "影石Insta360 Ace Pro 2",
			image: "/images/device/Insta360 Ace Pro 2.webp",
			specs: "极夜黑 / 街拍银灰",
			description: "AI双芯，旗舰影像",
			link: "https://store.insta360.com/cn/product/ace-pro-2?c=3611&from=nav_product",
			price: "2359元",
		},
		{
			name: "Osmo Pocket 4",
			image: "/images/device/Osmo Pocket 4.webp",
			specs: "标准套装",
			description: "一寸万象，光影随行",
			link: "https://www.dji.com/cn/osmo-pocket-4",
			price: "2999元",
		},
	],
	路由器: [
		{
			name: "RG-X30E",
			image: "/images/device/RG-X30E.webp",
			specs: "1000Mbps / 2.5G",
			description: "锐捷雪豹电竞WiFi 6 路由器",
			link: "https://item.jd.com/100084856711.html",
			price: "109元",
		},
	],
};
