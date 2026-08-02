// 构建记录页：展示 CNB main 分支 push 事件的流水线记录，支持轮询刷新
// 文章保存 push 后，可在此查看「构建中/成功/失败」状态
import { IconRefresh } from "@douyinfe/semi-icons";
import {
	Button,
	Empty,
	Space,
	Table,
	Tag,
	Typography,
} from "@douyinfe/semi-ui";
import type { ColumnProps } from "@douyinfe/semi-ui/lib/es/table";
import type { TagColor } from "@douyinfe/semi-ui/lib/es/tag";
import { useQuery } from "@tanstack/react-query";
import { type BuildItem, buildsApi } from "@/api/builds";
import { usePageShell } from "@/hooks/usePageShell";

const { Title, Text } = Typography;

// CNB 构建状态 → Semi Tag 颜色与文案
const STATUS_MAP: Record<string, { color: TagColor; text: string }> = {
	pending: { color: "amber", text: "构建中" },
	success: { color: "green", text: "成功" },
	error: { color: "red", text: "失败" },
	cancel: { color: "grey", text: "已取消" },
};

// 毫秒 → 人类可读耗时
function formatDuration(ms: number): string {
	if (!ms || ms <= 0) return "—";
	const sec = Math.round(ms / 1000);
	if (sec < 60) return `${sec}s`;
	const min = Math.floor(sec / 60);
	return `${min}m${sec % 60}s`;
}

// CNB 返回的 createTime 多为 ISO/UTC 字符串（带 T/Z），原样展示格式生硬且时区不对。
// 统一解析为本地时间的「YYYY-MM-DD HH:mm:ss」；无法解析时原样返回，空值返回空串。
function formatDateTime(value: string): string {
	if (!value) return "";
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) return value;
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function BuildsPage() {
	const { isMobile, pageStyle, stickyStyle } = usePageShell();
	// 有构建中的记录时自动轮询（10s），否则静止
	const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
		queryKey: ["builds"],
		queryFn: () => buildsApi.list(20),
		refetchInterval: (query) => {
			const builds = query.state.data?.builds ?? [];
			return builds.some((b) => b.status === "pending") ? 10_000 : false;
		},
	});

	// 桌面 6 列(现状原样)
	const desktopColumns: ColumnProps<BuildItem>[] = [
		{
			title: "状态",
			dataIndex: "status",
			width: 100,
			render: (status: string) => {
				const s = STATUS_MAP[status] ?? {
					color: "grey",
					text: status || "未知",
				};
				return <Tag color={s.color}>{s.text}</Tag>;
			},
		},
		{
			title: "提交说明",
			dataIndex: "commitTitle",
			render: (title: string, record) => (
				<div>
					<Text>{title || "—"}</Text>
					{record.sha ? (
						<Text type="tertiary" size="small" style={{ display: "block" }}>
							{record.sha.slice(0, 7)}
						</Text>
					) : null}
				</div>
			),
		},
		{
			title: "触发人",
			dataIndex: "userName",
			width: 120,
			render: (userName: string) => (
				<Text type="tertiary">{userName || "—"}</Text>
			),
		},
		{
			title: "耗时",
			dataIndex: "duration",
			width: 100,
			render: (duration: number) => (
				<Text type="tertiary">{formatDuration(duration)}</Text>
			),
		},
		{
			title: "开始时间",
			dataIndex: "createTime",
			width: 180,
			render: (createTime: string) => (
				<Text type="tertiary">{formatDateTime(createTime) || "—"}</Text>
			),
		},
		{
			title: "日志",
			dataIndex: "buildLogUrl",
			width: 80,
			render: (url: string) =>
				url ? (
					<Text link={{ href: url, target: "_blank" }}>查看</Text>
				) : (
					<Text type="tertiary">—</Text>
				),
		},
	];

	// 移动端 3 列:状态 + 提交说明(副行合并 sha·触发人·耗时·开始时间)+ 日志
	// 列宽注意:Semi Table 单元格左右各 16px 内边距,列宽须 ≥ 文字宽 + 32,否则文字竖排
	const mobileColumns: ColumnProps<BuildItem>[] = [
		{
			title: "状态",
			dataIndex: "status",
			width: 84,
			render: (status: string) => {
				const s = STATUS_MAP[status] ?? {
					color: "grey",
					text: status || "未知",
				};
				return <Tag color={s.color}>{s.text}</Tag>;
			},
		},
		{
			title: "提交说明",
			dataIndex: "commitTitle",
			render: (title: string, record) => (
				<div>
					<Text>{title || "—"}</Text>
					<Text type="tertiary" size="small" style={{ display: "block" }}>
						{[
							record.sha ? record.sha.slice(0, 7) : null,
							record.userName || null,
							formatDuration(record.duration),
							formatDateTime(record.createTime) || null,
						]
							.filter(Boolean)
							.join(" · ")}
					</Text>
				</div>
			),
		},
		{
			title: "日志",
			dataIndex: "buildLogUrl",
			width: 80,
			render: (url: string) =>
				url ? (
					<Text
						link={{ href: url, target: "_blank" }}
						style={{ whiteSpace: "nowrap" }}
					>
						查看
					</Text>
				) : (
					<Text type="tertiary">—</Text>
				),
		},
	];

	const columns = isMobile ? mobileColumns : desktopColumns;

	return (
		<div style={pageStyle}>
			{/* 吸顶区:标题行 + 说明文字一起 sticky */}
			<div style={stickyStyle}>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						flexWrap: "wrap",
						gap: 8,
						marginBottom: 16,
					}}
				>
					<Title heading={3} style={{ margin: 0 }}>
						构建记录
					</Title>
					<Space>
						{isFetching ? (
							<Text type="tertiary" size="small">
								刷新中…
							</Text>
						) : null}
						<Button
							icon={<IconRefresh />}
							onClick={() => refetch()}
							loading={isFetching}
						>
							刷新
						</Button>
					</Space>
				</div>

				<Text type="tertiary" style={{ display: "block" }}>
					CNB main 分支 push 事件的构建记录。有构建进行中时自动每 10
					秒刷新一次。
				</Text>
			</div>

			{isError ? (
				<Empty
					image={<div style={{ fontSize: 48 }}>⚠️</div>}
					title="读取构建记录失败"
					description={(error as Error)?.message || "请检查 CNB 配置或稍后重试"}
				>
					<Button onClick={() => refetch()}>重试</Button>
				</Empty>
			) : (
				<Table<BuildItem>
					columns={columns}
					dataSource={data?.builds ?? []}
					rowKey="sn"
					loading={isLoading}
					pagination={false}
				/>
			)}
		</div>
	);
}
