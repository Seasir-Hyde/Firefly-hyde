// 资料数据管理页：友链 / 项目 / 设备 / 技能 / 时间线 5 个 Tab
//
// 通道：
//   - 友链 / 设备：KV 通道（Edge Functions），保存约 1 分钟内前台生效、无需构建
//   - 项目 / 技能 / 时间线：Git 通道（Cloud Functions），PUT 写回仓库并触发构建约 3-5 分钟
//
// 交互：本地暂存 + 显式保存。每个 Tab 独立维护本地行数据，增删改只改本地状态并标 dirty，
// 点「保存」/「保存到仓库」才整体 PUT。设备是嵌套「类别→设备数组」，加载时拍平成带类别列的行，
// 保存时按类别重组回嵌套对象。
//
// 布局一律用原生 <div>（Semi 2.83 的 <Space vertical/align> 在此环境报 TS2322，坑 18）。
import {
	IconCheckCircleStroked,
	IconDelete,
	IconEdit,
	IconPlus,
	IconRefresh,
	IconSave,
	IconUpload,
} from "@douyinfe/semi-icons";
import {
	Banner,
	Button,
	Empty,
	Image,
	Input,
	InputNumber,
	Modal,
	Popconfirm,
	Select,
	Switch,
	Table,
	TabPane,
	Tabs,
	Tag,
	TagInput,
	TextArea,
	Toast,
	Typography,
} from "@douyinfe/semi-ui";
import type { ColumnProps, RowKey } from "@douyinfe/semi-ui/lib/es/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useCallback, useEffect, useState } from "react";
// 现代图片预览:手指捏合/双击/滑动切换/滚轮缩放(Semi ImagePreview 无触摸手势,站长拍板引入);
// AdminPhotoProvider 在其上增强下载/复制链接/切换箭头/底部缩略图条
import { PhotoView } from "react-photo-view";
import {
	type DataName,
	type Device,
	dataApi,
	type FriendLink,
	type Project,
	type Skill,
	type TimelineItem,
	type TimelineLink,
} from "@/api/data";
import { type DeviceCategory, devicesApi } from "@/api/devices";
import {
	type FriendApplication,
	type FriendApplicationStatus,
	friendApplicationsApi,
} from "@/api/friendApplications";
import { friendsApi } from "@/api/friends";
import { AdminPhotoProvider } from "@/components/AdminPhotoProvider";
import { BusySpin } from "@/components/BusySpin";
import { QiniuUpload } from "@/components/QiniuUpload";
import { useModalProps } from "@/hooks/useModalProps";
import { usePageShell } from "@/hooks/usePageShell";

const { Title, Text } = Typography;

// ---------- 小工具 ----------

// 深拷贝一行（这些都是可 JSON 序列化的纯数据）
function clone<T>(v: T): T {
	return JSON.parse(JSON.stringify(v)) as T;
}

// 去掉空值键（undefined / 空字符串 / 空数组），让写回的 JSON 贴近手写风格
function compact<T extends Record<string, unknown>>(o: T): T {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(o)) {
		if (v === undefined || v === null) continue;
		if (typeof v === "string" && v.trim() === "") continue;
		if (Array.isArray(v) && v.length === 0) continue;
		out[k] = v;
	}
	return out as T;
}

// 表单字段：标题 + 控件，纵向排列（原生 div，不用 Space vertical）
function Field({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div style={{ marginBottom: 12 }}>
			<div style={{ marginBottom: 4, fontSize: 13, fontWeight: 600 }}>
				{label}
			</div>
			{children}
		</div>
	);
}

// 图片 URL 输入 + 预览；旁挂七牛直传按钮（上传成功回填 URL，图床未启用时按钮置灰）
function ImageUrlField({
	label,
	value,
	onChange,
	placeholder,
}: {
	label: string;
	value: string;
	onChange: (v: string) => void;
	placeholder?: string;
}) {
	return (
		<Field label={label}>
			<div style={{ display: "flex", gap: 8 }}>
				<Input
					value={value}
					onChange={onChange}
					placeholder={placeholder ?? "图片 URL（粘贴或上传）"}
				/>
				<QiniuUpload onUploaded={onChange} showUploadList={false}>
					<Button icon={<IconUpload />}>上传</Button>
				</QiniuUpload>
			</div>
			{value.trim() ? (
				<div style={{ marginTop: 8 }}>
					<AdminPhotoProvider>
						<PhotoView src={value}>
							<div style={{ cursor: "zoom-in", width: 120, height: 120 }}>
								<Image
									src={value}
									preview={false}
									width={120}
									height={120}
									style={{ objectFit: "cover", borderRadius: 6 }}
								/>
							</div>
						</PhotoView>
					</AdminPhotoProvider>
				</div>
			) : null}
		</Field>
	);
}

// 标签输入：显式「添加」按钮 + 可删除标签块。
// 不依赖回车/失焦/输入法等自动时机（Semi TagInput 的 addOnBlur/separator 在移动端软键盘 +
// 中文输入法下不可靠：失焦不触发、无 maxLength 时 IME 结束直接 return），点按钮 100% 能加。
function TagListField({
	label,
	value,
	onChange,
	placeholder,
}: {
	label: string;
	value: string[];
	onChange: (v: string[]) => void;
	placeholder?: string;
}) {
	const [input, setInput] = useState("");
	const tags = value ?? [];

	const addTag = () => {
		const t = input.trim();
		if (!t) return;
		if (tags.includes(t)) {
			setInput("");
			return;
		}
		onChange([...tags, t]);
		setInput("");
	};

	const removeTag = (idx: number) => {
		onChange(tags.filter((_, i) => i !== idx));
	};

	return (
		<Field label={label}>
			<div style={{ display: "flex", gap: 8 }}>
				<Input
					value={input}
					onChange={setInput}
					onEnterPress={addTag}
					placeholder={placeholder ?? "输入后点「添加」"}
				/>
				<Button icon={<IconPlus />} onClick={addTag}>
					添加
				</Button>
			</div>
			{tags.length > 0 ? (
				<div
					style={{
						display: "flex",
						flexWrap: "wrap",
						gap: 8,
						marginTop: 8,
					}}
				>
					{tags.map((tag, idx) => (
						<Tag
							// biome-ignore lint/suspicious/noArrayIndexKey: 标签为本地临时编辑项，无稳定 id，索引即身份
							key={idx}
							closable
							onClose={() => removeTag(idx)}
							size="large"
						>
							{tag}
						</Tag>
					))}
				</div>
			) : null}
		</Field>
	);
}

// ---------- 通用面板：加载 → 本地编辑 → dirty → 整体保存 ----------

