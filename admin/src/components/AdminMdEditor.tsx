// 管理后台统一 Markdown 编辑器封装:
// 桌面保持 md-editor-rt 默认形态(全量工具栏 + 左右双栏实时预览),与原直用 MdEditor 完全一致;
// 移动端精简工具栏、关闭右侧实时预览(单栏编辑),previewOnly 是单栏下唯一预览入口,必须保留。
// 工具栏「图片」上传走七牛直传（onUploadImg），与封面 QiniuUpload 共用 uploadFileToQiniu。
import { Spin, Toast } from "@douyinfe/semi-ui";
import { useQuery } from "@tanstack/react-query";
import { MdEditor, type ToolbarNames } from "md-editor-rt";
import "md-editor-rt/lib/style.css";
import { useCallback, useState } from "react";
import { imageHostingApi } from "@/api/imageHosting";
import { useIsDark } from "@/hooks/useIsDark";
import { useIsMobile } from "@/hooks/useIsMobile";
import { uploadFilesToQiniu } from "@/utils/qiniuUpload";

// 小屏精简工具栏:保留高频写作项;"-" 为分隔符,"=" 后的项靠右;previewOnly 置于末位
const MOBILE_TOOLBARS: ToolbarNames[] = [
	"bold",
	"italic",
	"title",
	"quote",
	"unorderedList",
	"orderedList",
	"-",
	"codeRow",
	"code",
	"link",
	"image",
	"-",
	"revoke",
	"next",
	"=",
	"previewOnly",
];

interface AdminMdEditorProps {
	value: string;
	onChange: (v: string) => void;
	/** 桌面端编辑器高度(保持各页现状值);移动端固定 420,保证保存按钮不被顶出屏外 */
	desktopHeight: number;
}

export function AdminMdEditor({
	value,
	onChange,
	desktopHeight,
}: AdminMdEditorProps) {
	const isMobile = useIsMobile();
	const dark = useIsDark();
	const [uploading, setUploading] = useState(false);

	// 与图床配置页/QiniuUpload 共享缓存，避免每次点图片都打 config
	const { data: config } = useQuery({
		queryKey: ["image-hosting-config"],
		queryFn: () => imageHostingApi.getConfig(),
	});

	// md-editor-rt：工具栏图片/剪贴板上传都会走 onUploadImg
	// 文档类型： (files, callback) => void；callback(urls) 后插入 markdown
	const onUploadImg = useCallback(
		async (
			files: File[],
			callback: (
				urls:
					| string[]
					| Array<{ url: string; alt: string; title: string }>,
			) => void,
		) => {
			if (!files.length) return;
			// config 尚未拉回时不在此拦截，交给 uploadFilesToQiniu 内再拉/校验
			if (config && config.enabled !== true) {
				Toast.error("图床未启用：请先在「图床配置」中填写并启用");
				return;
			}
			setUploading(true);
			try {
				const results = await uploadFilesToQiniu(files, { config });
				if (!results.length) {
					// 全部失败时 uploadFilesToQiniu 已逐张 Toast
					return;
				}
				callback(
					results.map((r, i) => ({
						url: r.url,
						alt: files[i]?.name?.replace(/\.[^.]+$/, "") || "image",
						title: "",
					})),
				);
				if (results.length < files.length) {
					Toast.warning(
						`已上传 ${results.length}/${files.length} 张，失败的已跳过`,
					);
				}
			} finally {
				setUploading(false);
			}
		},
		[config],
	);

	return (
		// Semi Spin 包裹编辑器：正文插图上传中显示遮罩，防连点
		// 文档：https://semi.design/zh-CN/feedback/spin
		<Spin spinning={uploading} tip="图片上传中…">
			<MdEditor
				value={value}
				onChange={onChange}
				onUploadImg={onUploadImg}
				theme={dark ? "dark" : "light"}
				language="zh-CN"
				previewTheme="default"
				style={{ height: isMobile ? 420 : desktopHeight }}
				// 桌面不额外传 toolbars/preview/footers,保持默认行为零变化
				{...(isMobile
					? { toolbars: MOBILE_TOOLBARS, preview: false, footers: [] }
					: {})}
			/>
		</Spin>
	);
}
