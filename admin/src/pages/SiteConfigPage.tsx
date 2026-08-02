// 博客配置页（配置中心）：全量加载 22 域、本地 dirty 暂存、P0~P2 全表单 + 全域 JSON 兜底、批量保存
//
// 通道：Git（Cloud Functions GET/PUT /api/config），保存后约 3-5 分钟构建生效。
// 布局：原生 div（Semi Space vertical/align 报 TS2322，坑 18）；标题区吸顶沿用 usePageShell。
// 导航 IA：侧栏二级 = GROUP_ORDER 六个分组；页内 Tabs = 当前分组下的配置域。
// 路由：/site-config/:group/:domain? ，深链可刷新恢复；决策 7 读-改-写整对象、未知字段保留。
import {
	IconRefresh,
	IconSave,
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
	Slider,
	Spin,
	Switch,
	TabPane,
	Tabs,
	Tag,
	TextArea,
	Toast,
	Typography,
} from "@douyinfe/semi-ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import { PhotoView } from "react-photo-view";
import { useLocation, useNavigate } from "react-router-dom";
import {
	type ConfigDomain,
	CONFIG_DOMAIN_LABELS,
	configApi,
} from "@/api/config";
import { AdminPhotoProvider } from "@/components/AdminPhotoProvider";
import { BusySpin } from "@/components/BusySpin";
import { QiniuUpload } from "@/components/QiniuUpload";
import {
	DOMAIN_SCHEMAS,
	GROUP_ORDER,
	type ConfigDomainSchema,
	type ConfigFieldSchema,
	getSchemasByGroup,
	isConfigGroup,
	SCHEMA_BY_DOMAIN,
} from "@/config-schema";
import { useModalProps } from "@/hooks/useModalProps";
import { usePageShell } from "@/hooks/usePageShell";
import { setConfigDirtyDomains } from "@/pages/siteConfigDirtyStore";

const { Title, Text } = Typography;

// ---------- 路径工具（点路径读写，保留未知字段） ----------

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

function getByPath(obj: unknown, path: string): unknown {
	if (!path) return obj;
	const segs = path.split(".");
	let cur: unknown = obj;
	for (const s of segs) {
		if (!isPlainObject(cur) && !Array.isArray(cur)) return undefined;
		cur = (cur as Record<string, unknown>)[s];
	}
	return cur;
}

// 不可变 set：沿路径浅拷贝，叶子写入 newVal
function setByPath(
	obj: Record<string, unknown>,
	path: string,
	value: unknown,
): Record<string, unknown> {
	const segs = path.split(".");
	if (segs.length === 0) return obj;
	const root = { ...obj };
	let cur: Record<string, unknown> = root;
	for (let i = 0; i < segs.length - 1; i++) {
		const k = segs[i];
		const next = cur[k];
		const cloned = isPlainObject(next)
			? { ...next }
			: Array.isArray(next)
				? [...next]
				: {};
		cur[k] = cloned;
		cur = cloned as Record<string, unknown>;
	}
	cur[segs[segs.length - 1]] = value;
	return root;
}

function cloneObj<T>(v: T): T {
	return JSON.parse(JSON.stringify(v)) as T;
}

function stableStringify(v: unknown): string {
	return JSON.stringify(v);
}

// ---------- 小控件 ----------

function Field({
	label,
	help,
	danger,
	children,
}: {
	label: string;
	help?: string;
	danger?: string;
	children: ReactNode;
}) {
	return (
		<div style={{ marginBottom: 14 }}>
			<div
				style={{
					marginBottom: 4,
					fontSize: 13,
					fontWeight: 600,
					display: "flex",
					alignItems: "center",
					gap: 6,
					flexWrap: "wrap",
				}}
			>
				<span>{label}</span>
				{danger ? (
					<Tag color="red" size="small">
						危险
					</Tag>
				) : null}
			</div>
			{help ? (
				<Text
					type="tertiary"
					size="small"
					style={{ display: "block", marginBottom: 6 }}
				>
					{help}
				</Text>
			) : null}
			{danger ? (
				<Text
					type="danger"
					size="small"
					style={{ display: "block", marginBottom: 6 }}
				>
					{danger}
				</Text>
			) : null}
			{children}
		</div>
	);
}

// 标签输入：显式「添加」按钮（移动端 TagInput 不可靠，坑见 22.7）
function TagListField({
	value,
	onChange,
	placeholder,
}: {
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
	return (
		<div>
			<div style={{ display: "flex", gap: 8 }}>
				<Input
					value={input}
					onChange={setInput}
					onEnterPress={addTag}
					placeholder={placeholder ?? "输入后点「添加」"}
				/>
				<Button onClick={addTag}>添加</Button>
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
							// biome-ignore lint/suspicious/noArrayIndexKey: 标签为本地临时编辑项，无稳定 id
							key={idx}
							closable
							onClose={() => onChange(tags.filter((_, i) => i !== idx))}
							size="large"
						>
							{tag}
						</Tag>
					))}
				</div>
			) : null}
		</div>
	);
}