// biome-ignore lint/suspicious/noExplicitAny: ColumnProps 要求 RecordType extends Record<string, any>，interface 数据类型满足它但 Record<string, unknown> 不行
interface DataTabPanelProps<T extends Record<string, any>> {
	name: DataName;
	addLabel: string;
	rowKey: RowKey<T>;
	columns: (h: {
		edit: (index: number) => void;
		remove: (index: number) => void;
	}) => ColumnProps<T>[];
	emptyRow: () => T;
	renderForm: (draft: T, set: (updater: (d: T) => T) => void) => ReactNode;
	validate?: (draft: T) => string | null;
	fromStore: (data: unknown) => T[];
	toStore: (rows: T[]) => unknown;
	emptyText: string;
	/** 移动端表格横向滚动宽度(≥各列固定宽之和;桌面不传 scroll,DOM 零变化) */
	mobileScrollX: number;
	// ---- 以下为通道可选项：默认走 Git（dataApi），友链走 KV 时覆盖 ----
	/** react-query 缓存键，默认 ["data", name] */
	queryKey?: readonly unknown[];
	/** 数据加载器：返回 fromStore 可消费的原始 payload。默认 dataApi.get(name).data */
	loader?: () => Promise<unknown>;
	/** 保存器：接收 toStore 产出的 payload 整体写回。默认 dataApi.save(name, ...) */
	saver?: (payload: unknown) => Promise<unknown>;
	/** 保存成功提示文案，默认 Git 通道的「已提交，构建约 3-5 分钟后生效」 */
	savedMessage?: string;
	/** dirty 状态 Banner 文案，默认 Git 通道版 */
	dirtyHint?: string;
	/** 保存按钮文案，默认「保存到仓库」 */
	saveLabel?: string;
	/** 保存成功后是否刷新构建记录查询（仅 Git 通道触发构建才需要），默认 true */
	invalidateBuilds?: boolean;
}

// biome-ignore lint/suspicious/noExplicitAny: 同上，约束需与 ColumnProps<T> 一致
function DataTabPanel<T extends Record<string, any>>(
	props: DataTabPanelProps<T>,
) {
	const {
		name,
		addLabel,
		rowKey,
		columns,
		emptyRow,
		renderForm,
		validate,
		fromStore,
		toStore,
		emptyText,
		mobileScrollX,
		queryKey,
		loader,
		saver,
		savedMessage,
		dirtyHint,
		saveLabel,
		invalidateBuilds = true,
	} = props;
	const queryClient = useQueryClient();
	const { isMobile } = usePageShell();
	const modalProps = useModalProps(600);

	// 默认走 Git 通道（dataApi）；传入 loader/saver 时改走该通道（如友链走 KV）。
	// useQuery 统一返回 { data } 形状，故 Git 通道取 .data 对齐 loader 的裸 payload。
	const resolvedQueryKey = queryKey ?? ["data", name];
	const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
		queryKey: resolvedQueryKey,
		queryFn: async () => {
			if (loader) return { data: await loader() };
			const res = await dataApi.get(name);
			return { data: res.data };
		},
	});

	// 本地行数据（null = 尚未从服务端初始化）
	const [rows, setRows] = useState<T[] | null>(null);
	// 上次「与服务端一致」的快照（用于 dirty 比对）
	const [baseline, setBaseline] = useState<string>("");

	// 编辑弹窗
	const [editorVisible, setEditorVisible] = useState(false);
	const [editIndex, setEditIndex] = useState<number | null>(null); // null = 新建
	const [draft, setDraft] = useState<T | null>(null);

	// 服务端数据到达（或 refetch 后）重新灌入本地
	// queryFn 统一把原始 payload 包成 { data }（Git 通道取 res.data，KV loader 直接返回），此处取 data.data
	// biome-ignore lint/correctness/useExhaustiveDependencies: fromStore/toStore 在各调用点是稳定字面量，只需 data 变化时重灌
	useEffect(() => {
		if (data) {
			const seeded = fromStore(data.data);
			setRows(seeded);
			setBaseline(JSON.stringify(toStore(seeded)));
		}
	}, [data]);

	const dirty = rows !== null && JSON.stringify(toStore(rows)) !== baseline;

	const saveMutation = useMutation({
		mutationFn: () => {
			const payload = toStore(rows ?? []);
			return saver
				? saver(payload)
				: dataApi.save(name, payload, `数据: 更新 ${name}.json`);
		},
		onSuccess: () => {
			Toast.success(savedMessage ?? "已提交，构建约 3-5 分钟后生效");
			if (rows) setBaseline(JSON.stringify(toStore(rows)));
			// 仅 Git 通道保存会触发构建，需刷新构建记录；KV 通道跳过
			if (invalidateBuilds) {
				queryClient.invalidateQueries({ queryKey: ["builds"] });
			}
		},
		onError: (err: Error) => Toast.error(err.message || "保存失败"),
	});

	const openCreate = () => {
		setDraft(emptyRow());
		setEditIndex(null);
		setEditorVisible(true);
	};

	const openEdit = (index: number) => {
		if (!rows) return;
		setDraft(clone(rows[index]));
		setEditIndex(index);
		setEditorVisible(true);
	};

	const removeRow = (index: number) => {
		setRows((rs) => (rs ? rs.filter((_, i) => i !== index) : rs));
	};

	const handleModalOk = () => {
		if (!draft) return;
		const err = validate?.(draft);
		if (err) {
			Toast.warning(err);
			return;
		}
		setRows((rs) => {
			const base = rs ? [...rs] : [];
			if (editIndex === null) {
				base.push(draft);
			} else {
				base[editIndex] = draft;
			}
			return base;
		});
		setEditorVisible(false);
	};

	const resetLocal = () => {
		if (data) {
			const seeded = fromStore(data.data);
			setRows(seeded);
			setBaseline(JSON.stringify(toStore(seeded)));
			Toast.info("已放弃本地修改");
		}
	};

	const patchDraft = (updater: (d: T) => T) =>
		setDraft((d) => (d ? updater(d) : d));

	const items = rows ?? [];

	return (
		<BusySpin
			spinning={saveMutation.isPending}
			tip={
				invalidateBuilds
					? "正在提交到仓库，约需数十秒…"
					: "正在保存…"
			}
		>
			<div>
			{/* 顶部操作栏 */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					marginBottom: 12,
					gap: 8,
					flexWrap: "wrap",
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
					<Button
						icon={<IconPlus />}
						theme="solid"
						type="primary"
						onClick={openCreate}
						disabled={isLoading || isError}
					>
						{addLabel}
					</Button>
					<Button
						icon={<IconRefresh />}
						onClick={() => refetch()}
						loading={isFetching}
					>
						重新加载
					</Button>
				</div>
				<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
					{dirty ? (
						<Popconfirm
							title="放弃本地修改？"
							content="将丢弃未保存的增删改，恢复到服务端当前内容"
							okType="danger"
							onConfirm={resetLocal}
						>
							<Button type="tertiary">放弃修改</Button>
						</Popconfirm>
					) : null}
					<Button
						icon={<IconSave />}
						theme="solid"
						type="primary"
						disabled={!dirty}
						loading={saveMutation.isPending}
						onClick={() => saveMutation.mutate()}
					>
						{saveLabel ?? "保存到仓库"}
					</Button>
				</div>
			</div>

			{/* dirty 提示 */}
			{dirty ? (
				<Banner
					type="warning"
					description={
						dirtyHint ??
						"本地有未保存的修改。点击「保存到仓库」写回并触发构建（约 3-5 分钟生效）。"
					}
					style={{ marginBottom: 12 }}
					closeIcon={null}
				/>
			) : null}

			{isError ? (
				<Empty
					image={<div style={{ fontSize: 48 }}>⚠️</div>}
					title="读取失败"
					description={(error as Error)?.message || "请检查 CNB 通道或稍后重试"}
				>
					<Button onClick={() => refetch()}>重试</Button>
				</Empty>
			) : (
				// 整表包一层:图片列的 PhotoView 注册进同一预览组,点任一小图可切换整组
				<AdminPhotoProvider>
					<Table<T>
						columns={columns({ edit: openEdit, remove: removeRow })}
						dataSource={items}
						rowKey={rowKey}
						loading={isLoading}
						empty={
							<Empty title={emptyText} description="点击左上角新建第一条" />
						}
						// 移动端保持表格形态、区域内横向滑动(已拍板不做精简列);桌面不传 scroll
						scroll={isMobile ? { x: mobileScrollX } : undefined}
						pagination={{
							pageSize: 10,
							formatPageText: (p) => `共 ${p?.total ?? 0} 条`,
						}}
					/>
				</AdminPhotoProvider>
			)}

			<Modal
				title={
					editIndex === null ? `新建${addLabel.replace(/^新建/, "")}` : "编辑"
				}
				visible={editorVisible}
				onOk={handleModalOk}
				onCancel={() => setEditorVisible(false)}
				okText="确定"
				cancelText="取消"
				maskClosable={false}
				// 桌面 width 600 + 原 70vh 限高;小屏 fullScreen + 全屏滚动(均由 useModalProps 提供)
				{...modalProps}
				bodyStyle={
					modalProps.bodyStyle ?? { maxHeight: "70vh", overflowY: "auto" }
				}
			>
				{draft ? renderForm(draft, patchDraft) : null}
			</Modal>
		</div>
		</BusySpin>
	);
}

