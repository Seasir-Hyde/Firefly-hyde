// 音乐播放器配置 schema（P0）
import type { ConfigDomainSchema } from "./types";

export const musicSchema: ConfigDomainSchema = {
	domain: "music",
	label: "音乐播放器",
	group: "功能",
	hasForm: true,
	groups: [
		{
			label: "基础",
			fields: [
				{
					key: "showInNavbar",
					label: "导航栏显示播放器",
					control: "switch",
				},
				{
					key: "mode",
					label: "播放源",
					control: "select",
					options: [
						{ label: "本地列表", value: "local" },
						{ label: "Meting API", value: "meting" },
					],
				},
				{
					key: "volume",
					label: "默认音量",
					control: "slider",
					min: 0,
					max: 1,
					step: 0.05,
					help: "0–1",
				},
				{
					key: "playMode",
					label: "播放模式",
					control: "select",
					options: [
						{ label: "列表循环", value: "list" },
						{ label: "单曲循环", value: "one" },
						{ label: "随机播放", value: "random" },
					],
				},
				{
					key: "showLyrics",
					label: "显示歌词",
					control: "switch",
				},
			],
		},
		{
			label: "Meting API",
			help: "mode 为 meting 时生效",
			fields: [
				{ key: "meting.api", label: "API 地址", control: "input", placeholder: "含 :server :type :id 的 API 模板" },
				{
					key: "meting.server",
					label: "音乐平台",
					control: "select",
					options: [
						{ label: "网易云", value: "netease" },
						{ label: "QQ 音乐", value: "tencent" },
						{ label: "酷狗", value: "kugou" },
						{ label: "虾米", value: "xiami" },
						{ label: "百度", value: "baidu" },
					],
				},
				{
					key: "meting.type",
					label: "类型",
					control: "select",
					options: [
						{ label: "单曲", value: "song" },
						{ label: "歌单", value: "playlist" },
						{ label: "专辑", value: "album" },
						{ label: "搜索", value: "search" },
						{ label: "艺术家", value: "artist" },
					],
				},
				{ key: "meting.id", label: "ID / 关键词", control: "input", placeholder: "歌单/单曲 ID 或关键词" },
				{ key: "meting.auth", label: "认证 Token", control: "input", placeholder: "可选，API 鉴权 Token" },
				{
					key: "meting.fallbackApis",
					label: "备用 API",
					control: "tags",
					placeholder: "备用 API 地址后点「添加」",
					help: "主 API 失败时依次尝试",
				},
			],
		},
		{
			label: "本地播放列表",
			help: "mode 为 local 时生效",
			fields: [
				{
					key: "local.playlist",
					label: "播放列表",
					control: "objectList",
					itemLabelKey: "name",
					emptyItem: {
						name: "",
						artist: "",
						url: "",
						cover: "",
						lrc: "",
					},
					itemSchema: [
						{ key: "name", label: "歌名", control: "input", placeholder: "歌曲名" },
						{ key: "artist", label: "艺术家", control: "input", placeholder: "歌手名" },
						{ key: "url", label: "音频路径", control: "input", placeholder: "/assets/music/xxx.mp3" },
						{ key: "cover", label: "封面", control: "imageUrl", placeholder: "封面路径或 URL" },
						{ key: "lrc", label: "歌词路径", control: "input", placeholder: "/assets/music/lrc/xxx.lrc" },
					],
				},
			],
		},
	],
};
