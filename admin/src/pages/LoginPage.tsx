// 登录页:Semi Form 单页;登录成功后 AuthProvider 更新 user,自动跳回目标页
import { IconLock, IconUser } from "@douyinfe/semi-icons";
import { Banner, Button, Card, Form, Toast } from "@douyinfe/semi-ui";
import { useCallback, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "@/api/client";
import { useAuth } from "@/providers/AuthProvider";

interface LoginFormValues {
	username: string;
	password: string;
}

interface LocationState {
	from?: string;
}

export function LoginPage() {
	const navigate = useNavigate();
	const location = useLocation();
	const { login } = useAuth();
	const [submitting, setSubmitting] = useState(false);
	const [errorMsg, setErrorMsg] = useState<string | null>(null);

	const handleSubmit = useCallback(
		async (values: LoginFormValues) => {
			setSubmitting(true);
			setErrorMsg(null);
			try {
				await login(values.username, values.password);
				Toast.success("登录成功");
				const from =
					(location.state as LocationState | null)?.from ?? "/dashboard";
				navigate(from, { replace: true });
			} catch (err) {
				const message =
					err instanceof ApiError ? err.message : "登录失败,请稍后重试";
				setErrorMsg(message);
			} finally {
				setSubmitting(false);
			}
		},
		[login, navigate, location.state],
	);

	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				minHeight: "100vh",
				background: "var(--semi-color-bg-0)",
				padding: 16,
			}}
		>
			{/* 小屏跟随容器收窄(容器有 16px padding),桌面 flex 居中下等价于原 width:400 */}
			<Card style={{ width: "100%", maxWidth: 400 }} title="Firefly 管理后台">
				{errorMsg ? (
					<Banner
						type="danger"
						description={errorMsg}
						closeIcon={null}
						style={{ marginBottom: 16 }}
					/>
				) : null}
				<Form<LoginFormValues> onSubmit={handleSubmit} disabled={submitting}>
					<Form.Input
						field="username"
						label="用户名"
						prefix={<IconUser />}
						placeholder="请输入用户名"
						rules={[{ required: true, message: "请输入用户名" }]}
					/>
					<Form.Input
						field="password"
						label="密码"
						mode="password"
						prefix={<IconLock />}
						placeholder="请输入密码"
						rules={[{ required: true, message: "请输入密码" }]}
					/>
					<Button
						htmlType="submit"
						type="primary"
						theme="solid"
						block
						loading={submitting}
						style={{ marginTop: 8 }}
					>
						登录
					</Button>
				</Form>
			</Card>
		</div>
	);
}