// ---------- 操作列（编辑 / 删除），各 Tab 复用 ----------

// biome-ignore lint/suspicious/noExplicitAny: 同上，约束需与 ColumnProps<T> 一致
function opColumn<T extends Record<string, any>>(h: {
	edit: (index: number) => void;
	remove: (index: number) => void;
}): ColumnProps<T> {
	return {
		title: "操作",
		dataIndex: "_op",
		width: 150,
		render: (_: unknown, _record: T, index: number) => (
			<div style={{ display: "flex", gap: 4 }}>
				<Button
					icon={<IconEdit />}
					size="small"
					theme="borderless"
					onClick={() => h.edit(index)}
				>
					编辑
				</Button>
				<Popconfirm
					title="从列表移除该条？"
					content="移除后需点「保存到仓库」才真正生效"
					okType="danger"
					onConfirm={() => h.remove(index)}
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
			</div>
		),
	};
}

// ============================================================
// 友链
// ============================================================

function emptyFriend(): FriendLink {
	return {
		title: "",
		imgurl: "",
		desc: "",
		siteurl: "",
		tags: [],
		weight: 0,
		enabled: true,
	};
}

function friendColumns(h: {
	edit: (index: number) => void;
	remove: (index: number) => void;
}): ColumnProps<FriendLink>[] {
	return [
		{
			title: "头像",
			dataIndex: "imgurl",
			width: 64,
			render: (url: string) =>
				url ? (
					<PhotoView src={url}>
						<div style={{ cursor: "zoom-in", display: "inline-block" }}>
							<Image
								src={url}
								preview={false}
								width={36}
								height={36}
								style={{ objectFit: "cover", borderRadius: "50%" }}
							/>
						</div>
					</PhotoView>
				) : (
					<Text type="tertiary">—</Text>
				),
		},
		{
			title: "标题",
			dataIndex: "title",
			width: 160,
			render: (title: string, record) => (
				<Text link={{ href: record.siteurl, target: "_blank" }}>{title}</Text>
			),
		},
		{
			title: "描述",
			dataIndex: "desc",
			render: (desc: string) => (
				<Text ellipsis={{ showTooltip: true }} style={{ maxWidth: 240 }}>
					{desc}
				</Text>
			),
		},
		{ title: "权重", dataIndex: "weight", width: 70 },
		{
			title: "启用",
			dataIndex: "enabled",
			width: 70,
			render: (enabled: boolean) => (enabled ? "是" : "否"),
		},
		opColumn<FriendLink>(h),
	];
}

function friendForm(
	draft: FriendLink,
	set: (u: (d: FriendLink) => FriendLink) => void,
) {
	return (
		<div>
			<Field label="标题">
				<Input
					value={draft.title}
					onChange={(v) => set((d) => ({ ...d, title: v }))}
					placeholder="站点名称"
				/>
			</Field>
			<ImageUrlField
				label="头像"
				value={draft.imgurl}
				onChange={(v) => set((d) => ({ ...d, imgurl: v }))}
			/>
			<Field label="描述">
				<Input
					value={draft.desc}
					onChange={(v) => set((d) => ({ ...d, desc: v }))}
					placeholder="一句话简介"
				/>
			</Field>
			<Field label="站点地址">
				<Input
					value={draft.siteurl}
					onChange={(v) => set((d) => ({ ...d, siteurl: v }))}
					placeholder="https://..."
				/>
			</Field>
			<TagListField
				label="标签"
				value={draft.tags ?? []}
				onChange={(v) => set((d) => ({ ...d, tags: v }))}
				placeholder="输入标签后点「添加」（或按回车）"
			/>
			<Field label="权重（越大越靠前）">
				<InputNumber
					value={draft.weight}
					onChange={(v) => set((d) => ({ ...d, weight: Number(v) || 0 }))}
					min={0}
					style={{ width: 160 }}
				/>
			</Field>
			<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
				<Text strong>启用</Text>
				<Switch
					checked={draft.enabled}
					onChange={(v) => set((d) => ({ ...d, enabled: v }))}
				/>
			</div>
		</div>
	);
}

function friendsToStore(rows: FriendLink[]): FriendLink[] {
	return rows.map((r) =>
		compact({
			title: r.title.trim(),
			imgurl: r.imgurl.trim(),
			desc: r.desc,
			siteurl: r.siteurl.trim(),
			tags: r.tags,
			weight: r.weight,
			enabled: r.enabled,
		}),
	) as FriendLink[];
}

// ============================================================
// 项目
// ============================================================

const PROJECT_CATEGORIES = [
	{ label: "Web", value: "web" },
	{ label: "移动端", value: "mobile" },
	{ label: "桌面端", value: "desktop" },
	{ label: "其他", value: "other" },
];
const PROJECT_STATUS = [
	{ label: "已完成", value: "completed" },
	{ label: "进行中", value: "in-progress" },
	{ label: "计划中", value: "planned" },
];

function emptyProject(): Project {
	return {
		id: "",
		title: "",
		description: "",
		image: "",
		category: "web",
		techStack: [],
		status: "completed",
		startDate: "",
	};
}

