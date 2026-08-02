// 公告管理页：Table 列表 + Modal 编辑（含可选链接）+ Popconfirm 删除
// 数据走 Edge Functions + KV（单 key 存数组），秒级生效（无需 git 构建）
import {
	IconDelete,
	IconEdit,
	IconPlus,
	IconRefresh,
} from "@douyinfe/semi-icons";
import {
	Button,
	Empty,
	Input,
	Modal,
	Popconfirm,
	Space,
	Switch,
	Table,
	Tag,
	TextArea,
	Toast,
	Typography,
} from "@douyinfe/semi-ui";
import type { ColumnProps } from "@douyinfe/semi-ui/lib/es/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import {
	type Announcement,
	announcementsApi,
	type SaveAnnouncementPayload,
} from "@/api/announcements";
import { useModalProps } from "@/hooks/useModalProps";
import { usePageShell } from "@/hooks/usePageShell";

const { Title, Text } = Typography;

// 编辑器表单状态（受控）
interface EditorState {
	id: string | null; // null = 新建
	title: string;
	content: string;
	closable: boolean;
	linkEnable: boolean;
	linkText: string;
	linkUrl: string;
	linkExternal: boolean;
}

function emptyEditor(): EditorState {
	return {
		id: null,
		title: "",
		content: "",
		closable: true,
		linkEnable: true,
		linkText: "",
		linkUrl: "",
		linkExternal: false,
	};
}

function editorFromItem(a: Announcement): EditorState {
	return {
		id: a.id,
		title: a.title ?? "",
		content: a.content ?? "",
		closable: a.closable ?? true,
		linkEnable: a.link?.enable ?? true,
		linkText: a.link?.text ?? "",
		linkUrl: a.link?.url ?? "",
		linkExternal: a.link?.external ?? false,
	};
}

// 编辑器 state → API payload（无 url 则不下发 link）
function editorToPayload(e: EditorState): SaveAnnouncementPayload {
	const payload: SaveAnnouncementPayload = {
		title: e.title.trim(),
		content: e.content,
		closable: e.closable,
	};
	if (e.linkUrl.trim()) {
		payload.link = {
			enable: e.linkEnable,
			text: e.linkText.trim(),
			url: e.linkUrl.trim(),
			external: e.linkExternal,
		};
	} else {
		payload.link = null; // 显式清除
	}
	return payload;
}

