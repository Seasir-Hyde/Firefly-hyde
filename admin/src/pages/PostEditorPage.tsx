// 文章编辑页：frontmatter 表单化（Semi Form）+ 正文编辑（md-editor-rt）+ 保存提交 git
// 新建：/posts/new；编辑：/posts/edit?path=<相对路径>
// 保存 = PUT Cloud Functions → git push → 触发 CNB 构建；草稿走 [skip build]
import { IconUpload } from "@douyinfe/semi-icons";
import {
	Banner,
	Button,
	Card,
	Form,
	Modal,
	Space,
	Spin,
	Toast,
	Typography,
	useFormApi,
} from "@douyinfe/semi-ui";
import type { FormApi } from "@douyinfe/semi-ui/lib/es/form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ApiError } from "@/api/client";
import {
	type PostFrontmatter,
	postsApi,
	type SavePostPayload,
} from "@/api/posts";
import { AdminMdEditor } from "@/components/AdminMdEditor";
import { BusySpin } from "@/components/BusySpin";
import { QiniuUpload } from "@/components/QiniuUpload";
import { useIsMobile } from "@/hooks/useIsMobile";
import { usePageShell } from "@/hooks/usePageShell";

const { Title, Text } = Typography;

// frontmatter 表单值（tags 用数组，日期用字符串 YYYY-MM-DD）
interface EditorFormValues {
	title: string;
	published: string;
	updated?: string;
	description?: string;
	image?: string;
	slug?: string;
	category?: string;
	tags?: string[];
	pinned?: boolean;
	draft?: boolean;
}

// 是否暗色的探测已收编到 @/hooks/useIsDark(AdminMdEditor 内部自持,本页不再需要)

// 从 frontmatter 还原表单值
function toFormValues(fm: PostFrontmatter): EditorFormValues {
	return {
		title: fm.title || "",
		published: fm.published || "",
		updated: fm.updated || "",
		description: fm.description || "",
		image: fm.image || "",
		slug: fm.slug || "",
		category: fm.category || "",
		tags: Array.isArray(fm.tags) ? fm.tags : [],
		pinned: fm.pinned === true,
		draft: fm.draft === true,
	};
}

// 把表单值合并回 frontmatter（保留未在表单出现的其他字段）
function toFrontmatter(
	values: EditorFormValues,
	base: PostFrontmatter,
): PostFrontmatter {
	const fm: PostFrontmatter = { ...base };
	fm.title = values.title.trim();
	fm.published = values.published || "";
	if (values.updated) fm.updated = values.updated;
	else delete fm.updated;
	fm.description = values.description || "";
	fm.image = values.image || "";
	if (values.slug) fm.slug = values.slug;
	else delete fm.slug;
	fm.category = values.category || "";
	fm.tags = values.tags ?? [];
	fm.pinned = values.pinned === true;
	fm.draft = values.draft === true;
	return fm;
}