function projectColumns(h: {
	edit: (index: number) => void;
	remove: (index: number) => void;
}): ColumnProps<Project>[] {
	return [
		{ title: "ID", dataIndex: "id", width: 120 },
		{ title: "标题", dataIndex: "title", width: 160 },
		{
			title: "分类",
			dataIndex: "category",
			width: 90,
			render: (c: string) =>
				PROJECT_CATEGORIES.find((x) => x.value === c)?.label ?? c,
		},
		{
			title: "状态",
			dataIndex: "status",
			width: 90,
			render: (s: string) =>
				PROJECT_STATUS.find((x) => x.value === s)?.label ?? s,
		},
		{
			title: "技术栈",
			dataIndex: "techStack",
			render: (t: string[]) => (
				<Text ellipsis={{ showTooltip: true }} style={{ maxWidth: 220 }}>
					{(t ?? []).join(" / ")}
				</Text>
			),
		},
		opColumn<Project>(h),
	];
}

function projectForm(
	draft: Project,
	set: (u: (d: Project) => Project) => void,
) {
	return (
		<div>
			<Field label="ID（唯一标识）">
				<Input
					value={draft.id}
					onChange={(v) => set((d) => ({ ...d, id: v }))}
					placeholder="如 Firefly"
				/>
			</Field>
			<Field label="标题">
				<Input
					value={draft.title}
					onChange={(v) => set((d) => ({ ...d, title: v }))}
				/>
			</Field>
			<Field label="描述">
				<TextArea
					value={draft.description}
					onChange={(v) => set((d) => ({ ...d, description: v }))}
					autosize={{ minRows: 2, maxRows: 6 }}
				/>
			</Field>
			<ImageUrlField
				label="封面图"
				value={draft.image}
				onChange={(v) => set((d) => ({ ...d, image: v }))}
			/>
			<Field label="分类">
				<Select
					value={draft.category}
					onChange={(v) =>
						set((d) => ({ ...d, category: v as Project["category"] }))
					}
					optionList={PROJECT_CATEGORIES}
					style={{ width: 200 }}
				/>
			</Field>
			<Field label="状态">
				<Select
					value={draft.status}
					onChange={(v) =>
						set((d) => ({ ...d, status: v as Project["status"] }))
					}
					optionList={PROJECT_STATUS}
					style={{ width: 200 }}
				/>
			</Field>
			<Field label="技术栈">
				<TagInput
					value={draft.techStack ?? []}
					onChange={(v) => set((d) => ({ ...d, techStack: v }))}
					placeholder="回车添加"
				/>
			</Field>
			<Field label="源码地址（可选）">
				<Input
					value={draft.sourceCode ?? ""}
					onChange={(v) => set((d) => ({ ...d, sourceCode: v }))}
				/>
			</Field>
			<Field label="访问地址（可选）">
				<Input
					value={draft.visitUrl ?? ""}
					onChange={(v) => set((d) => ({ ...d, visitUrl: v }))}
				/>
			</Field>
			<Field label="演示地址（可选）">
				<Input
					value={draft.liveDemo ?? ""}
					onChange={(v) => set((d) => ({ ...d, liveDemo: v }))}
				/>
			</Field>
			<Field label="开始日期">
				<Input
					value={draft.startDate}
					onChange={(v) => set((d) => ({ ...d, startDate: v }))}
					placeholder="YYYY-MM-DD"
				/>
			</Field>
			<Field label="结束日期（可选）">
				<Input
					value={draft.endDate ?? ""}
					onChange={(v) => set((d) => ({ ...d, endDate: v }))}
					placeholder="YYYY-MM-DD"
				/>
			</Field>
			<Field label="标签（可选）">
				<TagInput
					value={draft.tags ?? []}
					onChange={(v) => set((d) => ({ ...d, tags: v }))}
					placeholder="回车添加"
				/>
			</Field>
			<div style={{ display: "flex", alignItems: "center", gap: 24 }}>
				<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
					<Text strong>特色项目</Text>
					<Switch
						checked={draft.featured ?? false}
						onChange={(v) => set((d) => ({ ...d, featured: v }))}
					/>
				</div>
				<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
					<Text strong>展示配图</Text>
					<Switch
						checked={draft.showImage ?? false}
						onChange={(v) => set((d) => ({ ...d, showImage: v }))}
					/>
				</div>
			</div>
		</div>
	);
}

function projectsToStore(rows: Project[]): Project[] {
	return rows.map((r) =>
		compact({
			id: r.id.trim(),
			title: r.title.trim(),
			description: r.description,
			image: r.image.trim(),
			category: r.category,
			techStack: r.techStack,
			status: r.status,
			liveDemo: r.liveDemo?.trim(),
			sourceCode: r.sourceCode?.trim(),
			visitUrl: r.visitUrl?.trim(),
			startDate: r.startDate.trim(),
			endDate: r.endDate?.trim(),
			featured: r.featured || undefined,
			tags: r.tags,
			showImage: r.showImage || undefined,
		}),
	) as Project[];
}

// ============================================================
// 设备（嵌套：类别 → 设备数组，拍平成带 _category 的行）
// ============================================================

type DeviceRow = Device & { _category: string };

function emptyDevice(): DeviceRow {
	return {
		_category: "",
		name: "",
		image: "",
		specs: "",
		description: "",
		link: "",
	};
}

function devicesFromStore(data: unknown): DeviceRow[] {
	const obj = (data ?? {}) as Record<string, Device[]>;
	const rows: DeviceRow[] = [];
	for (const [category, list] of Object.entries(obj)) {
		if (!Array.isArray(list)) continue;
		for (const d of list) {
			rows.push({ ...d, _category: category });
		}
	}
	return rows;
}

function devicesToStore(rows: DeviceRow[]): Record<string, Device[]> {
	const out: Record<string, Device[]> = {};
	for (const r of rows) {
		const category = r._category?.trim() || "未分类";
		const device = compact({
			name: r.name.trim(),
			image: r.image.trim(),
			specs: r.specs,
			description: r.description,
			link: r.link.trim(),
			price: r.price?.trim(),
		}) as Device;
		if (!out[category]) out[category] = [];
		out[category].push(device);
	}
	return out;
}

function deviceColumns(h: {
	edit: (index: number) => void;
	remove: (index: number) => void;
}): ColumnProps<DeviceRow>[] {
	return [
		{ title: "类别", dataIndex: "_category", width: 110 },
		{
			title: "图片",
			dataIndex: "image",
			width: 64,
			render: (url: string) =>
				url ? (
					<PhotoView src={url}>
						<div style={{ cursor: "zoom-in", display: "inline-flex" }}>
							<Image
								src={url}
								preview={false}
								width={36}
								height={36}
								style={{ objectFit: "cover", borderRadius: 6 }}
							/>
						</div>
					</PhotoView>
				) : (
					<Text type="tertiary">—</Text>
				),
		},
		{ title: "名称", dataIndex: "name", width: 180 },
		{ title: "规格", dataIndex: "specs", width: 160 },
		{ title: "价格", dataIndex: "price", width: 90 },
		opColumn<DeviceRow>(h),
	];
}

