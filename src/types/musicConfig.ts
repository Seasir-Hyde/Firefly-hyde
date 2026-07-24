// 音乐可视化配置
export type MusicVisualizerConfig = {
	// 振幅倍数
	amplitude?: number;
	// 频谱平滑系数 (0-1)
	smoothing?: number;
	// FFT 大小 (32-32768, 必须是 2 的幂)
	fftSize?: number;
	// 地形网格密度
	gridSize?: number;
	// 自动旋转速度 (弧度/秒)
	rotationSpeed?: number;
	// 页面背景色（按明暗主题）
	background?: {
		dark?: string;
		light?: string;
	};
	// 主题基础色
	theme?: {
		base1?: string;
		base2?: string;
	};
	// 频段高度配置
	height?: {
		idle?: number;
		subBass?: number;
		bass?: number;
		lowMid?: number;
		mid?: number;
		highMid?: number;
		energy?: number;
		ripple?: number;
		rippleAccent?: number;
	};
	// 相机配置
	camera?: {
		position?: {
			x?: number;
			y?: number;
			z?: number;
		};
	};
	// 是否自动旋转
	autoRotate?: boolean;
	// 自动旋转速度
	autoRotateSpeed?: number;
};

// 音乐播放器配置
export type MusicPlayerConfig = {
	// 使用方式：'meting' 或 'local'
	mode?: "meting" | "local"; // "meting" 使用 Meting API，"local" 使用本地音乐列表

	// 默认音量 (0-1)
	volume?: number;

	// 播放模式：'list'=列表循环, 'one'=单曲循环, 'random'=随机播放
	playMode?: "list" | "one" | "random";

	// 是否显示歌词
	showLyrics?: boolean;

	// 是否在导航栏显示音乐播放器
	showInNavbar?: boolean;

	// 是否显示迷你播放器
	showMiniPlayer?: boolean;

	// 是否同步全局播放器（当进入 /music 页面时）
	// 设置为 true：侧边栏播放器完全同步 /music 页面的播放列表
	// 设置为 false：侧边栏使用独立的本地/Meting 配置（默认）
	syncWithGlobalPlayer?: boolean;
	// 是否在侧边栏显示音乐播放器组件
	showInSidebar?: boolean;

	// Meting API 配置
	meting?: {
		// Meting API 地址
		api?: string;

		// 音乐平台：netease=网易云音乐, tencent=QQ音乐, kugou=酷狗音乐, xiami=虾米音乐, baidu=百度音乐
		server?: "netease" | "tencent" | "kugou" | "xiami" | "baidu";

		// 类型：song=单曲, playlist=歌单, album=专辑, search=搜索, artist=艺术家
		type?: "song" | "playlist" | "album" | "search" | "artist";

		// 歌单/专辑/单曲 ID 或搜索关键词
		id?: string;

		// 认证 token（可选）
		auth?: string;

		// 备用 API 配置（当主 API 失败时使用）
		fallbackApis?: string[];
	};

	// 本地音乐配置（当 mode 为 'local' 时使用）
	local?: {
		playlist?: Array<{
			name: string; // 歌曲名称
			artist: string; // 艺术家
			url: string; // 音乐文件路径（相对于 public 目录）
			cover?: string; // 封面图片路径（相对于 public 目录）
			lrc?: string; // 歌词内容，支持 LRC 格式
		}>;
	};
};
