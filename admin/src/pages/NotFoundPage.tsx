import { Button, Empty } from "@douyinfe/semi-ui";
import { useNavigate } from "react-router-dom";

export function NotFoundPage() {
	const navigate = useNavigate();
	return (
		<div style={{ padding: 48 }}>
			<Empty
				image={<div style={{ fontSize: 64 }}>🔍</div>}
				title="页面不存在"
				description="返回仪表盘继续使用"
			>
				<Button
					theme="solid"
					type="primary"
					onClick={() => navigate("/dashboard", { replace: true })}
				>
					返回仪表盘
				</Button>
			</Empty>
		</div>
	);
}