// 类别 Select 的候选项由当前行推导，允许现场新建
function deviceForm(
	draft: DeviceRow,
	set: (u: (d: DeviceRow) => DeviceRow) => void,
	categories: string[],
) {
	const catOptions = categories.map((c) => ({ label: c, value: c }));
	return (
		<div>
			<Field label="类别（可选已有或输入新类别）">
				<Select
					value={draft._category || undefined}
					onChange={(v) => set((d) => ({ ...d, _category: String(v ?? "") }))}
					optionList={catOptions}
					filter
					allowCreate
					placeholder="如 数码 / 运动相机 / 路由器"
					style={{ width: 260 }}
				/>
			</Field>
			<Field label="名称">
				<Input
					value={draft.name}
					onChange={(v) => set((d) => ({ ...d, name: v }))}
				/>
			</Field>
			<ImageUrlField
				label="图片"
				value={draft.image}
				onChange={(v) => set((d) => ({ ...d, image: v }))}
			/>
			<Field label="规格">
				<Input
					value={draft.specs}
					onChange={(v) => set((d) => ({ ...d, specs: v }))}
					placeholder="如 深蓝色 / 12G + 256G"
				/>
			</Field>
			<Field label="描述">
				<Input
					value={draft.description}
					onChange={(v) => set((d) => ({ ...d, description: v }))}
				/>
			</Field>
			<Field label="链接">
				<Input
					value={draft.link}
					onChange={(v) => set((d) => ({ ...d, link: v }))}
					placeholder="https://..."
				/>
			</Field>
			<Field label="价格（可选）">
				<Input
					value={draft.price ?? ""}
					onChange={(v) => set((d) => ({ ...d, price: v }))}
					placeholder="如 8999元"
				/>
			</Field>
		</div>
	);
}

// ============================================================
// 技能
// ============================================================

const SKILL_CATEGORIES = [
	{ label: "前端", value: "frontend" },
	{ label: "后端", value: "backend" },
	{ label: "数据库", value: "database" },
	{ label: "工具", value: "tools" },
	{ label: "其他", value: "other" },
];
const SKILL_LEVELS = [
	{ label: "入门", value: "beginner" },
	{ label: "中级", value: "intermediate" },
	{ label: "高级", value: "advanced" },
	{ label: "专家", value: "expert" },
];

function emptySkill(): Skill {
	return {
		id: "",
		name: "",
		description: "",
		icon: "",
		category: "frontend",
		level: "intermediate",
		experience: { years: 0, months: 0 },
	};
}

function skillColumns(h: {
	edit: (index: number) => void;
	remove: (index: number) => void;
}): ColumnProps<Skill>[] {
	return [
		{ title: "ID", dataIndex: "id", width: 120 },
		{ title: "名称", dataIndex: "name", width: 150 },
		{
			title: "分类",
			dataIndex: "category",
			width: 90,
			render: (c: string) =>
				SKILL_CATEGORIES.find((x) => x.value === c)?.label ?? c,
		},
		{
			title: "熟练度",
			dataIndex: "level",
			width: 90,
			render: (l: string) =>
				SKILL_LEVELS.find((x) => x.value === l)?.label ?? l,
		},
		{
			title: "经验",
			dataIndex: "experience",
			width: 110,
			render: (e: Skill["experience"]) =>
				`${e?.years ?? 0} 年 ${e?.months ?? 0} 月`,
		},
		opColumn<Skill>(h),
	];
}

function skillForm(draft: Skill, set: (u: (d: Skill) => Skill) => void) {
	return (
		<div>
			<Field label="ID（唯一标识）">
				<Input
					value={draft.id}
					onChange={(v) => set((d) => ({ ...d, id: v }))}
					placeholder="如 javascript"
				/>
			</Field>
			<Field label="名称">
				<Input
					value={draft.name}
					onChange={(v) => set((d) => ({ ...d, name: v }))}
				/>
			</Field>
			<Field label="描述">
				<TextArea
					value={draft.description}
					onChange={(v) => set((d) => ({ ...d, description: v }))}
					autosize={{ minRows: 2, maxRows: 5 }}
				/>
			</Field>
			<Field label="图标（Iconify 名称）">
				<Input
					value={draft.icon}
					onChange={(v) => set((d) => ({ ...d, icon: v }))}
					placeholder="如 logos:javascript"
				/>
			</Field>
			<Field label="分类">
				<Select
					value={draft.category}
					onChange={(v) =>
						set((d) => ({ ...d, category: v as Skill["category"] }))
					}
					optionList={SKILL_CATEGORIES}
					style={{ width: 200 }}
				/>
			</Field>
			<Field label="熟练度">
				<Select
					value={draft.level}
					onChange={(v) => set((d) => ({ ...d, level: v as Skill["level"] }))}
					optionList={SKILL_LEVELS}
					style={{ width: 200 }}
				/>
			</Field>
			<div style={{ display: "flex", gap: 16 }}>
				<Field label="经验（年）">
					<InputNumber
						value={draft.experience.years}
						onChange={(v) =>
							set((d) => ({
								...d,
								experience: { ...d.experience, years: Number(v) || 0 },
							}))
						}
						min={0}
						style={{ width: 120 }}
					/>
				</Field>
				<Field label="经验（月）">
					<InputNumber
						value={draft.experience.months}
						onChange={(v) =>
							set((d) => ({
								...d,
								experience: { ...d.experience, months: Number(v) || 0 },
							}))
						}
						min={0}
						max={11}
						style={{ width: 120 }}
					/>
				</Field>
			</div>
			<Field label="相关项目 ID（可选）">
				<TagInput
					value={draft.projects ?? []}
					onChange={(v) => set((d) => ({ ...d, projects: v }))}
					placeholder="回车添加"
				/>
			</Field>
			<Field label="证书（可选）">
				<TagInput
					value={draft.certifications ?? []}
					onChange={(v) => set((d) => ({ ...d, certifications: v }))}
					placeholder="回车添加"
				/>
			</Field>
			<Field label="主题色（可选）">
				<Input
					value={draft.color ?? ""}
					onChange={(v) => set((d) => ({ ...d, color: v }))}
					placeholder="如 #F7DF1E"
				/>
			</Field>
		</div>
	);
}

function skillsToStore(rows: Skill[]): Skill[] {
	return rows.map((r) =>
		compact({
			id: r.id.trim(),
			name: r.name.trim(),
			description: r.description,
			icon: r.icon.trim(),
			category: r.category,
			level: r.level,
			experience: r.experience,
			projects: r.projects,
			certifications: r.certifications,
			color: r.color?.trim(),
		}),
	) as Skill[];
}

// ============================================================
// 时间线
// ============================================================

const TIMELINE_TYPES = [
	{ label: "教育", value: "education" },
	{ label: "工作", value: "work" },
	{ label: "项目", value: "project" },
	{ label: "成就", value: "achievement" },
];
const TIMELINE_LINK_TYPES = [
	{ label: "网站", value: "website" },
	{ label: "证书", value: "certificate" },
	{ label: "项目", value: "project" },
	{ label: "其他", value: "other" },
];

function emptyTimeline(): TimelineItem {
	return {
		id: "",
		title: "",
		description: "",
		type: "education",
		startDate: "",
	};
}

function timelineColumns(h: {
	edit: (index: number) => void;
	remove: (index: number) => void;
}): ColumnProps<TimelineItem>[] {
	return [
		{ title: "ID", dataIndex: "id", width: 150 },
		{ title: "标题", dataIndex: "title" },
		{
			title: "类型",
			dataIndex: "type",
			width: 90,
			render: (t: string) =>
				TIMELINE_TYPES.find((x) => x.value === t)?.label ?? t,
		},
		{ title: "开始", dataIndex: "startDate", width: 110 },
		{ title: "结束", dataIndex: "endDate", width: 110 },
		opColumn<TimelineItem>(h),
	];
}

