// 说说管理页：时间流卡片（List）+ 发布/编辑 Modal + 图片 URL 输入与预览 + 删除 Popconfirm
// 数据走 Edge Functions + KV（见 edge-functions/api/moments/index.js），秒级生效
import {
	IconDelete,
	IconEdit,
	IconImage,
	IconPlus,
	IconRefresh,
	IconUpload,
} from "@douyinfe/semi-icons";
import {
	Button,
	Card,
	Empty,
	Image,
	Input,
	List,
	Modal,
	Popconfirm,
	Space,
	TagInput,
	TextArea,
	Toast,
	Typography,
} from "@douyinfe/semi-ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
// 现代图片预览:手指捏合/双击/滑动切换/滚轮缩放(Semi ImagePreview 无触摸手势,站长拍板引入);
// AdminPhotoProvider 在其上增强下载/复制链接/切换箭头/底部缩略图条
import { PhotoView } from "react-photo-view";
import { type Moment, momentsApi, type SaveMomentPayload } from "@/api/moments";
import { AdminPhotoProvider } from "@/components/AdminPhotoProvider";
import { QiniuUpload } from "@/components/QiniuUpload";
import { useModalProps } from "@/hooks/useModalProps";
import { usePageShell } from "@/hooks/usePageShell";

const { Title, Text, Paragraph } = Typography;