// 内部表单内容组件：可用 useFormApi 拿到 api 做 setValues
function EditorForm({
	body,
	onBodyChange,
	getFormApi,
}: {
	body: string;
	onBodyChange: (v: string) => void;
	getFormApi: (api: FormApi<EditorFormValues>) => void;
}) {
	const formApi = useFormApi<EditorFormValues>();
	const isMobile = useIsMobile();
	useEffect(() => {
		getFormApi(formApi);
	}, [formApi, getFormApi]);

	return (
		<>
			<Form.Input
				field="title"
				label="标题"
				placeholder="文章标题"
				rules={[{ required: true, message: "标题必填" }]}
			/>
			<Space wrap>
				<Form.DatePicker
					field="published"
					label="发布日期"
					type="date"
					format="yyyy-MM-dd"
					rules={[{ required: true, message: "发布日期必填" }]}
				/>
				<Form.DatePicker
					field="updated"
					label="更新日期（可选）"
					type="date"
					format="yyyy-MM-dd"
				/>
				<Form.Input
					field="category"
					label="分类"
					placeholder="如 Firefly"
					style={{ width: isMobile ? "100%" : 180 }}
				/>
			</Space>
			<Form.TagInput field="tags" label="标签" placeholder="回车添加标签" />
			<Form.TextArea
				field="description"
				label="描述"
				placeholder="文章摘要描述"
				autosize
				maxCount={300}
			/>
			{/* 封面/slug 行。
			    - 上传按钮用 Form.Slot 占位同高 label，与 Form.Input 字段外壳对齐（裸 Button 会偏上/偏中）。
			    - 桌面：flex 底对齐；封面 URL 弹性拉长（原 320 过短，长七牛链被截断）。
			    - 小屏块级流式，避免换行基线错位。同一棵树只切容器/宽度，避免卸载丢值。 */}
			<div
				style={
					isMobile
						? undefined
						: {
								display: "flex",
								flexWrap: "wrap",
								alignItems: "flex-end",
								gap: 8,
							}
				}
			>
				<Form.Input
					field="image"
					label="封面图 URL"
					placeholder="/images/... 或外链，或点上传按钮"
					style={
						isMobile
							? { width: "100%" }
							: { flex: "1 1 480px", minWidth: 360, width: "auto" }
					}
				/>
				{/* Form.Slot + 不可见 label：与左侧 Input 的 label 行等高，按钮贴输入框底边 */}
				<Form.Slot label={<span style={{ visibility: "hidden" }}>上传</span>}>
					<QiniuUpload
						onUploaded={(url) => formApi.setValue("image", url)}
						showUploadList={false}
					>
						<Button icon={<IconUpload />}>上传封面</Button>
					</QiniuUpload>
				</Form.Slot>
				<Form.Input
					field="slug"
					label="自定义 slug（可选）"
					placeholder="如 /quickstart"
					style={{ width: isMobile ? "100%" : 220 }}
				/>
			</div>
			<Space>
				<Form.Switch field="pinned" label="置顶" />
				<Form.Switch field="draft" label="草稿" />
			</Space>
			<div style={{ marginTop: 12 }}>
				<Text strong>正文</Text>
				<div style={{ marginTop: 8 }}>
					<AdminMdEditor
						value={body}
						onChange={onBodyChange}
						desktopHeight={520}
					/>
				</div>
			</div>
		</>
	);
}