function timelineForm(
	draft: TimelineItem,
	set: (u: (d: TimelineItem) => TimelineItem) => void,
) {
	const links = draft.links ?? [];
	const setLink = (i: number, patch: Partial<TimelineLink>) =>
		set((d) => {
			const next = [...(d.links ?? [])];
			next[i] = { ...next[i], ...patch };
			return { ...d, links: next };
		});
	const addLink = () =>
		set((d) => ({
			...d,
			links: [...(d.links ?? []), { name: "", url: "", type: "website" }],
		}));
	const removeLink = (i: number) =>
		set((d) => ({
			...d,
			links: (d.links ?? []).filter((_, idx) => idx !== i),
		}));

	return (
		<div>
			<Field label="ID（唯一标识）">
				<Input
					value={draft.id}
					onChange={(v) => set((d) => ({ ...d, id: v }))}
					placeholder="如 current-study"
				/>
			</Field>
			<Field label="标题">
				<Input
					value={draft.title}
					onChange={(v) => set((d) => ({ ...d, title: v }))}
				/>
			</Field>
			<Field label="描述">
				<TextArea
					value={draft.description}
					onChange={(v) => set((d) => ({ ...d, description: v }))}
					autosize={{ minRows: 2, maxRows: 5 }}
				/>
			</Field>
			<Field label="类型">
				<Select
					value={draft.type}
					onChange={(v) =>
						set((d) => ({ ...d, type: v as TimelineItem["type"] }))
					}
					optionList={TIMELINE_TYPES}
					style={{ width: 200 }}
				/>
			</Field>
			<div style={{ display: "flex", gap: 16 }}>
				<Field label="开始日期">
					<Input
						value={draft.startDate}
						onChange={(v) => set((d) => ({ ...d, startDate: v }))}
						placeholder="YYYY-MM-DD"
						style={{ width: 160 }}
					/>
				</Field>
				<Field label="结束日期（可选）">
					<Input
						value={draft.endDate ?? ""}
						onChange={(v) => set((d) => ({ ...d, endDate: v }))}
						placeholder="YYYY-MM-DD"
						style={{ width: 160 }}
					/>
				</Field>
			</div>
			<Field label="地点（可选）">
				<Input
					value={draft.location ?? ""}
					onChange={(v) => set((d) => ({ ...d, location: v }))}
				/>
			</Field>
			<Field label="组织（可选）">
				<Input
					value={draft.organization ?? ""}
					onChange={(v) => set((d) => ({ ...d, organization: v }))}
				/>
			</Field>
			<Field label="职位（可选）">
				<Input
					value={draft.position ?? ""}
					onChange={(v) => set((d) => ({ ...d, position: v }))}
				/>
			</Field>
			<Field label="技能（可选）">
				<TagInput
					value={draft.skills ?? []}
					onChange={(v) => set((d) => ({ ...d, skills: v }))}
					placeholder="回车添加"
				/>
			</Field>
			<Field label="成就（可选，每条回车添加）">
				<TagInput
					value={draft.achievements ?? []}
					onChange={(v) => set((d) => ({ ...d, achievements: v }))}
					placeholder="回车添加一条成就"
				/>
			</Field>
			<Field label="图标（可选，Iconify 名称）">
				<Input
					value={draft.icon ?? ""}
					onChange={(v) => set((d) => ({ ...d, icon: v }))}
					placeholder="如 material-symbols:school"
				/>
			</Field>
			<Field label="主题色（可选）">
				<Input
					value={draft.color ?? ""}
					onChange={(v) => set((d) => ({ ...d, color: v }))}
					placeholder="如 #059669"
				/>
			</Field>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					marginBottom: 12,
				}}
			>
				<Text strong>特色</Text>
				<Switch
					checked={draft.featured ?? false}
					onChange={(v) => set((d) => ({ ...d, featured: v }))}
				/>
			</div>

			{/* 链接子编辑器 */}
			<div style={{ marginBottom: 4, fontSize: 13, fontWeight: 600 }}>
				链接（可选）
			</div>
			{links.map((link, i) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: 链接为本地临时编辑行，无稳定 id，索引即身份
					key={i}
					style={{
						display: "flex",
						gap: 8,
						marginBottom: 8,
						alignItems: "flex-start",
						// 小屏(全屏 Modal)四件套换行;桌面 Modal 600 宽单行放得下,不触发
						flexWrap: "wrap",
					}}
				>
					<Input
						value={link.name}
						onChange={(v) => setLink(i, { name: v })}
						placeholder="名称"
						style={{ flex: 1, minWidth: 140 }}
					/>
					<Input
						value={link.url}
						onChange={(v) => setLink(i, { url: v })}
						placeholder="URL"
						style={{ flex: 2, minWidth: 140 }}
					/>
					<Select
						value={link.type}
						onChange={(v) => setLink(i, { type: v as TimelineLink["type"] })}
						optionList={TIMELINE_LINK_TYPES}
						style={{ width: 100 }}
					/>
					<Button
						icon={<IconDelete />}
						type="danger"
						theme="borderless"
						onClick={() => removeLink(i)}
					/>
				</div>
			))}
			<Button icon={<IconPlus />} size="small" onClick={addLink}>
				添加链接
			</Button>
		</div>
	);
}

function timelineToStore(rows: TimelineItem[]): TimelineItem[] {
	return rows.map((r) => {
		const links = (r.links ?? [])
			.map((l) =>
				compact({ name: l.name.trim(), url: l.url.trim(), type: l.type }),
			)
			.filter((l) => (l as TimelineLink).url) as TimelineLink[];
		return compact({
			id: r.id.trim(),
			title: r.title.trim(),
			description: r.description,
			type: r.type,
			startDate: r.startDate.trim(),
			endDate: r.endDate?.trim(),
			location: r.location?.trim(),
			organization: r.organization?.trim(),
			position: r.position?.trim(),
			skills: r.skills,
			achievements: r.achievements,
			links: links.length ? links : undefined,
			icon: r.icon?.trim(),
			color: r.color?.trim(),
			featured: r.featured || undefined,
		}) as TimelineItem;
	});
}

// ============================================================
// 设备 Tab 需要把当前类别列表传给表单，单独包一层
// ============================================================

function DevicesPanel() {
	// 从 KV 通道缓存读当前设备嵌套对象，推导类别候选；表单 allowCreate 允许现场新建类别。
	// queryKey 与 DataTabPanel 的 ["devices"] 一致，共享同一份 react-query 缓存。
	const { data } = useQuery({
		queryKey: ["devices"],
		queryFn: async () => {
			const res = await devicesApi.getAll();
			return { data: res.devices };
		},
	});
	const categories = data
		? Object.keys((data.data ?? {}) as Record<string, unknown>)
		: [];

	return (
		<DataTabPanel<DeviceRow>
			name="devices"
			addLabel="新建设备"
			rowKey={(row) => `${row?._category ?? ""}-${row?.name ?? ""}`}
			columns={deviceColumns}
			emptyRow={emptyDevice}
			renderForm={(draft, set) => deviceForm(draft, set, categories)}
			validate={(d) => (d.name.trim() ? null : "设备名称不能为空")}
			fromStore={devicesFromStore}
			toStore={devicesToStore}
			emptyText="还没有设备"
			mobileScrollX={800}
			queryKey={["devices"]}
			loader={async () => (await devicesApi.getAll()).devices}
			saver={async (payload) =>
				devicesApi.replaceAll(payload as DeviceCategory)
			}
			savedMessage="已保存，约 1 分钟内前台生效"
			dirtyHint="本地有未保存的修改。点击「保存」写回，约 1 分钟内前台生效（无需构建）。"
			saveLabel="保存"
			invalidateBuilds={false}
		/>
	);
}

