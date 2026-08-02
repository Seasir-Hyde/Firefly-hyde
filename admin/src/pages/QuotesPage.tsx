// 每日一言管理页：Table 列表 + Modal 编辑（text/author）+ Popconfirm 删除
// 数据走 Edge Functions + KV（单 key 存数组），秒级生效（无需 git 构建）
import {
	IconDelete,
	IconEdit,
	IconPlus,
	IconRefresh,
	IconSearch,
} from "@douyinfe/semi-icons";
import {
	Button,
	Empty,
	Input,
	Modal,
	Popconfirm,
	Space,
	Table,
	TextArea,
	Toast,
	Typography,
} from "@douyinfe/semi-ui";
import type { ColumnProps } from "@douyinfe/semi-ui/lib/es/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { type Quote, quotesApi, type SaveQuotePayload } from "@/api/quotes";
import { useModalProps } from "@/hooks/useModalProps";
import { usePageShell } from "@/hooks/usePageShell";

const { Title, Text } = Typography;

interface EditorState {
	id: string | null; // null = 新建
	text: string;
	author: string;
}

function emptyEditor(): EditorState {
	return { id: null, text: "", author: "" };
}

export function QuotesPage() {
	const queryClient = useQueryClient();
	const { isMobile, pageStyle, stickyStyle } = usePageShell();
	const modalProps = useModalProps(520);
	const [editorVisible, setEditorVisible] = useState(false);
	const [editor, setEditor] = useState<EditorState>(emptyEditor);
	const [keyword, setKeyword] = useState("");

	const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
		queryKey: ["quotes"],
		queryFn: () => quotesApi.list(),
	});

	const saveMutation = useMutation({
		mutationFn: (vars: { id: string | null; payload: SaveQuotePayload }) =>
			vars.id
				? quotesApi.update(vars.id, vars.payload)
				: quotesApi.create(vars.payload),
		onSuccess: () => {
			Toast.success("已保存，秒级生效");
			setEditorVisible(false);
			queryClient.invalidateQueries({ queryKey: ["quotes"] });
		},
		onError: (err: Error) => Toast.error(err.message || "保存失败"),
	});

	const removeMutation = useMutation({
		mutationFn: (id: string) => quotesApi.remove(id),
		onSuccess: () => {
			Toast.success("已删除");
			queryClient.invalidateQueries({ queryKey: ["quotes"] });
		},
		onError: (err: Error) => Toast.error(err.message || "删除失败"),
	});

	const openCreate = useCallback(() => {
		setEditor(emptyEditor());
		setEditorVisible(true);
	}, []);

	const openEdit = useCallback((q: Quote) => {
		setEditor({ id: q.id, text: q.text ?? "", author: q.author ?? "" });
		setEditorVisible(true);
	}, []);

	const handleSave = useCallback(() => {
		if (!editor.text.trim()) {
			Toast.warning("一言内容不能为空");
			return;
		}
		saveMutation.mutate({
			id: editor.id,
			payload: { text: editor.text.trim(), author: editor.author.trim() },
		});
	}, [editor, saveMutation]);

	const items = data?.quotes ?? [];
	const filtered = useMemo(() => {
		const kw = keyword.trim().toLowerCase();
		if (!kw) return items;
		return items.filter(
			(q) =>
				q.text.toLowerCase().includes(kw) ||
				(q.author ?? "").toLowerCase().includes(kw),
		);
	}, [items, keyword]);

	// 桌面 3 列(现状原样)
	const desktopColumns: ColumnProps<Quote>[] = [
		{
			title: "内容",
			dataIndex: "text",
			render: (text: string, record) => (
				<Text link={{ onClick: () => openEdit(record) }}>{text}</Text>
			),
		},
		{
			title: "作者",
			dataIndex: "author",
			width: 160,
			render: (author: string) =>
				author ? author : <Text type="tertiary">—</Text>,
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
						onClick={() => openEdit(record)}
					>
						编辑
					</Button>
					<Popconfirm
						title="确认删除这条一言？"
						content="删除后 KV 立即生效，不可撤销"
						okType="danger"
						onConfirm={() => removeMutation.mutate(record.id)}
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

	// 移动端 2 列:内容(副行=作者,作者独立列隐藏)+ 操作(仅图标)
	const mobileColumns: ColumnProps<Quote>[] = [
		{
			title: "内容",
			dataIndex: "text",
			render: (text: string, record) => (
				<div>
					<Text link={{ onClick: () => openEdit(record) }}>{text}</Text>
					{record.author ? (
						<Text type="tertiary" size="small" style={{ display: "block" }}>
							—— {record.author}
						</Text>
					) : null}
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
						onClick={() => openEdit(record)}
					/>
					<Popconfirm
						title="确认删除这条一言？"
						content="删除后 KV 立即生效，不可撤销"
						okType="danger"
						onConfirm={() => removeMutation.mutate(record.id)}
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

	return (
		<div style={pageStyle}>
			{/* 吸顶区:标题行 + 搜索区一起 sticky */}
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
						每日一言管理
					</Title>
					<Space>
						<Button
							icon={<IconRefresh />}
							onClick={() => refetch()}
							loading={isFetching}
						>
							刷新
						</Button>
						<Button
							icon={<IconPlus />}
							theme="solid"
							type="primary"
							onClick={openCreate}
						>
							新建一言
						</Button>
					</Space>
				</div>

				{/* 搜索框直接置于块级上下文(原单子项 Space 移除),小屏占满整行 */}
				<Input
					prefix={<IconSearch />}
					placeholder="搜索内容 / 作者"
					value={keyword}
					onChange={setKeyword}
					showClear
					style={{ width: isMobile ? "100%" : 280 }}
				/>
			</div>

			{isError ? (
				<Empty
					image={<div style={{ fontSize: 48 }}>⚠️</div>}
					title="读取一言失败"
					description={(error as Error)?.message || "请检查 KV 绑定或稍后重试"}
				>
					<Button onClick={() => refetch()}>重试</Button>
				</Empty>
			) : (
				<Table<Quote>
					columns={columns}
					dataSource={filtered}
					rowKey="id"
					loading={isLoading}
					empty={
						<Empty title="还没有一言" description="点击右上角新建第一条" />
					}
					pagination={{
						pageSize: 15,
						formatPageText: (p) => `共 ${p?.total ?? 0} 条`,
					}}
				/>
			)}

			<Modal
				title={editor.id ? "编辑一言" : "新建一言"}
				visible={editorVisible}
				onOk={handleSave}
				onCancel={() => setEditorVisible(false)}
				confirmLoading={saveMutation.isPending}
				okText="保存"
				cancelText="取消"
				maskClosable={false}
				{...modalProps}
			>
				<Space vertical align="start" style={{ width: "100%" }} spacing={16}>
					<div style={{ width: "100%" }}>
						<Text strong>内容</Text>
						<TextArea
							value={editor.text}
							onChange={(v) => setEditor((e) => ({ ...e, text: v }))}
							placeholder="一言正文…"
							autosize={{ minRows: 2, maxRows: 5 }}
							style={{ marginTop: 4 }}
						/>
					</div>
					<div style={{ width: "100%" }}>
						<Text strong>作者</Text>
						<Input
							value={editor.author}
							onChange={(v) => setEditor((e) => ({ ...e, author: v }))}
							placeholder="如 苏轼（可留空）"
							style={{ marginTop: 4 }}
						/>
					</div>
				</Space>
			</Modal>
		</div>
	);
}