function ImageUrlField({
	value,
	onChange,
	placeholder,
}: {
	value: string;
	onChange: (v: string) => void;
	placeholder?: string;
}) {
	return (
		<div>
			<div style={{ display: "flex", gap: 8 }}>
				<Input
					value={value}
					onChange={onChange}
					placeholder={placeholder ?? "图片 URL（粘贴或上传）"}
				/>
				<QiniuUpload onUploaded={(url) => onChange(url)} showUploadList={false}>
					<Button>上传</Button>
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
		</div>
	);
}

// ---------- objectList 行编辑 ----------

function ObjectListEditor({
	field,
	value,
	onChange,
}: {
	field: ConfigFieldSchema;
	value: unknown[];
	onChange: (v: unknown[]) => void;
}) {
	const modalProps = useModalProps(560);
	const rows = Array.isArray(value) ? value : [];
	const [editorVisible, setEditorVisible] = useState(false);
	const [editIndex, setEditIndex] = useState<number | null>(null);
	const [draft, setDraft] = useState<Record<string, unknown> | null>(null);

	const openCreate = () => {
		setDraft(cloneObj(field.emptyItem ?? {}));
		setEditIndex(null);
		setEditorVisible(true);
	};
	const openEdit = (index: number) => {
		const row = rows[index];
		setDraft(
			isPlainObject(row) ? cloneObj(row) : cloneObj(field.emptyItem ?? {}),
		);
		setEditIndex(index);
		setEditorVisible(true);
	};
	const removeRow = (index: number) => {
		onChange(rows.filter((_, i) => i !== index));
	};
	// 行内直接切换 enable（仅当 itemSchema 含 enable 字段时显示，当前仅侧边栏组件列表）
	const hasEnable = Boolean(field.itemSchema?.some((f) => f.key === "enable"));
	const toggleEnable = (index: number, checked: boolean) => {
		const next = [...rows];
		const row = next[index];
		if (isPlainObject(row)) {
			next[index] = { ...row, enable: checked };
			onChange(next);
		}
	};

	const handleOk = () => {
		if (!draft) return;
		const next = [...rows];
		if (editIndex === null) next.push(draft);
		else next[editIndex] = draft;
		onChange(next);
		setEditorVisible(false);
	};

	const labelKey = field.itemLabelKey;
	// 行摘要：优先用 itemLabelKey 字段值；若该字段是 select，映射成中文 options.label
	const rowLabel = (row: unknown, i: number) => {
		if (isPlainObject(row) && labelKey) {
			const v = getByPath(row, labelKey);
			if (v != null && String(v).trim()) {
				const col = field.itemSchema?.find((f) => f.key === labelKey);
				if (col?.options?.length) {
					const opt = col.options.find((o) => String(o.value) === String(v));
					if (opt) return opt.label;
				}
				return String(v);
			}
		}
		return `第 ${i + 1} 项`;
	};

	return (
		<div>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					marginBottom: 8,
				}}
			>
				<Text type="tertiary" size="small">
					共 {rows.length} 项
				</Text>
				<Button size="small" theme="solid" type="primary" onClick={openCreate}>
					添加
				</Button>
			</div>
			{rows.length === 0 ? (
				<Text type="tertiary">暂无条目，点「添加」新建</Text>
			) : (
				<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
					{rows.map((row, i) => (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: 本地临时行，无稳定 id
							key={i}
							style={{
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
								gap: 8,
								padding: "8px 12px",
								borderRadius: 6,
								backgroundColor: "var(--semi-color-fill-0)",
								border: "1px solid var(--semi-color-border)",
							}}
						>
							<Text
								ellipsis={{ showTooltip: true }}
								style={{ flex: 1, minWidth: 0 }}
							>
								{rowLabel(row, i)}
							</Text>
							{hasEnable ? (
								<Switch
									size="small"
									checked={Boolean(isPlainObject(row) ? row.enable : false)}
									onChange={(v) => toggleEnable(i, v)}
									aria-label="启用该组件"
								/>
							) : null}
							<div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
								<Button size="small" theme="borderless" onClick={() => openEdit(i)}>
									编辑
								</Button>
								<Popconfirm
									title="移除该条？"
									content="移除后需保存配置才真正生效"
									okType="danger"
									onConfirm={() => removeRow(i)}
								>
									<Button size="small" theme="borderless" type="danger">
										删除
									</Button>
								</Popconfirm>
							</div>
						</div>
					))}
				</div>
			)}
			<Modal
				title={editIndex === null ? "新建条目" : "编辑条目"}
				visible={editorVisible}
				onOk={handleOk}
				onCancel={() => setEditorVisible(false)}
				okText="确定"
				cancelText="取消"
				maskClosable={false}
				{...modalProps}
				bodyStyle={
					modalProps.bodyStyle ?? { maxHeight: "70vh", overflowY: "auto" }
				}
			>
				{draft && field.itemSchema
					? field.itemSchema.map((f) => (
							<SchemaField
								key={f.key}
								field={f}
								value={getByPath(draft, f.key)}
								onChange={(v) => setDraft((d) => (d ? setByPath(d, f.key, v) : d))}
							/>
						))
					: null}
			</Modal>
		</div>
	);
}