// ============================================================
// 友链申请审核（独立面板，非 DataTabPanel 脏保存）
// ============================================================

function statusTag(status: FriendApplicationStatus | string) {
	if (status === "pending") return <Tag color="orange">待审核</Tag>;
	if (status === "approved") return <Tag color="green">已通过</Tag>;
	if (status === "rejected") return <Tag color="grey">已拒绝</Tag>;
	return <Tag>{status}</Tag>;
}

function formatTime(iso?: string) {
	if (!iso) return "—";
	const t = Date.parse(iso);
	if (Number.isNaN(t)) return iso;
	try {
		return new Date(t).toLocaleString("zh-CN", { hour12: false });
	} catch {
		return iso;
	}
}

function FriendApplicationsPanel() {
	const queryClient = useQueryClient();
	const { isMobile } = usePageShell();
	const rejectModalProps = useModalProps(480);
	const [statusFilter, setStatusFilter] = useState<
		FriendApplicationStatus | "all"
	>("pending");
	const [rejectTarget, setRejectTarget] = useState<FriendApplication | null>(
		null,
	);
	const [rejectReason, setRejectReason] = useState("");

	const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
		queryKey: ["friend-applications", statusFilter],
		queryFn: () => friendApplicationsApi.list(statusFilter),
	});

	const approveMutation = useMutation({
		mutationFn: (id: string) => friendApplicationsApi.approve(id),
		onSuccess: (res) => {
			const msg = res.appended
				? "已通过并写入友链墙，约 1 分钟内前台生效"
				: "已通过（友链墙已有同站，未重复追加）";
			Toast.success(msg);
			queryClient.invalidateQueries({ queryKey: ["friend-applications"] });
			queryClient.invalidateQueries({ queryKey: ["friends"] });
		},
		onError: (err: Error) => Toast.error(err.message || "通过失败"),
	});

	const rejectMutation = useMutation({
		mutationFn: (vars: { id: string; reason?: string }) =>
			friendApplicationsApi.reject(vars.id, vars.reason),
		onSuccess: () => {
			Toast.success("已拒绝该申请");
			setRejectTarget(null);
			setRejectReason("");
			queryClient.invalidateQueries({ queryKey: ["friend-applications"] });
		},
		onError: (err: Error) => Toast.error(err.message || "拒绝失败"),
	});

	const removeMutation = useMutation({
		mutationFn: (id: string) => friendApplicationsApi.remove(id),
		onSuccess: () => {
			Toast.success("已删除记录");
			queryClient.invalidateQueries({ queryKey: ["friend-applications"] });
		},
		onError: (err: Error) => Toast.error(err.message || "删除失败"),
	});

	const openReject = useCallback((row: FriendApplication) => {
		setRejectTarget(row);
		setRejectReason("");
	}, []);

	const items = data?.applications ?? [];

	const columns: ColumnProps<FriendApplication>[] = [
		{
			title: "头像",
			dataIndex: "imgurl",
			width: 64,
			render: (url: string) =>
				url ? (
					<PhotoView src={url}>
						<div style={{ cursor: "zoom-in", display: "inline-block" }}>
							<Image
								src={url}
								preview={false}
								width={36}
								height={36}
								style={{ objectFit: "cover", borderRadius: "50%" }}
							/>
						</div>
					</PhotoView>
				) : (
					<Text type="tertiary">—</Text>
				),
		},
		{
			title: "站点",
			dataIndex: "title",
			width: isMobile ? undefined : 160,
			render: (title: string, record) => (
				<div>
					<Text
						link={{ href: record.siteurl, target: "_blank" }}
						strong
						ellipsis={{ showTooltip: true }}
						style={{ maxWidth: isMobile ? 160 : 200 }}
					>
						{title || "（无标题）"}
					</Text>
					{isMobile ? (
						<Text
							type="tertiary"
							size="small"
							ellipsis={{ showTooltip: true }}
							style={{ maxWidth: 180, display: "block" }}
						>
							{record.desc || record.siteurl}
						</Text>
					) : null}
				</div>
			),
		},
		...(isMobile
			? []
			: ([
					{
						title: "描述",
						dataIndex: "desc",
						render: (desc: string) => (
							<Text ellipsis={{ showTooltip: true }} style={{ maxWidth: 200 }}>
								{desc || "—"}
							</Text>
						),
					},
					{
						title: "链接",
						dataIndex: "siteurl",
						width: 180,
						render: (url: string) => (
							<Text
								link={{ href: url, target: "_blank" }}
								ellipsis={{ showTooltip: true }}
								style={{ maxWidth: 160 }}
							>
								{url}
							</Text>
						),
					},
					{
						title: "留言",
						dataIndex: "message",
						width: 140,
						render: (msg: string, record: FriendApplication) => (
							<Text ellipsis={{ showTooltip: true }} style={{ maxWidth: 120 }}>
								{msg || record.email || "—"}
							</Text>
						),
					},
				] as ColumnProps<FriendApplication>[])),
		{
			title: "状态",
			dataIndex: "status",
			width: 90,
			render: (s: string) => statusTag(s),
		},
		{
			title: "申请时间",
			dataIndex: "createdAt",
			width: isMobile ? 110 : 150,
			render: (t: string) => (
				<Text type="tertiary" size="small">
					{formatTime(t)}
				</Text>
			),
		},
		{
			title: "操作",
			dataIndex: "operate",
			width: isMobile ? 120 : 200,
			render: (_: unknown, record) => (
				<div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
					{record.status === "pending" ? (
						<>
							<Popconfirm
								title="确认通过该申请？"
								content="将写入友链墙（默认 weight=0、启用），约 1 分钟内前台生效"
								onConfirm={() => approveMutation.mutate(record.id)}
							>
								<Button
									icon={<IconCheckCircleStroked />}
									size="small"
									theme="borderless"
									type="primary"
									loading={
										approveMutation.isPending &&
										approveMutation.variables === record.id
									}
								>
									{isMobile ? "" : "通过"}
								</Button>
							</Popconfirm>
							<Button
								size="small"
								theme="borderless"
								type="danger"
								onClick={() => openReject(record)}
							>
								{isMobile ? "拒" : "拒绝"}
							</Button>
						</>
					) : null}
					<Popconfirm
						title="确认删除该记录？"
						content="仅删申请记录，不影响已写入的友链"
						okType="danger"
						onConfirm={() => removeMutation.mutate(record.id)}
					>
						<Button
							icon={<IconDelete />}
							size="small"
							theme="borderless"
							type="danger"
							aria-label="删除"
						>
							{isMobile ? "" : "删除"}
						</Button>
					</Popconfirm>
				</div>
			),
		},
	];

	return (
		<div>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					marginBottom: 12,
					flexWrap: "wrap",
					gap: 8,
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
					<Select
						value={statusFilter}
						onChange={(v) =>
							setStatusFilter(v as FriendApplicationStatus | "all")
						}
						style={{ width: 140 }}
						optionList={[
							{ label: "待审核", value: "pending" },
							{ label: "已通过", value: "approved" },
							{ label: "已拒绝", value: "rejected" },
							{ label: "全部", value: "all" },
						]}
					/>
					<Text type="tertiary" size="small">
						共 {data?.total ?? 0} 条
					</Text>
				</div>
				<Button
					icon={<IconRefresh />}
					onClick={() => refetch()}
					loading={isFetching}
				>
					刷新
				</Button>
			</div>

			{isError ? (
				<Banner
					type="danger"
					description={(error as Error)?.message || "加载失败"}
					style={{ marginBottom: 12 }}
				/>
			) : null}

			{!isLoading && items.length === 0 ? (
				<Empty
					title={
						statusFilter === "pending" ? "暂无待审核申请" : "暂无申请记录"
					}
					description="访客在博客友链页提交后会出现在这里"
				/>
			) : (
				<AdminPhotoProvider>
					<Table
						rowKey="id"
						columns={columns}
						dataSource={items}
						loading={isLoading}
						pagination={{ pageSize: 10, showSizeChanger: false }}
						scroll={isMobile ? { x: 560 } : undefined}
					/>
				</AdminPhotoProvider>
			)}

			<Modal
				{...rejectModalProps}
				title="拒绝申请"
				visible={!!rejectTarget}
				onCancel={() => {
					setRejectTarget(null);
					setRejectReason("");
				}}
				onOk={() => {
					if (!rejectTarget) return;
					rejectMutation.mutate({
						id: rejectTarget.id,
						reason: rejectReason.trim() || undefined,
					});
				}}
				okText="确认拒绝"
				okType="danger"
				confirmLoading={rejectMutation.isPending}
			>
				{rejectTarget ? (
					<div>
						<Text style={{ display: "block", marginBottom: 8 }}>
							站点：{rejectTarget.title}（{rejectTarget.siteurl}）
						</Text>
						<Field label="拒绝原因（可选）">
							<TextArea
								value={rejectReason}
								onChange={setRejectReason}
								placeholder="仅后台留存，不会发给申请人"
								maxCount={200}
								rows={3}
							/>
						</Field>
					</div>
				) : null}
			</Modal>
		</div>
	);
}

