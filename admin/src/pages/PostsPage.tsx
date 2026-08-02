// 文章管理列表页：Table 展示 CNB 仓库文章，支持搜索 / 草稿筛选 / 新建 / 编辑 / 删除
// 数据读走 Edge Functions（CNB contents/raw），删除 / 批量发布草稿走 Cloud Functions（git push）
// 「存草稿（不构建）」仍在编辑页；本页「发布全部草稿」把已入库的 draft 一次改为正式并触发构建
import {
	IconDelete,
	IconEdit,
	IconPlus,
	IconRefresh,
	IconSearch,
	IconSend,
} from "@douyinfe/semi-icons";
import {
	Button,
	Empty,
	Input,
	Modal,
	Popconfirm,
	Select,
	Space,
	Table,
	Tag,
	Toast,
	Typography,
} from "@douyinfe/semi-ui";
import type { ColumnProps } from "@douyinfe/semi-ui/lib/es/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { type PostListItem, postsApi } from "@/api/posts";
import { BusySpin } from "@/components/BusySpin";
import { usePageShell } from "@/hooks/usePageShell";

const { Title, Text } = Typography;

// 草稿筛选选项
type DraftFilter = "all" | "published" | "draft";

export function PostsPage() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { isMobile, pageStyle, stickyStyle } = usePageShell();
	const [keyword, setKeyword] = useState("");
	const [draftFilter, setDraftFilter] = useState<DraftFilter>("all");

	const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
		queryKey: ["posts"],
		queryFn: () => postsApi.list(),
	});

	const removeMutation = useMutation({
		mutationFn: (path: string) => postsApi.remove(path),
		onSuccess: (res) => {
			Toast.success(
				`已提交删除，构建约 3-5 分钟后生效（${res.commit.slice(0, 7)}）`,
			);
			queryClient.invalidateQueries({ queryKey: ["posts"] });
		},
		onError: (err: Error) => {
			Toast.error(err.message || "删除失败");
		},
	});

	// 仓库中 draft:true 的文章数（与列表筛选无关，用于按钮禁用与确认文案）
	const draftCount = useMemo(
		() => (data?.posts ?? []).filter((p) => p.draft).length,
		[data?.posts],
	);

	// 批量发布全部草稿：一次 commit 去掉 draft 并 push，触发博客构建
	const publishDraftsMutation = useMutation({
		mutationFn: () => postsApi.publishDrafts(),
		onSuccess: (res) => {
			if (!res.published.length) {
				Toast.info("当前没有草稿需要发布");
				return;
			}
			const names = res.published
				.map((p) => p.title)
				.slice(0, 5)
				.join("、");
			const more =
				res.published.length > 5
					? ` 等 ${res.published.length} 篇`
					: `（共 ${res.published.length} 篇）`;
			const short = res.commit ? res.commit.slice(0, 7) : "";
			Modal.success({
				title: "草稿已批量发布",
				content: `已将 ${names}${more} 设为正式文章并提交仓库${short ? `（${short}）` : ""}。博客约 3–5 分钟后重建上线，可到「构建记录」查看进度。`,
				...(window.innerWidth < 768
					? { width: window.innerWidth - 32 }
					: {}),
			});
			queryClient.invalidateQueries({ queryKey: ["posts"] });
		},
		onError: (err: Error) => {
			Toast.error(err.message || "批量发布失败");
		},
	});

	// 前端过滤：关键词匹配标题/路径/分类/标签，叠加草稿筛选
	const filtered = useMemo(() => {
		const posts = data?.posts ?? [];
		const kw = keyword.trim().toLowerCase();
		return posts.filter((p) => {
			if (draftFilter === "published" && p.draft) return false;
			if (draftFilter === "draft" && !p.draft) return false;
			if (!kw) return true;
			const haystack = [p.title, p.path, p.category, ...p.tags]
				.join(" ")
				.toLowerCase();
			return haystack.includes(kw);
		});
	}, [data?.posts, keyword, draftFilter]);

	// 桌面 5 列(现状原样)
	const desktopColumns: ColumnProps<PostListItem>[] = [
		{
			title: "标题",
			dataIndex: "title",
			render: (title: string, record) => (
				<div>
					<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
						<Text
							link={{
								onClick: () =>
									navigate(
										`/posts/edit?path=${encodeURIComponent(record.path)}`,
									),
							}}
							strong
						>
							{title}
						</Text>
						{record.pinned ? (
							<Tag color="amber" size="small">
								置顶
							</Tag>
						) : null}
						{record.draft ? (
							<Tag color="grey" size="small">
								草稿
							</Tag>
						) : null}
					</div>
					<Text type="tertiary" size="small">
						{record.path}
					</Text>
				</div>
			),
		},
		{
			title: "分类",
			dataIndex: "category",
			width: 120,
			render: (category: string) =>
				category ? (
					<Tag color="blue">{category}</Tag>
				) : (
					<Text type="tertiary">—</Text>
				),
		},
		{
			title: "标签",
			dataIndex: "tags",
			width: 200,
			render: (tags: string[]) =>
				tags.length > 0 ? (
					<Space wrap spacing={4}>
						{tags.map((t) => (
							<Tag key={t} size="small" color="light-blue">
								{t}
							</Tag>
						))}
					</Space>
				) : (
					<Text type="tertiary">—</Text>
				),
		},
		{
			title: "发布日期",
			dataIndex: "published",
			width: 120,
			sorter: (a?: PostListItem, b?: PostListItem) =>
				(a?.published ?? "").localeCompare(b?.published ?? ""),
			render: (published: string) => (
				<Text type="tertiary">{published || "—"}</Text>
			),
		},
		{
			title: "操作",
			dataIndex: "operate",
			width: 140,
			render: (_: unknown, record) => (
				<Space>
					<Button
						icon={<IconEdit />}
						size="small"
						theme="borderless"
						onClick={() =>
							navigate(`/posts/edit?path=${encodeURIComponent(record.path)}`)
						}
					>
						编辑
					</Button>
					<Popconfirm
						title="确认删除该文章？"
						content="删除会提交一次 git commit 并触发博客重建，不可撤销"
						okType="danger"
						onConfirm={() => removeMutation.mutateAsync(record.path)}
					>
						<Button
							icon={<IconDelete />}
							size="small"
							theme="borderless"
							type="danger"
						>
							删除
						</Button>
					</Popconfirm>
				</Space>
			),
		},
	];

	// 移动端 2 列:标题(副行合并 分类·发布日期·路径,分类/标签/日期独立列隐藏)+ 操作(仅图标)
	const mobileColumns: ColumnProps<PostListItem>[] = [
		{
			title: "标题",
			dataIndex: "title",
			render: (title: string, record) => (
				<div>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: 8,
							flexWrap: "wrap",
						}}
					>
						<Text
							link={{
								onClick: () =>
									navigate(
										`/posts/edit?path=${encodeURIComponent(record.path)}`,
									),
							}}
							strong
						>
							{title}
						</Text>
						{record.pinned ? (
							<Tag color="amber" size="small">
								置顶
							</Tag>
						) : null}
						{record.draft ? (
							<Tag color="grey" size="small">
								草稿
							</Tag>
						) : null}
					</div>
					<Text type="tertiary" size="small">
						{[record.category, record.published, record.path]
							.filter(Boolean)
							.join(" · ")}
					</Text>
				</div>
			),
		},
		{
			title: "操作",
			dataIndex: "operate",
			width: 90,
			render: (_: unknown, record) => (
				<Space spacing={0}>
					<Button
						icon={<IconEdit />}
						size="small"
						theme="borderless"
						aria-label="编辑"
						onClick={() =>
							navigate(`/posts/edit?path=${encodeURIComponent(record.path)}`)
						}
					/>
					<Popconfirm
						title="确认删除该文章？"
						content="删除会提交一次 git commit 并触发博客重建，不可撤销"
						okType="danger"
						onConfirm={() => removeMutation.mutateAsync(record.path)}
					>
						<Button
							icon={<IconDelete />}
							size="small"
							theme="borderless"
							type="danger"
							aria-label="删除"
						/>
					</Popconfirm>
				</Space>
			),
		},
	];

	const columns = isMobile ? mobileColumns : desktopColumns;
	const busy = removeMutation.isPending || publishDraftsMutation.isPending;

	return (
		<BusySpin
			spinning={busy}
			tip={
				publishDraftsMutation.isPending
					? "正在批量发布草稿并提交到仓库，约需数十秒…"
					: "正在删除并提交到仓库，约需数十秒…"
			}
		>
			<div style={pageStyle}>
				{/* 吸顶区:标题行 + 搜索区一起 sticky,滚动时钉在内容区顶部 */}
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
							文章管理
						</Title>
						<Space wrap>
							<Popconfirm
								title="确认发布全部草稿？"
								content={
									draftCount > 0
										? `将把 ${draftCount} 篇草稿改为正式文章，并 git push 触发博客构建（约 3–5 分钟上线）。编辑页「存草稿（不构建）」逻辑不变。`
										: "当前没有草稿。"
								}
								okType="primary"
								okText="发布全部草稿"
								disabled={draftCount === 0 || publishDraftsMutation.isPending}
								onConfirm={() => publishDraftsMutation.mutateAsync()}
							>
								<Button
									icon={<IconSend />}
									disabled={draftCount === 0 || publishDraftsMutation.isPending}
									loading={publishDraftsMutation.isPending}
								>
									{draftCount > 0
										? `发布全部草稿（${draftCount}）`
										: "发布全部草稿"}
								</Button>
							</Popconfirm>
							<Button
								icon={<IconPlus />}
								theme="solid"
								type="primary"
								onClick={() => navigate("/posts/new")}
							>
								新建文章
							</Button>
						</Space>
					</div>

					{/* 搜索行:小屏输入框占满整行,筛选/刷新换行排布 */}
					<div
						style={{
							display: "flex",
							alignItems: "center",
							flexWrap: "wrap",
							gap: 8,
						}}
					>
						<Input
							prefix={<IconSearch />}
							placeholder="搜索标题 / 路径 / 分类 / 标签"
							value={keyword}
							onChange={setKeyword}
							showClear
							style={{ width: isMobile ? "100%" : 280 }}
						/>
						<Select
							value={draftFilter}
							onChange={(v) => setDraftFilter(v as DraftFilter)}
							style={{ width: 120 }}
						>
							<Select.Option value="all">全部</Select.Option>
							<Select.Option value="published">已发布</Select.Option>
							<Select.Option value="draft">草稿</Select.Option>
						</Select>
						<Button
							icon={<IconRefresh />}
							onClick={() => refetch()}
							loading={isFetching}
						>
							刷新
						</Button>
					</div>
				</div>

				{isError ? (
					<Empty
						image={<div style={{ fontSize: 48 }}>⚠️</div>}
						title="读取文章列表失败"
						description={(error as Error)?.message || "请检查 CNB 配置或稍后重试"}
					>
						<Button onClick={() => refetch()}>重试</Button>
					</Empty>
				) : (
					<Table<PostListItem>
						columns={columns}
						dataSource={filtered}
						rowKey="path"
						loading={isLoading}
						pagination={{
							pageSize: 15,
							formatPageText: (p) => `共 ${p?.total ?? 0} 篇`,
						}}
					/>
				)}
			</div>
		</BusySpin>
	);
}