// ---------- 单字段渲染 ----------

function SchemaField({
	field,
	value,
	onChange,
}: {
	field: ConfigFieldSchema;
	value: unknown;
	onChange: (v: unknown) => void;
}) {
	const wrap = (children: ReactNode) => (
		<Field label={field.label} help={field.help} danger={field.danger}>
			{children}
		</Field>
	);

	switch (field.control) {
		case "switch":
			return wrap(
				<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
					<Switch
						checked={Boolean(value)}
						onChange={(v) => onChange(v)}
					/>
					<Text type="tertiary" size="small">
						{value ? "开" : "关"}
					</Text>
				</div>,
			);
		case "input":
			return wrap(
				<Input
					value={value == null ? "" : String(value)}
					onChange={(v) => onChange(v)}
					placeholder={field.placeholder}
				/>,
			);
		case "textarea":
			return wrap(
				<TextArea
					value={value == null ? "" : String(value)}
					onChange={(v) => onChange(v)}
					placeholder={field.placeholder}
					autosize={{ minRows: field.rows ?? 2, maxRows: 12 }}
				/>,
			);
		case "number":
			return wrap(
				<InputNumber
					value={typeof value === "number" ? value : undefined}
					onChange={(v) => onChange(typeof v === "number" ? v : Number(v) || 0)}
					min={field.min}
					max={field.max}
					step={field.step}
					style={{ width: 200 }}
				/>,
			);
		case "slider": {
			const n = typeof value === "number" ? value : Number(value) || 0;
			const min = field.min ?? 0;
			const max = field.max ?? 100;
			const step = field.step ?? 1;
			return wrap(
				<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
					<div style={{ flex: 1, minWidth: 120, maxWidth: 360 }}>
						<Slider
							value={n}
							min={min}
							max={max}
							step={step}
							onChange={(v) => {
								const next = Array.isArray(v) ? v[0] : v;
								onChange(typeof next === "number" ? next : Number(next));
							}}
						/>
					</div>
					<InputNumber
						value={n}
						min={min}
						max={max}
						step={step}
						onChange={(v) =>
							onChange(typeof v === "number" ? v : Number(v) || 0)
						}
						style={{ width: 100 }}
					/>
				</div>,
			);
		}
		case "select":
			return wrap(
				<Select
					value={value as string | number | undefined}
					onChange={(v) => onChange(v)}
					optionList={field.options ?? []}
					style={{ width: "100%", maxWidth: 360 }}
					placeholder="请选择"
				/>,
			);
		case "tags":
			return wrap(
				<TagListField
					value={Array.isArray(value) ? (value as string[]).map(String) : []}
					onChange={(v) => onChange(v)}
					placeholder={field.placeholder}
				/>,
			);
		case "imageUrl":
			return wrap(
				<ImageUrlField
					value={value == null ? "" : String(value)}
					onChange={(v) => onChange(v)}
					placeholder={field.placeholder}
				/>,
			);
		case "objectList":
			return wrap(
				<ObjectListEditor
					field={field}
					value={Array.isArray(value) ? value : []}
					onChange={(v) => onChange(v)}
				/>,
			);
		case "json":
			return wrap(
				<JsonMiniEditor
					value={value}
					onChange={onChange}
				/>,
			);
		default:
			return wrap(
				<Text type="tertiary">不支持的控件：{field.control}</Text>,
			);
	}
}

// 嵌套 json 小编辑器（复杂子结构兜底）
function JsonMiniEditor({
	value,
	onChange,
}: {
	value: unknown;
	onChange: (v: unknown) => void;
}) {
	const [text, setText] = useState(() =>
		JSON.stringify(value ?? null, null, "\t"),
	);
	const [err, setErr] = useState<string | null>(null);
	useEffect(() => {
		setText(JSON.stringify(value ?? null, null, "\t"));
		setErr(null);
	}, [value]);
	const apply = (t: string) => {
		setText(t);
		try {
			const parsed = JSON.parse(t);
			setErr(null);
			onChange(parsed);
		} catch (e) {
			setErr(e instanceof Error ? e.message : "JSON 无效");
		}
	};
	return (
		<div>
			<TextArea
				value={text}
				onChange={apply}
				autosize={{ minRows: 4, maxRows: 16 }}
				style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
			/>
			{err ? (
				<Text type="danger" size="small" style={{ display: "block", marginTop: 4 }}>
					{err}
				</Text>
			) : null}
		</div>
	);
}

