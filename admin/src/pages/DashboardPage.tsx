// 仪表盘：内容统计（文章/说说/公告/一言）+ 最近构建状态 + 快捷入口
// 统计数据复用现有 list API 的 total 字段，不新增后端端点；卡片二合一（点击跳转对应管理页）
import { IconRefresh } from "@douyinfe/semi-icons";
import {
	Button,
	Card,
	Col,
	Descriptions,
	Empty,
	Row,
	Skeleton,
	Tag,
	Typography,
} from "@douyinfe/semi-ui";
import type { TagColor } from "@douyinfe/semi-ui/lib/es/tag";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { announcementsApi } from "@/api/announcements";
import { buildsApi } from "@/api/builds";
import { momentsApi } from "@/api/moments";
import { postsApi } from "@/api/posts";
import { quotesApi } from "@/api/quotes";
import { usePageShell } from "@/hooks/usePageShell";
import { useAuth } from "@/providers/AuthProvider";

const { Title, Text } = Typography;

// CNB 构建状态 → Semi Tag 颜色与文案（与 BuildsPage 一致；本页内联以避免改动 BuildsPage）
const BUILD_STATUS_MAP: Record<string, { color: TagColor; text: string }> = {
	pending: { color: "amber", text: "构建中" },
	success: { color: "green", text: "成功" },
	error: { color: "red", text: "失败" },
	cancel: { color: "grey", text: "已取消" },
};

// 毫秒 → 人类可读耗时（与 BuildsPage 一致）
function formatDuration(ms: number): string {
	if (!ms || ms <= 0) return "—";
	const sec = Math.round(ms / 1000);
	if (sec < 60) return `${sec}s`;
	const min = Math.floor(sec / 60);
	return `${min}m${sec % 60}s`;
}

// ISO/UTC 字符串 → 本地时区「YYYY-MM-DD HH:mm:ss」（与 BuildsPage 一致）
// 无法解析时原样返回，空值返回空串。
function formatDateTime(value: string): string {
	if (!value) return "";
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) return value;
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function BuildStatusTag({ status }: { status: string }) {
	const s = BUILD_STATUS_MAP[status] ?? {
		color: "grey" as TagColor,
		text: status || "未知",
	};
	return <Tag color={s.color}>{s.text}</Tag>;
}

interface StatCardProps {
	queryKey: readonly string[];
	queryFn: () => Promise<number>;
	label: string;
	icon: ReactNode;
	path: string;
}

// 统计卡片：数字 + 装饰图标，整卡可点击跳转，加载用 Skeleton.Title，失败降级显示
function StatCard({ queryKey, queryFn, label, icon, path }: StatCardProps) {
	const navigate = useNavigate();
	const { data, isLoading, isError, error } = useQuery({ queryKey, queryFn });

	const handleClick = useCallback(() => navigate(path), [navigate, path]);

	return (
		// 统计卡:手机 1 列 / 小平板 2 列 / ≥768 恢复桌面 4 列(与原 span=6 等价)
		<Col xs={24} sm={12} md={6}>
			{/* 用原生 button 承载交互（a11y 正确，键盘/回车天然支持）；重置默认样式以撑满卡片 */}
			<button
				type="button"
				onClick={handleClick}
				aria-label={`管理${label}`}
				style={{
					cursor: "pointer",
					height: "100%",
					width: "100%",
					padding: 0,
					margin: 0,
					border: 0,
					background: "transparent",
					textAlign: "left",
					font: "inherit",
					color: "inherit",
					borderRadius: 0,
				}}
			>
				<Card
					shadows="hover"
					bodyStyle={{ padding: 20 }}
					style={{ height: "100%" }}
				>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							gap: 12,
						}}
					>
						<div style={{ minWidth: 0 }}>
							<Text type="tertiary" size="small">
								{label}
							</Text>
							<div
								style={{
									marginTop: 8,
									height: 32,
									display: "flex",
									alignItems: "center",
								}}
							>
								{isLoading ? (
									<Skeleton.Title style={{ width: 60 }} />
								) : isError ? (
									<Text type="danger" style={{ fontSize: 28 }}>
										—
									</Text>
								) : (
									<Title heading={2} style={{ margin: 0 }}>
										{data}
									</Title>
								)}
							</div>
							<div style={{ marginTop: 4 }}>
								{isError ? (
									<Text type="tertiary" size="small">
										{(error as Error)?.message || "读取失败"}
									</Text>
								) : (
									<Text type="tertiary" size="small">
										点击管理
									</Text>
								)}
							</div>
						</div>
						<div
							style={{
								fontSize: 28,
								lineHeight: 1,
								color: "var(--semi-color-primary)",
							}}
						>
							{icon}
						</div>
					</div>
				</Card>
			</button>
		</Col>
	);
}

const QUICK_ENTRANCES = [
	{
		title: "资料数据",
		desc: "友链 / 项目 / 设备 / 技能 / 时间线",
		path: "/data",
	},
	{
		title: "构建记录",
		desc: "查看 CNB 流水线历史与日志",
		path: "/builds",
	},
];