// ============================================================
// 页面：友链 / 申请审核 / 项目 / 设备 / 技能 / 时间线
// ============================================================

export function DataPage() {
	const [active, setActive] = useState("friends");
	const { pageStyle, stickyStyle } = usePageShell();

	return (
		<div style={pageStyle}>
			{/* 吸顶区:只吸标题+副标题(Tab 头跟内容滚,Semi Tabs 内部 DOM 不能单独 sticky) */}
			<div style={stickyStyle}>
				<Title heading={3} style={{ margin: "0 0 4px" }}>
					资料数据
				</Title>
				<Text type="tertiary" style={{ display: "block" }}>
					友链 / 设备 / 申请审核走 KV：保存或通过后约 1 分钟内前台生效、无需构建。
					项目 / 技能 / 时间线走 Git：写回仓库并触发构建，约 3-5 分钟生效。
					若友链表有未保存草稿，请先刷新再编辑，以免覆盖审核通过新写入的友链。
				</Text>
			</div>

			<Tabs
				className="admin-scroll-tabs"
				type="line"
				activeKey={active}
				onChange={setActive}
				lazyRender
				keepDOM={false}
			>
				<TabPane tab="友链" itemKey="friends">
					<DataTabPanel<FriendLink>
						name="friends"
						addLabel="新建友链"
						rowKey={(row) => `${row?.title ?? ""}-${row?.siteurl ?? ""}`}
						columns={friendColumns}
						emptyRow={emptyFriend}
						renderForm={friendForm}
						validate={(d) =>
							d.title.trim() && d.siteurl.trim()
								? null
								: "标题和站点地址不能为空"
						}
						fromStore={(data) =>
							Array.isArray(data) ? (data as FriendLink[]) : []
						}
						toStore={(rows) => friendsToStore(rows)}
						emptyText="还没有友链"
						mobileScrollX={760}
						queryKey={["friends"]}
						loader={async () => (await friendsApi.getAll()).friends}
						saver={async (payload) =>
							friendsApi.replaceAll(payload as FriendLink[])
						}
						savedMessage="已保存，约 1 分钟内前台生效"
						dirtyHint="本地有未保存的修改。点击「保存」写回，约 1 分钟内前台生效（无需构建）。"
						saveLabel="保存"
						invalidateBuilds={false}
					/>
				</TabPane>

				<TabPane tab="申请审核" itemKey="friend-applications">
					<FriendApplicationsPanel />
				</TabPane>

				<TabPane tab="项目" itemKey="projects">
					<DataTabPanel<Project>
						name="projects"
						addLabel="新建项目"
						rowKey={(row) => row?.id ?? ""}
						columns={projectColumns}
						emptyRow={emptyProject}
						renderForm={projectForm}
						validate={(d) =>
							d.id.trim() && d.title.trim() ? null : "ID 和标题不能为空"
						}
						fromStore={(data) =>
							Array.isArray(data) ? (data as Project[]) : []
						}
						toStore={(rows) => projectsToStore(rows)}
						emptyText="还没有项目"
						mobileScrollX={800}
					/>
				</TabPane>

				<TabPane tab="设备" itemKey="devices">
					<DevicesPanel />
				</TabPane>

				<TabPane tab="技能" itemKey="skills">
					<DataTabPanel<Skill>
						name="skills"
						addLabel="新建技能"
						rowKey={(row) => row?.id ?? ""}
						columns={skillColumns}
						emptyRow={emptySkill}
						renderForm={skillForm}
						validate={(d) =>
							d.id.trim() && d.name.trim() ? null : "ID 和名称不能为空"
						}
						fromStore={(data) => (Array.isArray(data) ? (data as Skill[]) : [])}
						toStore={(rows) => skillsToStore(rows)}
						emptyText="还没有技能"
						mobileScrollX={760}
					/>
				</TabPane>

				<TabPane tab="时间线" itemKey="timeline">
					<DataTabPanel<TimelineItem>
						name="timeline"
						addLabel="新建节点"
						rowKey={(row) => row?.id ?? ""}
						columns={timelineColumns}
						emptyRow={emptyTimeline}
						renderForm={timelineForm}
						validate={(d) =>
							d.id.trim() && d.title.trim() ? null : "ID 和标题不能为空"
						}
						fromStore={(data) =>
							Array.isArray(data) ? (data as TimelineItem[]) : []
						}
						toStore={(rows) => timelineToStore(rows)}
						emptyText="还没有时间线节点"
						mobileScrollX={800}
					/>
				</TabPane>
			</Tabs>
		</div>
	);
}