// ---------- 表单渲染器 ----------

function DomainFormSection({
	group,
	draft,
	onChange,
}: {
	group: ConfigDomainSchema["groups"][number];
	draft: Record<string, unknown>;
	onChange: (next: Record<string, unknown>) => void;
}) {
	return (
		<div>
			{group.help ? (
				<Banner
					type="info"
					description={group.help}
					closeIcon={null}
					style={{ marginBottom: 12 }}
				/>
			) : null}
			{group.fields.map((f) => (
				<SchemaField
					key={f.key}
					field={f}
					value={getByPath(draft, f.key)}
					onChange={(v) => onChange(setByPath(draft, f.key, v))}
				/>
			))}
		</div>
	);
}

/** 纵向堆叠各分组（多配置域场景下，表单内不再套二级 Tab） */
function DomainForm({
	schema,
	draft,
	onChange,
}: {
	schema: ConfigDomainSchema;
	draft: Record<string, unknown>;
	onChange: (next: Record<string, unknown>) => void;
}) {
	const groups = schema.groups;
	if (groups.length === 0) {
		return (
			<Empty title="无表单字段" description="该域 schema 未定义任何分组" />
		);
	}
	return (
		<div>
			{groups.map((g) => (
				<div key={g.label} style={{ marginBottom: 28 }}>
					<Title heading={5} style={{ margin: "0 0 8px" }}>
						{g.label}
					</Title>
					<DomainFormSection group={g} draft={draft} onChange={onChange} />
				</div>
			))}
		</div>
	);
}

/**
 * 单配置域 + 多字段分组：页面一级 Tab = schema.groups（+ JSON）
 * 侧栏选「站点」后直接看到「基础信息 / 主题外观 / …」，不再嵌套「表单|JSON」
 */
function DomainGroupTabsEditor({
	schema,
	draft,
	onChange,
}: {
	schema: ConfigDomainSchema;
	draft: Record<string, unknown>;
	onChange: (next: Record<string, unknown>) => void;
}) {
	const groups = schema.groups;
	const firstKey = groups[0]?.label ?? "json";
	const [activeKey, setActiveKey] = useState(firstKey);

	useEffect(() => {
		setActiveKey(groups[0]?.label ?? "json");
	}, [schema.domain]);

	const safeKey =
		activeKey === "json" || groups.some((g) => g.label === activeKey)
			? activeKey
			: firstKey;

	return (
		<Tabs
		className="admin-scroll-tabs"
			type="line"
			activeKey={safeKey}
			onChange={setActiveKey}
			keepDOM={false}
			lazyRender
		>
			{groups.map((g) => (
				<TabPane tab={g.label} itemKey={g.label} key={g.label}>
					<div style={{ paddingTop: 12 }}>
						<DomainFormSection
							group={g}
							draft={draft}
							onChange={onChange}
						/>
					</div>
				</TabPane>
			))}
			<TabPane tab="JSON" itemKey="json">
				<div style={{ paddingTop: 12 }}>
					<DomainJsonEditor
						draft={draft}
						onChange={onChange}
						fileName={`${schema.domain}.json`}
					/>
				</div>
			</TabPane>
		</Tabs>
	);
}

// ---------- JSON 模式 ----------

