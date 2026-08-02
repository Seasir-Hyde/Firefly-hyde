// 樱花特效配置 schema（P0）
import type { ConfigDomainSchema } from "./types";

export const effectsSchema: ConfigDomainSchema = {
	domain: "effects",
	label: "樱花特效",
	group: "功能",
	hasForm: true,
	groups: [
		{
			label: "开关",
			fields: [
				{ key: "enable", label: "启用樱花", control: "switch" },
				{
					key: "switchable",
					label: "允许访客切换",
					control: "switch",
					help: "前台设置面板是否可开关樱花",
				},
			],
		},
		{
			label: "数量与层级",
			fields: [
				{
					key: "sakuraNum",
					label: "樱花数量",
					control: "number",
					min: 1,
					max: 200,
				},
				{
					key: "limitTimes",
					label: "越界限制次数",
					control: "number",
					help: "-1 为无限循环",
				},
				{
					key: "zIndex",
					label: "层级 z-index",
					control: "number",
				},
			],
		},
		{
			label: "尺寸与透明度",
			fields: [
				{
					key: "size.min",
					label: "最小尺寸倍数",
					control: "number",
					min: 0.1,
					max: 3,
					step: 0.1,
				},
				{
					key: "size.max",
					label: "最大尺寸倍数",
					control: "number",
					min: 0.1,
					max: 3,
					step: 0.1,
				},
				{
					key: "opacity.min",
					label: "最小透明度",
					control: "slider",
					min: 0,
					max: 1,
					step: 0.05,
				},
				{
					key: "opacity.max",
					label: "最大透明度",
					control: "slider",
					min: 0,
					max: 1,
					step: 0.05,
				},
			],
		},
		{
			label: "速度",
			fields: [
				{
					key: "speed.horizontal.min",
					label: "水平速度最小",
					control: "number",
					step: 0.1,
				},
				{
					key: "speed.horizontal.max",
					label: "水平速度最大",
					control: "number",
					step: 0.1,
				},
				{
					key: "speed.vertical.min",
					label: "垂直速度最小",
					control: "number",
					step: 0.1,
				},
				{
					key: "speed.vertical.max",
					label: "垂直速度最大",
					control: "number",
					step: 0.1,
				},
				{
					key: "speed.rotation",
					label: "旋转速度",
					control: "number",
					step: 0.01,
				},
				{
					key: "speed.fadeSpeed",
					label: "淡出速度",
					control: "number",
					step: 0.01,
				},
			],
		},
	],
};
