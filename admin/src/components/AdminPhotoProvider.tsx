// 管理后台统一图片预览容器:封装 react-photo-view 的 PhotoProvider,
// 在其手势基础(捏合/双击/滑动/滚轮)上增强:
//   顶部工具栏:下载、复制链接
//   覆盖层:左右切换箭头 + 底部缩略图条(点击跳转,当前高亮,自动滚动跟随)
// 使用:<AdminPhotoProvider>…<PhotoView src={url}><触发元素/></PhotoView>…</AdminPhotoProvider>
import {
	IconChevronLeft,
	IconChevronRight,
	IconCopy,
	IconDownload,
} from "@douyinfe/semi-icons";
import { Toast } from "@douyinfe/semi-ui";
import type { CSSProperties, Key, ReactNode } from "react";
import { useEffect, useRef } from "react";
import { PhotoProvider } from "react-photo-view";
import "react-photo-view/dist/react-photo-view.css";

// 预览遮罩 z-index 2000(react-photo-view.css),Toast 需盖过它
const TOAST_Z = 3000;

// 顶部工具栏图标按钮(与 photo-view 自带图标观感一致:白色、半透明)
const toolBtnStyle: CSSProperties = {
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	width: 44,
	height: 44,
	padding: 0,
	border: 0,
	background: "transparent",
	color: "#fff",
	opacity: 0.75,
	cursor: "pointer",
};

// 左右切换箭头(半透明圆底,垂直居中)。
// z-index 必须高于 photo-view 的全屏手势层 PhotoView__PhotoWrap(z-index 10),
// 否则会被图片盖住且点击全落在手势层上(overlayRender 容器自身无层级样式)
const arrowBtnStyle: CSSProperties = {
	position: "absolute",
	top: "50%",
	transform: "translateY(-50%)",
	zIndex: 30,
	width: 44,
	height: 44,
	padding: 0,
	border: 0,
	borderRadius: "50%",
	background: "rgba(0, 0, 0, 0.45)",
	color: "#fff",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	cursor: "pointer",
};

async function downloadImage(src: string) {
	try {
		const resp = await fetch(src);
		if (!resp.ok) throw new Error(String(resp.status));
		const blob = await resp.blob();
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download =
			decodeURIComponent(src.split("/").pop()?.split("?")[0] ?? "") || "image";
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
	} catch {
		// 图床域名未开 CORS 时 fetch 会被拦:降级新窗口打开(可长按/右键另存)
		window.open(src, "_blank", "noopener");
		Toast.info({
			content: "已在新窗口打开图片(当前图片域名不允许直接下载)",
			zIndex: TOAST_Z,
		});
	}
}

function copyImageUrl(src: string) {
	navigator.clipboard?.writeText(src).then(
		() => Toast.success({ content: "图片链接已复制", zIndex: TOAST_Z }),
		() => Toast.error({ content: "复制失败", zIndex: TOAST_Z }),
	);
}

// 底部缩略图条:独立组件以便用 effect 让当前项滚动进可视区
function ThumbStrip({
	images,
	index,
	onIndexChange,
}: {
	images: { src?: string; key?: Key }[];
	index: number;
	onIndexChange: (i: number) => void;
}) {
	const trackRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const track = trackRef.current;
		const el = track?.children[index] as HTMLElement | undefined;
		if (!track || !el) return;
		// 只滚动缩略图轨道自身。不能用 scrollIntoView:它会把"无法居中的剩余滚动量"
		// 传播给 overflow:hidden 的预览容器,查看末尾几张时整个预览画面会被横向推移
		track.scrollTo({
			left: el.offsetLeft - (track.clientWidth - el.offsetWidth) / 2,
			behavior: "smooth",
		});
	}, [index]);

	useEffect(() => {
		const track = trackRef.current;
		if (!track) return;
		// photo-view 在 window 上无条件 preventDefault 所有 touchmove(实现拖拽切图),
		// 会连带取消缩略图轨道的原生横向滚动;在轨道自身截断冒泡,手指滑动才能生效
		const stopTouch = (e: TouchEvent) => e.stopPropagation();
		track.addEventListener("touchmove", stopTouch);
		return () => track.removeEventListener("touchmove", stopTouch);
	}, []);

	return (
		// 外层负责水平居中(图少);内层轨道超宽时占满可横向滚动(图多)。
		// zIndex 30:压过全屏手势层(z10),否则可见但点击不到
		<div
			style={{
				position: "absolute",
				left: 0,
				right: 0,
				bottom: "calc(12px + env(safe-area-inset-bottom))",
				zIndex: 30,
				display: "flex",
				justifyContent: "center",
				pointerEvents: "none",
			}}
		>
			<div
				ref={trackRef}
				style={{
					// relative:让子项 offsetLeft 以轨道为基准(手动居中滚动的计算依据)
					position: "relative",
					display: "flex",
					gap: 8,
					overflowX: "auto",
					maxWidth: "100%",
					padding: "4px 16px",
					pointerEvents: "auto",
				}}
			>
				{images.map((img, i) => (
					<button
						key={img.key ?? img.src ?? i}
						type="button"
						aria-label={`查看第 ${i + 1} 张`}
						onClick={(e) => {
							e.stopPropagation();
							onIndexChange(i);
						}}
						style={{
							flexShrink: 0,
							width: 48,
							height: 48,
							padding: 0,
							border: i === index ? "2px solid #fff" : "2px solid transparent",
							borderRadius: 6,
							overflow: "hidden",
							cursor: "pointer",
							opacity: i === index ? 1 : 0.55,
							background: "transparent",
						}}
					>
						<img
							src={img.src}
							alt=""
							style={{
								width: "100%",
								height: "100%",
								objectFit: "cover",
								display: "block",
							}}
						/>
					</button>
				))}
			</div>
		</div>
	);
}

export function AdminPhotoProvider({ children }: { children: ReactNode }) {
	return (
		<PhotoProvider
			toolbarRender={({ images, index }) => {
				const src = images[index]?.src;
				if (!src) return null;
				return (
					<>
						<button
							type="button"
							aria-label="下载图片"
							style={toolBtnStyle}
							onClick={() => downloadImage(src)}
						>
							<IconDownload size="large" />
						</button>
						<button
							type="button"
							aria-label="复制图片链接"
							style={toolBtnStyle}
							onClick={() => copyImageUrl(src)}
						>
							<IconCopy size="large" />
						</button>
					</>
				);
			}}
			overlayRender={({ images, index, onIndexChange, overlayVisible }) => {
				// 点击图片进入沉浸模式时(photo-view 自身顶栏淡出),同步隐藏增强控件
				if (!overlayVisible || images.length === 0) return null;
				return (
					<>
						{index > 0 ? (
							<button
								type="button"
								aria-label="上一张"
								style={{ ...arrowBtnStyle, left: 12 }}
								onClick={(e) => {
									e.stopPropagation();
									onIndexChange(index - 1);
								}}
							>
								<IconChevronLeft size="large" />
							</button>
						) : null}
						{index < images.length - 1 ? (
							<button
								type="button"
								aria-label="下一张"
								style={{ ...arrowBtnStyle, right: 12 }}
								onClick={(e) => {
									e.stopPropagation();
									onIndexChange(index + 1);
								}}
							>
								<IconChevronRight size="large" />
							</button>
						) : null}
						{images.length > 1 ? (
							<ThumbStrip
								images={images}
								index={index}
								onIndexChange={onIndexChange}
							/>
						) : null}
					</>
				);
			}}
		>
			{children}
		</PhotoProvider>
	);
}