function DomainJsonEditor({
	draft,
	onChange,
	fileName,
}: {
	draft: Record<string, unknown>;
	onChange: (next: Record<string, unknown>) => void;
	/** 如 site.json，显示在 JSON 标签页内 */
	fileName?: string;
}) {
	const [text, setText] = useState(() =>
		JSON.stringify(draft, null, "\t"),
	);
	const [err, setErr] = useState<string | null>(null);
	// 默认只读，点「编辑」后可改
	const [editing, setEditing] = useState(false);

	// draft 外部变化时同步（如表单改了再切过来）；编辑中不覆盖，避免打字被冲掉
	useEffect(() => {
		if (editing) return;
		setText(JSON.stringify(draft, null, "\t"));
		setErr(null);
	}, [draft, editing]);

	const handleChange = (t: string) => {
		setText(t);
		try {
			const parsed = JSON.parse(t);
			if (!isPlainObject(parsed)) {
				setErr("顶层必须是对象");
				return;
			}
			setErr(null);
			onChange(parsed);
		} catch (e) {
			setErr(e instanceof Error ? e.message : "JSON 解析失败");
		}
	};

	const format = () => {
		try {
			const parsed = JSON.parse(text);
			if (!isPlainObject(parsed)) {
				setErr("顶层必须是对象");
				return;
			}
			const pretty = JSON.stringify(parsed, null, "\t");
			setText(pretty);
			setErr(null);
			onChange(parsed);
			Toast.success("已格式化");
		} catch (e) {
			setErr(e instanceof Error ? e.message : "JSON 解析失败");
			Toast.warning("无法格式化：JSON 无效");
		}
	};

	const startEdit = () => {
		setText(JSON.stringify(draft, null, "\t"));
		setErr(null);
		setEditing(true);
	};

	const finishEdit = () => {
		// 退出编辑时若 JSON 无效，回退到当前 draft，避免脏文本残留
		try {
			const parsed = JSON.parse(text);
			if (!isPlainObject(parsed)) {
				Toast.warning("顶层必须是对象，已恢复为上次有效内容");
				setText(JSON.stringify(draft, null, "\t"));
				setErr(null);
			} else {
				setErr(null);
				onChange(parsed);
			}
		} catch {
			Toast.warning("JSON 无效，已恢复为上次有效内容");
			setText(JSON.stringify(draft, null, "\t"));
			setErr(null);
		}
		setEditing(false);
	};

	return (
		<div>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					marginBottom: 8,
					gap: 8,
					flexWrap: "wrap",
				}}
			>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: 2,
						minWidth: 0,
					}}
				>
					{fileName ? (
						<Text type="tertiary" size="small">
							文件：{fileName}
						</Text>
					) : null}
					<Text type="tertiary" size="small">
						{editing
							? "正在编辑 JSON。与表单共享同一份状态，保存前须为合法对象。"
							: "默认只读预览。点「编辑」后可直接改 JSON，与表单共享同一份状态。"}
					</Text>
				</div>
				<div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
					{editing ? (
						<>
							<Button size="small" onClick={format}>
								格式化
							</Button>
							<Button size="small" theme="solid" onClick={finishEdit}>
								完成
							</Button>
						</>
					) : (
						<Button size="small" theme="solid" onClick={startEdit}>
							编辑
						</Button>
					)}
				</div>
			</div>
			<TextArea
				value={text}
				onChange={handleChange}
				readonly={!editing}
				autosize={{ minRows: 18, maxRows: 40 }}
				style={{
					fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
					fontSize: 13,
				}}
			/>
			{err ? (
				<Banner
					type="danger"
					description={`JSON 无效：${err}`}
					closeIcon={null}
					style={{ marginTop: 8 }}
				/>
			) : (
				<Text
					type="success"
					size="small"
					style={{ display: "block", marginTop: 8 }}
				>
					JSON 有效
				</Text>
			)}
		</div>
	);
}


// ---------- 危险项收集 ----------

function collectDangerHits(
	schema: ConfigDomainSchema | undefined,
	draft: Record<string, unknown>,
	baseline: Record<string, unknown>,
): string[] {
	if (!schema?.hasForm) return [];
	const hits: string[] = [];
	for (const g of schema.groups) {
		for (const f of g.fields) {
			if (!f.danger) continue;
			const a = getByPath(draft, f.key);
			const b = getByPath(baseline, f.key);
			if (stableStringify(a) !== stableStringify(b)) {
				hits.push(`${schema.label} · ${f.label}：${f.danger}`);
			}
		}
	}
	return hits;
}

// ---------- 单域编辑区 ----------

function DomainEditor({
	domain,
	draft,
	onChange,
	loadError,
	/** 单配置域时：字段分组直接作为页面一级 Tab，不再套「表单|JSON」 */
	flatGroupTabs = false,
}: {
	domain: ConfigDomain;
	draft: Record<string, unknown> | null;
	onChange: (next: Record<string, unknown>) => void;
	loadError?: string;
	flatGroupTabs?: boolean;
}) {
	const schema = SCHEMA_BY_DOMAIN[domain];
	const hasForm = schema?.hasForm ?? false;
	const multiGroupForm = Boolean(hasForm && schema && schema.groups.length > 1);
	const [mode, setMode] = useState<"form" | "json">(hasForm ? "form" : "json");

	// 切换域时重置模式：有表单默认表单，无表单强制 JSON（避免上一个域的 JSON 状态残留）
	useEffect(() => {
		setMode(hasForm ? "form" : "json");
	}, [hasForm, domain]);

	if (loadError) {
		return (
			<Empty
				image={<div style={{ fontSize: 48 }}>⚠️</div>}
				title="该域加载失败"
				description={loadError}
			/>
		);
	}
	if (!draft) {
		return (
			<Empty title="无数据" description="服务端返回 null，可尝试重新加载" />
		);
	}

	// 单域 + 多字段分组：页面一级 Tab 直接是「基础信息 / 主题外观 / … / JSON」
	if (flatGroupTabs && multiGroupForm && schema) {
		return (
			<DomainGroupTabsEditor
				schema={schema}
				draft={draft}
				onChange={onChange}
			/>
		);
	}

	return (
		<div>
			{hasForm ? (
				<Tabs
					type="line"
					activeKey={mode}
					onChange={(k) => setMode(k as "form" | "json")}
				>
					<TabPane tab="表单" itemKey="form">
						<div style={{ paddingTop: 12 }}>
							<DomainForm
								schema={schema}
								draft={draft}
								onChange={onChange}
							/>
						</div>
					</TabPane>
					<TabPane tab="JSON" itemKey="json">
						<div style={{ paddingTop: 12 }}>
							<DomainJsonEditor
								draft={draft}
								onChange={onChange}
								fileName={`${domain}.json`}
							/>
						</div>
					</TabPane>
				</Tabs>
			) : (
				<div>
					<Banner
						type="info"
						description="该域无可视化表单定义，请使用 JSON 模式编辑。"
						closeIcon={null}
						style={{ marginBottom: 12 }}
					/>
					<DomainJsonEditor
						draft={draft}
						onChange={onChange}
						fileName={`${domain}.json`}
					/>
				</div>
			)}
		</div>
	);
}