export function AnnouncementsPage() {
	const queryClient = useQueryClient();
	const { isMobile, pageStyle, stickyStyle } = usePageShell();
	const modalProps = useModalProps(560);
	const [editorVisible, setEditorVisible] = useState(false);
	const [editor, setEditor] = useState<EditorState>(emptyEditor);

	const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
		queryKey: ["announcements"],
		queryFn: () => announcementsApi.list(),
	});

	const saveMutation = useMutation({
		mutationFn: (vars: {
			id: string | null;
			payload: SaveAnnouncementPayload;
		}) =>
			vars.id
				? announcementsApi.update(vars.id, vars.payload)
				: announcementsApi.create(vars.payload),
		onSuccess: () => {
			Toast.success("已保存，秒级生效");
			setEditorVisible(false);
			queryClient.invalidateQueries({ queryKey: ["announcements"] });
		},
		onError: (err: Error) => Toast.error(err.message || "保存失败"),
	});

	const removeMutation = useMutation({
		mutationFn: (id: string) => announcementsApi.remove(id),
		onSuccess: () => {
			Toast.success("已删除");
			queryClient.invalidateQueries({ queryKey: ["announcements"] });
		},
		onError: (err: Error) => Toast.error(err.message || "删除失败"),
	});

	const openCreate = useCallback(() => {
		setEditor(emptyEditor());
		setEditorVisible(true);
	}, []);

	const openEdit = useCallback((a: Announcement) => {
		setEditor(editorFromItem(a));
		setEditorVisible(true);
	}, []);

	const handleSave = useCallback(() => {
		if (!editor.content.trim()) {
			Toast.warning("公告内容不能为空");
			return;
		}
		saveMutation.mutate({ id: editor.id, payload: editorToPayload(editor) });
	}, [editor, saveMutation]);

	const items = data?.announcements ?? [];

	// 桌面 5 列(现状原样)
	const desktopColumns: ColumnProps<Announcement>[] = [
		{
			title: "标题",
			dataIndex: "title",
			width: 180,
			render: (title: string, record) => (
				<Text link={{ onClick: () => openEdit(record) }} strong>
					{title || <Text type="tertiary">（无标题）</Text>}
				</Text>
			),
		},
		{
			title: "内容",
			dataIndex: "content",
			render: (content: string) => (
				<Text ellipsis={{ showTooltip: true }} style={{ maxWidth: 360 }}>
					{content}
				</Text>
			),
		},
		{
			title: "链接",
			dataIndex: "link",
			width: 120,
			render: (_: unknown, record) =>
				record.link?.url ? (
					<Tag color="blue">{record.link.text || "有链接"}</Tag>
				) : (
					<Text type="tertiary">—</Text>
				),
		},
		{
			title: "可关闭",
			dataIndex: "closable",
			width: 80,
			render: (closable: boolean) =>
				closable ? <Tag color="green">是</Tag> : <Tag color="grey">否</Tag>,
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
						title="确认删除该公告？"
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

	// 移动端 2 列:标题(副行=内容单行省略;链接/不可关闭以小 Tag 缀于标题后)+ 操作(仅图标)
	const mobileColumns: ColumnProps<Announcement>[] = [
		{
			title: "公告",
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
						<Text link={{ onClick: () => openEdit(record) }} strong>
							{title || <Text type="tertiary">（无标题）</Text>}
						</Text>
						{record.link?.url ? (
							<Tag color="blue" size="small">
								{record.link.text || "有链接"}
							</Tag>
						) : null}
						{record.closable ? null : (
							<Tag color="grey" size="small">
								不可关闭
							</Tag>
						)}
					</div>
					<Text
						type="tertiary"
						size="small"
						ellipsis={{ showTooltip: false }}
						style={{ maxWidth: 220 }}
					>
						{record.content}
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
						onClick={() => openEdit(record)}
					/>
					<Popconfirm
						title="确认删除该公告？"
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
			{/* 吸顶区:标题行 sticky */}
			<div style={stickyStyle}>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						flexWrap: "wrap",
						gap: 8,
					}}
				>
					<Title heading={3} style={{ margin: 0 }}>
						公告管理
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
							新建公告
						</Button>
					</Space>
				</div>
			</div>

			{isError ? (
				<Empty
					image={<div style={{ fontSize: 48 }}>⚠️</div>}
					title="读取公告失败"
					description={(error as Error)?.message || "请检查 KV 绑定或稍后重试"}
				>
					<Button onClick={() => refetch()}>重试</Button>
				</Empty>
			) : (
				<Table<Announcement>
					columns={columns}
					dataSource={items}
					rowKey="id"
					loading={isLoading}
					empty={
						<Empty title="还没有公告" description="点击右上角新建第一条" />
					}
					pagination={{
						pageSize: 10,
						formatPageText: (p) => `共 ${p?.total ?? 0} 条`,
					}}
				/>
			)}

			<Modal
				title={editor.id ? "编辑公告" : "新建公告"}
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
						<Text strong>标题</Text>
						<Input
							value={editor.title}
							onChange={(v) => setEditor((e) => ({ ...e, title: v }))}
							placeholder="如 📢 欢迎来访者"
							style={{ marginTop: 4 }}
						/>
					</div>

					<div style={{ width: "100%" }}>
						<Text strong>内容</Text>
						<TextArea
							value={editor.content}
							onChange={(v) => setEditor((e) => ({ ...e, content: v }))}
							placeholder="公告正文…"
							autosize={{ minRows: 2, maxRows: 6 }}
							style={{ marginTop: 4 }}
						/>
					</div>

					<Space align="center">
						<Text strong>允许访客关闭</Text>
						<Switch
							checked={editor.closable}
							onChange={(v) => setEditor((e) => ({ ...e, closable: v }))}
						/>
					</Space>

					<div style={{ width: "100%" }}>
						<Text strong>链接（可选）</Text>
						<Input
							value={editor.linkUrl}
							onChange={(v) => setEditor((e) => ({ ...e, linkUrl: v }))}
							placeholder="链接 URL，留空则不显示链接"
							style={{ marginTop: 4 }}
						/>
					</div>

					{editor.linkUrl.trim() ? (
						<>
							<div style={{ width: "100%" }}>
								<Text strong>链接文字</Text>
								<Input
									value={editor.linkText}
									onChange={(v) => setEditor((e) => ({ ...e, linkText: v }))}
									placeholder="如 了解更多"
									style={{ marginTop: 4 }}
								/>
							</div>
							<Space align="center">
								<Text strong>启用链接</Text>
								<Switch
									checked={editor.linkEnable}
									onChange={(v) => setEditor((e) => ({ ...e, linkEnable: v }))}
								/>
								<Text strong style={{ marginLeft: 16 }}>
									新窗口打开
								</Text>
								<Switch
									checked={editor.linkExternal}
									onChange={(v) =>
										setEditor((e) => ({ ...e, linkExternal: v }))
									}
								/>
							</Space>
						</>
					) : null}
				</Space>
			</Modal>
		</div>
	);
}