// 本地 datetime-local 输入值 <-> ISO 串互转
function isoToLocalInput(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "";
	// 转成本地时区的 yyyy-MM-ddTHH:mm
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localInputToIso(local: string): string {
	if (!local) return new Date().toISOString();
	const d = new Date(local);
	return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

// 编辑器表单状态（受控）
interface EditorState {
	id: string | null; // null = 新建
	content: string;
	dateLocal: string;
	images: string[];
	tags: string[];
	mood: string;
	location: string;
	locationUrl: string;
	video: string;
}

function emptyEditor(): EditorState {
	return {
		id: null,
		content: "",
		dateLocal: isoToLocalInput(new Date().toISOString()),
		images: [],
		tags: [],
		mood: "",
		location: "",
		locationUrl: "",
		video: "",
	};
}

function editorFromMoment(m: Moment): EditorState {
	return {
		id: m.id,
		content: m.content ?? "",
		dateLocal: isoToLocalInput(m.date),
		images: m.images ?? [],
		tags: m.tags ?? [],
		mood: m.mood ?? "",
		location: m.location ?? "",
		locationUrl: m.locationUrl ?? "",
		video: m.video ?? "",
	};
}

// 编辑器 state → API payload（空字段不下发，交给后端归一化）
function editorToPayload(e: EditorState): SaveMomentPayload {
	const payload: SaveMomentPayload = {
		content: e.content,
		date: localInputToIso(e.dateLocal),
		images: e.images,
		tags: e.tags,
	};
	if (e.mood.trim()) payload.mood = e.mood.trim();
	if (e.location.trim()) payload.location = e.location.trim();
	if (e.locationUrl.trim()) payload.locationUrl = e.locationUrl.trim();
	if (e.video.trim()) payload.video = e.video.trim();
	return payload;
}

export function MomentsPage() {
	const queryClient = useQueryClient();
	const { isMobile, pageStyle, stickyStyle } = usePageShell();
	const modalProps = useModalProps(640);
	const [modalVisible, setModalVisible] = useState(false);
	const [editor, setEditor] = useState<EditorState>(emptyEditor);
	// 图片 URL 临时输入框
	const [imageInput, setImageInput] = useState("");

	const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
		queryKey: ["moments"],
		queryFn: () => momentsApi.list(),
	});

	const saveMutation = useMutation({
		mutationFn: (vars: { id: string | null; payload: SaveMomentPayload }) =>
			vars.id
				? momentsApi.update(vars.id, vars.payload)
				: momentsApi.create(vars.payload),
		onSuccess: () => {
			Toast.success("已保存，秒级生效");
			setModalVisible(false);
			queryClient.invalidateQueries({ queryKey: ["moments"] });
		},
		onError: (err: Error) => {
			Toast.error(err.message || "保存失败");
		},
	});

	const removeMutation = useMutation({
		mutationFn: (id: string) => momentsApi.remove(id),
		onSuccess: () => {
			Toast.success("已删除");
			queryClient.invalidateQueries({ queryKey: ["moments"] });
		},
		onError: (err: Error) => {
			Toast.error(err.message || "删除失败");
		},
	});

	const openNew = useCallback(() => {
		setEditor(emptyEditor());
		setImageInput("");
		setModalVisible(true);
	}, []);

	const openEdit = useCallback((m: Moment) => {
		setEditor(editorFromMoment(m));
		setImageInput("");
		setModalVisible(true);
	}, []);

	// 添加图片 URL（手填与直传上传共用：去重、忽略空串）
	const addImageUrl = useCallback((url: string) => {
		const u = url.trim();
		if (!u) return;
		setEditor((e) =>
			e.images.includes(u) ? e : { ...e, images: [...e.images, u] },
		);
	}, []);

	const handleAddImage = useCallback(() => {
		addImageUrl(imageInput);
		setImageInput("");
	}, [imageInput, addImageUrl]);

	const handleRemoveImage = useCallback((url: string) => {
		setEditor((e) => ({ ...e, images: e.images.filter((i) => i !== url) }));
	}, []);

	const handleSubmit = useCallback(() => {
		if (!editor.content.trim()) {
			Toast.warning("说说内容不能为空");
			return;
		}
		saveMutation.mutate({ id: editor.id, payload: editorToPayload(editor) });
	}, [editor, saveMutation]);

	const moments = useMemo(() => data?.moments ?? [], [data?.moments]);

	return (
		<div style={pageStyle}>
			{/* 吸顶区:标题行(含数量+操作)sticky */}
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
						说说
						{data ? (
							<Text type="tertiary" style={{ fontSize: 14, marginLeft: 12 }}>
								共 {data.total} 条
							</Text>
						) : null}
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
							onClick={openNew}
						>
							发布说说
						</Button>
					</Space>
				</div>
			</div>

			{isError ? (
				<Empty
					image={<div style={{ fontSize: 48 }}>⚠️</div>}
					title="读取说说失败"
					description={(error as Error)?.message || "请检查 KV 绑定或稍后重试"}
				>
					<Button onClick={() => refetch()}>重试</Button>
				</Empty>
			) : (
				<List
					loading={isLoading}
					dataSource={moments}
					emptyContent={
						<Empty title="还没有说说" description="点右上角发布第一条" />
					}
					renderItem={(m: Moment) => (
						<List.Item style={{ padding: "8px 0" }}>
							<Card
								style={{ width: "100%" }}
								bodyStyle={{ padding: 16 }}
								shadows="hover"
							>
								<div
									style={{
										display: "flex",
										justifyContent: "space-between",
										alignItems: "flex-start",
										gap: 12,
									}}
								>
									<div style={{ flex: 1, minWidth: 0 }}>
										<Paragraph style={{ whiteSpace: "pre-wrap", margin: 0 }}>
											{m.mood ? `${m.mood} ` : ""}
											{m.content}
										</Paragraph>
										{m.images && m.images.length > 0 ? (
											// 按条分组:点任意图进预览后可切换看本条全部图片
											<AdminPhotoProvider>
												{isMobile ? (
													// 小屏:只显示一排 3 张等宽方图,超出的在第 3 张叠 +N 数量角标
													<div
														style={{ display: "flex", gap: 8, marginTop: 8 }}
													>
														{m.images.slice(0, 3).map((src, i) => (
															<div
																key={src}
																style={{
																	position: "relative",
																	flex: 1,
																	minWidth: 0,
																	aspectRatio: "1 / 1",
																}}
															>
																{/* Semi Image 的 width/height prop 是 <img> 的 HTML
															    属性,不认 "100%",尺寸走 CSS(style/imgStyle) */}
																<PhotoView src={src}>
																	<div
																		style={{
																			width: "100%",
																			height: "100%",
																			cursor: "zoom-in",
																		}}
																	>
																		<Image
																			src={src}
																			preview={false}
																			style={{
																				width: "100%",
																				height: "100%",
																				borderRadius: 6,
																				overflow: "hidden",
																			}}
																			imgStyle={{
																				width: "100%",
																				height: "100%",
																				objectFit: "cover",
																			}}
																		/>
																	</div>
																</PhotoView>
																{i === 2 && (m.images?.length ?? 0) > 3 ? (
																	// pointerEvents none:点击穿透到底下的图片仍可预览
																	<div
																		style={{
																			position: "absolute",
																			inset: 0,
																			background: "rgba(0, 0, 0, 0.45)",
																			display: "flex",
																			alignItems: "center",
																			justifyContent: "center",
																			color: "#fff",
																			fontSize: 16,
																			fontWeight: 600,
																			borderRadius: 6,
																			pointerEvents: "none",
																		}}
																	>
																		+{(m.images?.length ?? 0) - 3}
																	</div>
																) : null}
															</div>
														))}
														{/* 第 4 张起不渲染缩略图,但注册进预览组(隐藏 trigger),滑动可达 */}
														{m.images.slice(3).map((src) => (
															<PhotoView key={src} src={src}>
																<span style={{ display: "none" }} />
															</PhotoView>
														))}
													</div>
												) : (
													<Space wrap style={{ marginTop: 8 }}>
														{m.images.map((src) => (
															<PhotoView key={src} src={src}>
																<div style={{ cursor: "zoom-in" }}>
																	<Image
																		src={src}
																		preview={false}
																		width={96}
																		height={96}
																		style={{
																			objectFit: "cover",
																			borderRadius: 6,
																		}}
																	/>
																</div>
															</PhotoView>
														))}
													</Space>
												)}
											</AdminPhotoProvider>
										) : null}
										<div style={{ marginTop: 8 }}>
											<Space wrap spacing={8}>
												<Text type="tertiary" size="small">
													{new Date(m.date).toLocaleString("zh-CN")}
												</Text>
												{m.location ? (
													<Text type="tertiary" size="small">
														📍 {m.location}
													</Text>
												) : null}
												{m.tags?.map((t) => (
													<Text key={t} type="secondary" size="small">
														#{t}
													</Text>
												))}
											</Space>
										</div>
									</div>
									{/* 小屏按钮只留图标:文字按钮占掉 ~170px 会把内容列挤到
									    一行放不下一张 96px 图,导致图片竖排成一列 */}
									<Space spacing={isMobile ? 0 : undefined}>
										<Button
											icon={<IconEdit />}
											size="small"
											theme="borderless"
											aria-label="编辑"
											onClick={() => openEdit(m)}
										>
											{isMobile ? null : "编辑"}
										</Button>
										<Popconfirm
											title="确认删除这条说说？"
											content="删除后立即生效，不可撤销"
											okType="danger"
											onConfirm={() => removeMutation.mutate(m.id)}
										>
											<Button
												icon={<IconDelete />}
												size="small"
												theme="borderless"
												type="danger"
												aria-label="删除"
											>
												{isMobile ? null : "删除"}
											</Button>
										</Popconfirm>
									</Space>
								</div>
							</Card>
						</List.Item>
					)}
				/>
			)}

			<Modal
				title={editor.id ? "编辑说说" : "发布说说"}
				visible={modalVisible}
				onOk={handleSubmit}
				onCancel={() => setModalVisible(false)}
				okText="保存"
				cancelText="取消"
				confirmLoading={saveMutation.isPending}
				maskClosable={false}
				{...modalProps}
			>
				<Space vertical align="start" style={{ width: "100%" }} spacing={16}>
					<div style={{ width: "100%" }}>
						<Text strong>内容</Text>
						<TextArea
							value={editor.content}
							onChange={(v: string) => setEditor((e) => ({ ...e, content: v }))}
							placeholder="记录此刻…"
							autosize={{ minRows: 3, maxRows: 8 }}
							style={{ marginTop: 4 }}
						/>
					</div>

					<div style={{ width: "100%" }}>
						<Text strong>时间</Text>
						<Input
							type="datetime-local"
							value={editor.dateLocal}
							onChange={(v) => setEditor((e) => ({ ...e, dateLocal: v }))}
							style={{ marginTop: 4 }}
						/>
					</div>

					<div style={{ width: "100%" }}>
						<Text strong>图片 URL（粘贴或上传）</Text>
						{/* 小屏输入框占满整行,添加/上传按钮换行 */}
						<Space wrap style={{ width: "100%", marginTop: 4 }}>
							<Input
								prefix={<IconImage />}
								value={imageInput}
								onChange={setImageInput}
								placeholder="粘贴图片链接后点添加"
								onEnterPress={handleAddImage}
								style={{ width: isMobile ? "100%" : 420 }}
							/>
							<Button onClick={handleAddImage}>添加</Button>
							<QiniuUpload onUploaded={addImageUrl} showUploadList={false}>
								<Button icon={<IconUpload />}>上传</Button>
							</QiniuUpload>
						</Space>
						{editor.images.length > 0 ? (
							// 缩略图套 AdminPhotoProvider 预览(与全后台统一);删除按钮留在
							// PhotoView 外层,点击语义仍是删除、不触发预览
							<AdminPhotoProvider>
								<Space wrap style={{ marginTop: 8 }}>
									{editor.images.map((src) => (
										<div key={src} style={{ position: "relative" }}>
											<PhotoView src={src}>
												<div
													style={{
														cursor: "zoom-in",
														width: 80,
														height: 80,
													}}
												>
													<Image
														src={src}
														preview={false}
														width={80}
														height={80}
														style={{
															objectFit: "cover",
															borderRadius: 6,
														}}
													/>
												</div>
											</PhotoView>
											<Button
												icon={<IconDelete />}
												size="small"
												type="danger"
												theme="solid"
												style={{
													position: "absolute",
													top: 2,
													right: 2,
													padding: 2,
												}}
												onClick={() => handleRemoveImage(src)}
												aria-label="移除图片"
											/>
										</div>
									))}
								</Space>
							</AdminPhotoProvider>
						) : null}
					</div>

					<div style={{ width: "100%" }}>
						<Text strong>标签</Text>
						<TagInput
							value={editor.tags}
							onChange={(tags) => setEditor((e) => ({ ...e, tags }))}
							placeholder="回车添加标签"
							style={{ marginTop: 4 }}
						/>
					</div>

					<Space style={{ width: "100%" }} spacing={16}>
						<div style={{ flex: 1 }}>
							<Text strong>心情 Emoji</Text>
							<Input
								value={editor.mood}
								onChange={(v) => setEditor((e) => ({ ...e, mood: v }))}
								placeholder="😊"
								style={{ marginTop: 4, width: 120 }}
							/>
						</div>
					</Space>

					<div style={{ width: "100%" }}>
						<Text strong>位置</Text>
						{/* 小屏两个输入框各占一行 */}
						<Space wrap style={{ width: "100%", marginTop: 4 }}>
							<Input
								value={editor.location}
								onChange={(v) => setEditor((e) => ({ ...e, location: v }))}
								placeholder="位置名称（可选）"
								style={{ width: isMobile ? "100%" : 260 }}
							/>
							<Input
								value={editor.locationUrl}
								onChange={(v) => setEditor((e) => ({ ...e, locationUrl: v }))}
								placeholder="位置链接（可选）"
								style={{ width: isMobile ? "100%" : 260 }}
							/>
						</Space>
					</div>

					<div style={{ width: "100%" }}>
						<Text strong>视频嵌入 URL</Text>
						<Input
							value={editor.video}
							onChange={(v) => setEditor((e) => ({ ...e, video: v }))}
							placeholder="YouTube/Bilibili 嵌入链接（可选）"
							style={{ marginTop: 4 }}
						/>
					</div>
				</Space>
			</Modal>
		</div>
	);
}