export function PostEditorPage() {
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { isMobile, pageStyle, stickyStyle } = usePageShell();

	const editPath = searchParams.get("path");
	const isNew = !editPath;

	const [body, setBody] = useState("");
	// 新建时用户填写的目标文件路径（相对 blog 目录）
	const [newPath, setNewPath] = useState("");
	const formApiRef = useRef<FormApi<EditorFormValues> | null>(null);
	// 保存单篇读到的原始 frontmatter，写回时合并保留未知字段
	const baseFmRef = useRef<PostFrontmatter>({ title: "", published: "" });

	// 编辑模式：加载单篇
	const detailQuery = useQuery({
		queryKey: ["post", editPath],
		queryFn: () => postsApi.get(editPath as string),
		enabled: !isNew,
	});

	useEffect(() => {
		// 防御：仅当拿到含 frontmatter 的对象才回填，避免 data 异常时 toFormValues 读 undefined.title 崩溃白屏
		if (detailQuery.data?.frontmatter) {
			baseFmRef.current = detailQuery.data.frontmatter;
			setBody(detailQuery.data.body ?? "");
			formApiRef.current?.setValues(toFormValues(detailQuery.data.frontmatter));
		}
	}, [detailQuery.data]);

	const saveMutation = useMutation({
		mutationFn: async ({
			path,
			payload,
		}: {
			path: string;
			payload: SavePostPayload;
		}) => postsApi.save(path, payload),
		onSuccess: (_data, variables) => {
			queryClient.invalidateQueries({ queryKey: ["posts"] });
			queryClient.invalidateQueries({ queryKey: ["post", variables.path] });
		},
	});

	// 目标文件路径：编辑用原路径，新建用用户填写的路径
	const targetPath = useMemo(
		() => (isNew ? newPath.trim() : (editPath as string)),
		[isNew, newPath, editPath],
	);

	const doSave = useCallback(
		async (skipBuild: boolean) => {
			const api = formApiRef.current;
			if (!api) return;
			try {
				await api.validate();
			} catch {
				Toast.error("请检查表单必填项");
				return;
			}
			const values = api.getValues();

			if (isNew) {
				const p = newPath.trim();
				if (!p) {
					Toast.error("请填写文章文件路径，如 Firefly/新文章.md");
					return;
				}
				if (!/\.mdx?$/.test(p)) {
					Toast.error("文件路径需以 .md 或 .mdx 结尾");
					return;
				}
			}

			const frontmatter = toFrontmatter(values, baseFmRef.current);
			// 存草稿：强制 draft=true（生产构建过滤）；保存并发布：强制 draft=false。
			// 与表单「草稿」开关解耦——右上角按钮语义优先，避免「存草稿却忘开开关」。
			frontmatter.draft = skipBuild;
			// 同步表单开关，避免保存成功后若停留本页开关状态与实际不一致
			api.setValue("draft", skipBuild);
			const payload: SavePostPayload = {
				frontmatter,
				body,
				skipBuild,
				commitMessage: skipBuild
					? `文章(草稿): ${frontmatter.title}`
					: `文章: ${isNew ? "新增" : "更新"} ${frontmatter.title}`,
			};

			saveMutation.mutate(
				{ path: targetPath, payload },
				{
					onSuccess: () => {
						Modal.success({
							title: "已提交到仓库",
							content: skipBuild
								? "草稿已保存（draft: true + [skip build]，不触发博客构建，生产环境不会展示）。"
								: "已 git push 到 CNB（draft: false），博客将在约 3–5 分钟后重建上线。可到「构建记录」查看进度。",
							onOk: () => navigate("/posts"),
							// 命令式弹窗在点击时求值:小屏收窄到视口内,桌面不传保持 Semi 默认宽
							...(window.innerWidth < 768
								? { width: window.innerWidth - 32 }
								: {}),
						});
					},
					onError: (err) => {
						const msg =
							err instanceof ApiError ? err.message : "保存失败，请稍后重试";
						Toast.error(msg);
					},
				},
			);
		},
		[isNew, newPath, body, targetPath, saveMutation, navigate],
	);

	if (!isNew && detailQuery.isLoading) {
		// Spin 的 tip 仅在作为包裹元素（有 children）时才有正常布局；
		// 无 children 时单独用会导致文字竖排换行，故改为 Spin + 独立文字纵向居中排列。
		return (
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
				<span style={{ color: "var(--semi-color-text-2)" }}>加载文章中…</span>
			</div>
		);
	}

	if (!isNew && detailQuery.isError) {
		const msg =
			detailQuery.error instanceof ApiError
				? detailQuery.error.message
				: "加载失败";
		return <Banner type="danger" description={msg} style={{ margin: 24 }} />;
	}

	const saving = saveMutation.isPending;

	return (
		<BusySpin spinning={saving} style={{ minHeight: "60vh" }}>
			<div style={pageStyle}>
				{/* 吸顶区:标题行(含保存操作)sticky,滚动时钉在顶部,方便随时保存 */}
				<div style={stickyStyle}>
				{/* 小屏标题与按钮组分两行(按钮组自身可再换行),桌面保持单行两端对齐 */}
				<div
					style={{
						display: "flex",
						flexDirection: isMobile ? "column" : "row",
						alignItems: isMobile ? "stretch" : "center",
						justifyContent: "space-between",
						gap: isMobile ? 8 : 0,
					}}
				>
					<Title heading={3} style={{ margin: 0 }}>
						{isNew ? "新建文章" : "编辑文章"}
					</Title>
					<Space wrap>
						<Button onClick={() => navigate("/posts")} disabled={saving}>
							取消
						</Button>
						<Button
							onClick={() => doSave(true)}
							loading={saving}
							disabled={saving}
						>
							存草稿（不构建）
						</Button>
						<Button
							theme="solid"
							type="primary"
							onClick={() => doSave(false)}
							loading={saving}
							disabled={saving}
						>
							保存并发布
						</Button>
					</Space>
				</div>
			</div>

			{isNew ? (
				<Banner
					type="info"
					closeIcon={null}
					style={{ marginBottom: 16 }}
					description="新建文章：先填写目标文件路径（相对 src/content/blog），保存后写入仓库并触发构建。"
				/>
			) : (
				<Text type="tertiary" style={{ display: "block", marginBottom: 16 }}>
					文件路径：{editPath}
				</Text>
			)}

			<Card>
				{isNew ? (
					<Form.Slot label="文章文件路径" style={{ marginBottom: 8 }}>
						<input
							style={{
								width: "100%",
								maxWidth: 480,
								padding: "6px 12px",
								borderRadius: 6,
								border: "1px solid var(--semi-color-border)",
								background: "var(--semi-color-fill-0)",
								color: "var(--semi-color-text-0)",
							}}
							placeholder="如 Firefly/新文章.md"
							value={newPath}
							onChange={(e) => setNewPath(e.target.value)}
						/>
					</Form.Slot>
				) : null}
				<Form<EditorFormValues>
					initValues={{
						title: "",
						published: "",
						tags: [],
						pinned: false,
						draft: false,
					}}
				>
					<EditorForm
						body={body}
						onBodyChange={setBody}
						getFormApi={(api) => {
							formApiRef.current = api;
						}}
					/>
				</Form>
			</Card>
		</div>
		</BusySpin>
	);
}