// ---------- 页面 ----------

export function SiteConfigPage() {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const location = useLocation();
	const { pageStyle, stickyStyle } = usePageShell();
	const saveModalProps = useModalProps(520);

	const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
		queryKey: ["config"],
		queryFn: () => configApi.get(),
	});

	// 本地草稿 / 基线：null 表示尚未灌入
	const [drafts, setDrafts] = useState<
		Partial<Record<ConfigDomain, Record<string, unknown> | null>>
	>({});
	const [baselines, setBaselines] = useState<
		Partial<Record<ConfigDomain, string>>
	>({});
	const [saveVisible, setSaveVisible] = useState(false);

	// 分组 → 域列表（GROUP_ORDER 顺序）
	const schemasByGroup = useMemo(() => getSchemasByGroup(), []);

	// 从 /site-config/:group/:domain? 解析（单路由 splat，切分组不 remount）
	const pathSegs = useMemo(() => {
		const rest = location.pathname.replace(/^\/site-config\/?/, "");
		return rest
			.split("/")
			.filter(Boolean)
			.map((s) => {
				try {
					return decodeURIComponent(s);
				} catch {
					return s;
				}
			});
	}, [location.pathname]);
	const rawGroup = pathSegs[0] ?? "";
	const rawDomain = pathSegs[1] ?? "";

	// 解析 URL 分组（非法则回落到「站点」）
	const activeGroup = useMemo(() => {
		if (rawGroup && isConfigGroup(rawGroup)) return rawGroup;
		return GROUP_ORDER[0];
	}, [rawGroup]);

	const groupSchemas = useMemo(
		() => schemasByGroup.get(activeGroup) ?? [],
		[schemasByGroup, activeGroup],
	);

	// 解析 URL 域（不在当前组或不合法 → 组内第一个）
	const activeDomain = useMemo<ConfigDomain>(() => {
		const inGroup = groupSchemas.find((s) => s.domain === rawDomain);
		if (inGroup) return inGroup.domain as ConfigDomain;
		const first = groupSchemas[0]?.domain;
		return (first ?? "site") as ConfigDomain;
	}, [rawDomain, groupSchemas]);

	// 规范化 URL：缺省/非法 group·domain 时 replace 到合法深链
	useEffect(() => {
		if (rawGroup === activeGroup && rawDomain === activeDomain) return;
		navigate(
			`/site-config/${encodeURIComponent(activeGroup)}/${encodeURIComponent(activeDomain)}`,
			{ replace: true },
		);
	}, [activeGroup, activeDomain, rawGroup, rawDomain, navigate]);

	const goDomain = useCallback(
		(domain: string) => {
			navigate(
				`/site-config/${encodeURIComponent(activeGroup)}/${encodeURIComponent(domain)}`,
			);
		},
		[navigate, activeGroup],
	);

	// 服务端数据灌入本地
	useEffect(() => {
		if (!data?.domains) return;
		const nextDrafts: Partial<
			Record<ConfigDomain, Record<string, unknown> | null>
		> = {};
		const nextBase: Partial<Record<ConfigDomain, string>> = {};
		for (const s of DOMAIN_SCHEMAS) {
			const d = s.domain as ConfigDomain;
			const raw = data.domains[d];
			if (raw && isPlainObject(raw)) {
				const cloned = cloneObj(raw);
				nextDrafts[d] = cloned;
				nextBase[d] = stableStringify(cloned);
			} else {
				nextDrafts[d] = null;
				nextBase[d] = "";
			}
		}
		setDrafts(nextDrafts);
		setBaselines(nextBase);
	}, [data]);

	const dirtyDomains = useMemo(() => {
		const list: ConfigDomain[] = [];
		for (const s of DOMAIN_SCHEMAS) {
			const d = s.domain as ConfigDomain;
			const draft = drafts[d];
			if (!draft) continue;
			const base = baselines[d] ?? "";
			if (stableStringify(draft) !== base) list.push(d);
		}
		return list;
	}, [drafts, baselines]);

	const dirty = dirtyDomains.length > 0;

	// 同步 dirty 到侧栏（离开页面时清空，避免残留橙点）
	useEffect(() => {
		setConfigDirtyDomains(dirtyDomains);
		return () => setConfigDirtyDomains([]);
	}, [dirtyDomains]);

	const dangerHits = useMemo(() => {
		const hits: string[] = [];
		for (const d of dirtyDomains) {
			const draft = drafts[d];
			const baseStr = baselines[d];
			if (!draft || !baseStr) continue;
			try {
				const base = JSON.parse(baseStr) as Record<string, unknown>;
				hits.push(
					...collectDangerHits(SCHEMA_BY_DOMAIN[d], draft, base),
				);
			} catch {
				// ignore
			}
		}
		return hits;
	}, [dirtyDomains, drafts, baselines]);

	const setDomainDraft = useCallback(
		(domain: ConfigDomain, next: Record<string, unknown>) => {
			setDrafts((prev) => ({ ...prev, [domain]: next }));
		},
		[],
	);

	const resetAll = () => {
		if (!data?.domains) return;
		const nextDrafts: Partial<
			Record<ConfigDomain, Record<string, unknown> | null>
		> = {};
		const nextBase: Partial<Record<ConfigDomain, string>> = {};
		for (const s of DOMAIN_SCHEMAS) {
			const d = s.domain as ConfigDomain;
			const raw = data.domains[d];
			if (raw && isPlainObject(raw)) {
				const cloned = cloneObj(raw);
				nextDrafts[d] = cloned;
				nextBase[d] = stableStringify(cloned);
			} else {
				nextDrafts[d] = null;
				nextBase[d] = "";
			}
		}
		setDrafts(nextDrafts);
		setBaselines(nextBase);
		Toast.info("已放弃全部本地修改");
	};

	const saveMutation = useMutation({
		mutationFn: () => {
			const changes: Partial<
				Record<ConfigDomain, Record<string, unknown>>
			> = {};
			for (const d of dirtyDomains) {
				const draft = drafts[d];
				if (draft) changes[d] = draft;
			}
			return configApi.save(changes);
		},
		onSuccess: (res) => {
			// 刷新基线为当前草稿
			setBaselines((prev) => {
				const next = { ...prev };
				for (const d of dirtyDomains) {
					const draft = drafts[d];
					if (draft) next[d] = stableStringify(draft);
				}
				return next;
			});
			Toast.success(
				`已提交（${res.commit.slice(0, 7)}），构建约 3-5 分钟生效`,
			);
			queryClient.invalidateQueries({ queryKey: ["builds"] });
			// 预热构建列表轮询（BuildsPage 同 queryKey，有 pending 时会 10s 轮询）
			queryClient.invalidateQueries({ queryKey: ["config"] });
			setSaveVisible(false);
		},
		onError: (err: Error) => {
			const msg = err.message || "保存失败";
			// 尽量展示 details
			const data = (err as { data?: { details?: string[] } }).data;
			if (data?.details?.length) {
				Toast.error(`${msg}：${data.details.slice(0, 3).join("；")}`);
			} else {
				Toast.error(msg);
			}
		},
	});

	const activeDraft = drafts[activeDomain] ?? null;
	const activeError = data?.errors?.[activeDomain];

	if (isError) {
		return (
			<div style={pageStyle}>
				<div style={stickyStyle}>
					<Title heading={3} style={{ margin: "0 0 4px" }}>
						{activeGroup}
					</Title>
					<Text type="tertiary" style={{ display: "block" }}>
						编辑站点 JSON 配置并批量写回仓库。保存后触发构建，约 3-5
						分钟生效。侧栏切换分组，下方标签切换配置域。
					</Text>
				</div>
				<Empty
					image={<div style={{ fontSize: 48 }}>⚠️</div>}
					title="读取配置失败"
					description={(error as Error)?.message || "请检查登录态或 CNB 通道"}
				>
					<Button onClick={() => refetch()}>重试</Button>
				</Empty>
			</div>
		);
	}

	const seeded = Object.keys(baselines).length > 0;

	// Tab 内容区操作栏（对齐资料数据/页面内容：吸顶只放标题+说明，按钮在 Tab 内）
	const domainToolbar = (
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
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					flexWrap: "wrap",
				}}
			>
				{dirtyDomains.includes(activeDomain) ? (
					<Tag size="small" color="orange">
						已修改
					</Tag>
				) : null}
				<Button
					icon={<IconRefresh />}
					onClick={() => refetch()}
					loading={isFetching}
				>
					重新加载
				</Button>
			</div>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					flexWrap: "wrap",
				}}
			>
				{dirty ? (
					<Popconfirm
						title="放弃全部本地修改？"
						content="将丢弃所有未保存的域修改，恢复到服务端当前内容"
						okType="danger"
						onConfirm={resetAll}
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
					onClick={() => setSaveVisible(true)}
				>
					保存全部修改
					{dirty ? `（${dirtyDomains.length}）` : ""}
				</Button>
			</div>
		</div>
	);

	return (
		<BusySpin spinning={saveMutation.isPending}>
			<div style={pageStyle}>
			{/* 吸顶区:只吸标题+副标题(Tab 头跟内容滚，对齐资料数据/页面内容) */}
			<div style={stickyStyle}>
				<Title heading={3} style={{ margin: "0 0 4px" }}>
					{activeGroup}
				</Title>
				<Text type="tertiary" style={{ display: "block" }}>
					编辑站点 JSON 配置并批量写回仓库。保存后触发构建，约 3-5
					分钟生效。侧栏切换分组；单域分组下页面标签直接切换字段分类。
				</Text>
			</div>

			{isLoading || !seeded ? (
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						gap: 12,
						padding: 64,
					}}
				>
					<Spin size="large" />
					<span style={{ color: "var(--semi-color-text-2)" }}>
						加载全站配置中…
					</span>
				</div>
			) : (() => {
				// 单配置域（如侧栏「站点」）：不渲染「站点」域 Tab，页面一级直接是字段分组标签
				const singleDomain =
					groupSchemas.length === 1
						? (groupSchemas[0].domain as ConfigDomain)
						: null;
				// 工具栏 / dirty Banner 一律在 Tabs 外（单域、多域一致）
				const chrome = (
					<>
						{domainToolbar}
						{dirty ? (
							<Banner
								type="warning"
								description={`本地有 ${dirtyDomains.length} 个域未保存：${dirtyDomains
									.map((x) => CONFIG_DOMAIN_LABELS[x])
									.join("、")}。点击「保存全部修改」写回并触发一次构建。`}
								closeIcon={null}
								style={{ marginBottom: 12 }}
							/>
						) : null}
					</>
				);
				const editor = (
					<DomainEditor
						domain={activeDomain}
						draft={activeDraft}
						onChange={(next) => setDomainDraft(activeDomain, next)}
						loadError={activeError}
						flatGroupTabs={singleDomain != null}
					/>
				);
				if (singleDomain != null) {
					return (
						<div>
							{chrome}
							{editor}
						</div>
					);
				}
				return (
					<div>
						{chrome}
						<Tabs
							className="admin-scroll-tabs"
							type="line"
							activeKey={activeDomain}
							onChange={(k) => goDomain(String(k))}
							keepDOM={false}
							lazyRender
						>
							{groupSchemas.map((s) => {
								const d = s.domain as ConfigDomain;
								const isDirty = dirtyDomains.includes(d);
								const tabLabel = isDirty ? (
									<span
										style={{
											display: "inline-flex",
											alignItems: "center",
											gap: 6,
										}}
									>
										{s.label}
										<span
											aria-label="已修改"
											style={{
												width: 6,
												height: 6,
												borderRadius: "50%",
												backgroundColor: "var(--semi-color-warning)",
												flexShrink: 0,
											}}
										/>
									</span>
								) : (
									s.label
								);
								return (
									<TabPane tab={tabLabel} itemKey={d} key={d}>
										{/* 仅当前激活域渲染编辑器，避免多份挂载；工具栏已在 Tabs 外 */}
										{d === activeDomain ? (
											<div style={{ paddingTop: 12 }}>{editor}</div>
										) : null}
									</TabPane>
								);
							})}
						</Tabs>
					</div>
				);
			})()}

			{/* 保存确认 */}
			<Modal
				title="保存全部修改"
				visible={saveVisible}
				onOk={() => saveMutation.mutate()}
				onCancel={() => setSaveVisible(false)}
				okText="确认保存"
				cancelText="取消"
				confirmLoading={saveMutation.isPending}
				maskClosable={false}
				{...saveModalProps}
			>
				<div>
					<p style={{ marginTop: 0 }}>
						将把以下{" "}
						<strong>{dirtyDomains.length}</strong>{" "}
						个域写入同一个 commit 并 push，触发一次构建（约 3-5 分钟生效）：
					</p>
					<ul style={{ paddingLeft: 20, marginBottom: 12 }}>
						{dirtyDomains.map((d) => (
							<li key={d}>
								{CONFIG_DOMAIN_LABELS[d]}（{d}.json）
							</li>
						))}
					</ul>
					{dangerHits.length > 0 ? (
						<Banner
							type="danger"
							title="危险项变更，请再次确认"
							description={
								<ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
									{dangerHits.map((h) => (
										<li key={h}>{h}</li>
									))}
								</ul>
							}
							closeIcon={null}
						/>
					) : null}
					{/* font/gallery/pio/site/wallpaper 首次保存可能展开短数组，值零变化 */}
					<Text type="tertiary" size="small" style={{ display: "block", marginTop: 12 }}>
						提示：site / wallpaper / pio / gallery / font 五个域内若有 biome
						折叠的单行短数组，首次保存会展开为多行（值不变，属已知现象）。
					</Text>
				</div>
			</Modal>
		</div>

		</BusySpin>
	);
}
