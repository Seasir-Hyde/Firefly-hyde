// 慢异步操作（git push 等）的 Semi Spin 包裹
// 官方文档：https://semi.design/zh-CN/feedback/spin
// 约定：spinning 时自带遮罩 + tip，覆盖子内容防连点；读加载仍用各页原有 Table.loading / 居中 Spin
import { Spin } from "@douyinfe/semi-ui";
import type { CSSProperties, ReactNode } from "react";

interface BusySpinProps {
	spinning: boolean;
	/** 遮罩文案；默认面向 git 提交场景 */
	tip?: ReactNode;
	children: ReactNode;
	style?: CSSProperties;
}

/** 默认 tip：文章/资料/页面/配置等 git 写通道 */
export const GIT_BUSY_TIP = "正在提交到仓库，约需数十秒…";

export function BusySpin({
	spinning,
	tip = GIT_BUSY_TIP,
	children,
	style,
}: BusySpinProps) {
	return (
		<Spin
			spinning={spinning}
			size="large"
			tip={tip}
			style={{ width: "100%", minHeight: "40vh", ...style }}
		>
			{children}
		</Spin>
	);
}
