// 通用占位页（尚未接入具体功能时使用）
import { Empty, Typography } from "@douyinfe/semi-ui";

const { Title } = Typography;

interface Props {
	title: string;
	// 可选提示语
	hint?: string;
}

export function PlaceholderPage({ title, hint }: Props) {
	return (
		<div>
			<Title heading={3}>{title}</Title>
			<Empty
				image={<div style={{ fontSize: 48 }}>🚧</div>}
				title="待开发"
				description={hint ?? "该模块尚未接入"}
				style={{ marginTop: 48 }}
			/>
		</div>
	);
}