export function DashboardPage() {
	const navigate = useNavigate();
	const { session } = useAuth();
	const { pageStyle, stickyStyle } = usePageShell();

	// 最近 5 条构建；有构建中时 10s 轮询（沿用 BuildsPage 写法）
	const {
		data: buildData,
		isLoading: buildLoading,
		isError: buildError,
		error: buildErrorInfo,
		refetch: refetchBuilds,
		isFetching: buildFetching,
	} = useQuery({
		queryKey: ["builds", "dashboard"],
		queryFn: () => buildsApi.list(5),
		refetchInterval: (query) =>
			query.state.data?.builds?.some((b) => b.status === "pending")
				? 10_000
				: false,
	});

	const latest = buildData?.builds?.[0];

	const descData =
		latest != null
			? [
					{ key: "状态", value: <BuildStatusTag status={latest.status} /> },
					{ key: "提交说明", value: latest.commitTitle || "—" },
					{ key: "提交 SHA", value: latest.sha ? latest.sha.slice(0, 7) : "—" },
					{ key: "触发人", value: latest.userName || "—" },
					{ key: "耗时", value: formatDuration(latest.duration) },
					{ key: "开始时间", value: formatDateTime(latest.createTime) || "—" },
				]
			: [];

	return (
		<div style={pageStyle}>
			{/* 吸顶区:标题行 sticky(当前数据量一屏装下不滚动,sticky 不触发;
			    改了保持 8 页结构统一);本页 marginBottom 24 是特例(其余页 16) */}
			<div style={{ ...stickyStyle, marginBottom: 24 }}>
				<Title heading={3} style={{ margin: 0 }}>
					仪表盘
				</Title>
				<Text type="tertiary">
					欢迎回来{session?.username ? `，${session.username}` : ""}
					。这里汇总博客内容统计与最近构建状态。
				</Text>
			</div>

			<Row gutter={[16, 16]}>
				<StatCard
					queryKey={["stats", "posts"]}
					queryFn={() => postsApi.list().then((r) => r.total)}
					label="文章"
					icon={<span>📄</span>}
					path="/posts"
				/>
				<StatCard
					queryKey={["stats", "moments"]}
					queryFn={() => momentsApi.list().then((r) => r.total)}
					label="说说"
					icon={<span>💬</span>}
					path="/moments"
				/>
				<StatCard
					queryKey={["stats", "announcements"]}
					queryFn={() => announcementsApi.list().then((r) => r.total)}
					label="公告"
					icon={<span>🔔</span>}
					path="/announcements"
				/>
				<StatCard
					queryKey={["stats", "quotes"]}
					queryFn={() => quotesApi.list().then((r) => r.total)}
					label="每日一言"
					icon={<span>✨</span>}
					path="/quotes"
				/>
			</Row>

			<Card
				title="最近构建"
				style={{ marginTop: 16 }}
				headerExtraContent={
					<Button
						icon={<IconRefresh />}
						theme="borderless"
						type="tertiary"
						loading={buildFetching}
						onClick={() => refetchBuilds()}
					>
						刷新
					</Button>
				}
			>
				{buildLoading ? (
					<Skeleton.Paragraph rows={3} />
				) : buildError ? (
					<Empty
						image={<div style={{ fontSize: 40 }}>⚠️</div>}
						title="读取构建记录失败"
						description={
							(buildErrorInfo as Error)?.message || "请检查 CNB 配置或稍后重试"
						}
					>
						<Button onClick={() => refetchBuilds()}>重试</Button>
					</Empty>
				) : latest ? (
					<Descriptions align="left" data={descData} />
				) : (
					<Empty
						title="暂无构建记录"
						description="保存文章后会自动触发 CNB 流水线"
					/>
				)}
				{latest ? (
					<div style={{ marginTop: 12 }}>
						<Button
							theme="borderless"
							type="primary"
							onClick={() => navigate("/builds")}
						>
							查看全部构建记录
						</Button>
					</div>
				) : null}
			</Card>

			<Row gutter={[16, 16]} style={{ marginTop: 16 }}>
				{QUICK_ENTRANCES.map((item) => (
					// 快捷入口:手机 1 列,≥768 恢复桌面 2 列(与原 span=12 等价)
					<Col key={item.path} xs={24} md={12}>
						<button
							type="button"
							onClick={() => navigate(item.path)}
							aria-label={item.title}
							style={{
								cursor: "pointer",
								height: "100%",
								width: "100%",
								padding: 0,
								margin: 0,
								border: 0,
								background: "transparent",
								textAlign: "left",
								font: "inherit",
								color: "inherit",
								borderRadius: 0,
							}}
						>
							<Card
								shadows="hover"
								bodyStyle={{ padding: 20 }}
								style={{ height: "100%" }}
							>
								<div
									style={{
										display: "flex",
										alignItems: "center",
										justifyContent: "space-between",
										gap: 12,
									}}
								>
									<div style={{ minWidth: 0 }}>
										<Text strong>{item.title}</Text>
										<Text
											type="tertiary"
											size="small"
											style={{ display: "block", marginTop: 4 }}
										>
											{item.desc}
										</Text>
									</div>
									<Text type="tertiary" style={{ fontSize: 20 }}>
										›
									</Text>
								</div>
							</Card>
						</button>
					</Col>
				))}
			</Row>
		</div>
	);
}
