// 可复用的七牛云直传组件：包装 Semi Upload（customRequest 接管上传行为）
// 实际上传逻辑见 @/utils/qiniuUpload（与 Markdown 编辑器共用）
import { IconUpload } from "@douyinfe/semi-icons";
import { Button, Spin, Toast, Upload } from "@douyinfe/semi-ui";
import type { customRequestArgs } from "@douyinfe/semi-ui/lib/es/upload";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import { imageHostingApi } from "@/api/imageHosting";
import { uploadFileToQiniu } from "@/utils/qiniuUpload";

interface QiniuUploadProps {
	/** 每张图直传成功后的回调（url = 后端权威拼接的最终访问地址） */
	onUploaded: (url: string, key: string) => void;
	/** 触发器；不传且非拖拽模式时默认渲染「上传图片」按钮 */
	children?: ReactNode;
	/** 拖拽大区模式（独立图床区用；此模式下 Semi 自带拖拽区 UI，无需 children） */
	draggable?: boolean;
	/** 是否显示 Upload 内置文件列表（进度/状态），嵌入输入框场景可关掉 */
	showUploadList?: boolean;
	/** 外部禁用（与「图床未启用」的内部禁用叠加） */
	disabled?: boolean;
}

export function QiniuUpload({
	onUploaded,
	children,
	draggable = false,
	showUploadList = true,
	disabled = false,
}: QiniuUploadProps) {
	// 与配置 Tab 共享同一份 React Query 缓存：拿 enabled / maxSizeMB 做前置校验
	const { data: config } = useQuery({
		queryKey: ["image-hosting-config"],
		queryFn: () => imageHostingApi.getConfig(),
	});

	// 嵌入场景常关 showUploadList（无文件列表进度），用 Semi Spin 遮罩补反馈
	// 计数器支持多文件并发：有任意一张在传就 spinning
	const [uploadingCount, setUploadingCount] = useState(0);
	const uploading = uploadingCount > 0;

	const customRequest = useCallback(
		({
			fileInstance,
			onProgress,
			onError,
			onSuccess,
		}: customRequestArgs) => {
			setUploadingCount((n) => n + 1);
			(async () => {
				const result = await uploadFileToQiniu(fileInstance, {
					config,
					onProgress: (percent) => {
						// Semi onProgress 要 total/loaded；用 100 作 total 驱动进度条
						onProgress({ total: 100, loaded: percent });
					},
				});
				onSuccess({});
				onUploaded(result.url, result.key);
			})()
				.catch(() => {
					// uploadFileToQiniu 已 Toast；这里只更新 Semi 状态
					onError({ status: 0 });
				})
				.finally(() => {
					setUploadingCount((n) => Math.max(0, n - 1));
				});
		},
		[onUploaded, config],
	);

	const notEnabled = config?.enabled !== true;
	const maxSizeMB = config?.maxSizeMB ?? 10;
	const triggerDisabled = disabled || notEnabled || uploading;

	return (
		// Semi Spin 包裹：上传中（含转码/签发/直传）显示遮罩
		// 文档：https://semi.design/zh-CN/feedback/spin
		// 嵌入场景 showUploadList=false 时没有文件列表进度，遮罩是主要反馈
		<Spin spinning={uploading} tip="图片上传中…">
			<Upload
				// customRequest 接管上传，action 不会被实际请求（Semi 要求必填故传空串）
				action=""
				customRequest={customRequest}
				accept="image/*"
				maxSize={maxSizeMB * 1024}
				onSizeError={() => Toast.error(`图片超过大小上限 ${maxSizeMB}MB`)}
				showUploadList={showUploadList}
				draggable={draggable}
				disabled={triggerDisabled}
				dragMainText="点击上传图片或拖拽图片到这里"
				dragSubText={
					notEnabled
						? "图床未启用：请先在「图床配置」中填写并启用"
						: `支持 image/*，单张不超过 ${maxSizeMB}MB`
				}
			>
				{children ??
					(!draggable && (
						<Button
							icon={<IconUpload />}
							disabled={triggerDisabled}
							loading={uploading}
						>
							上传图片
						</Button>
					))}
			</Upload>
		</Spin>
	);
}
