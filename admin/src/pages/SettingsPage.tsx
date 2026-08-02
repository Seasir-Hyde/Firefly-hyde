// 系统设置页：Tabs 分组的可配置项集合，图床（七牛云）为第一个 Tab
// 配置走 Edge Functions + KV（路径 A），保存后秒级生效（无需 git 构建）
// 未来其他系统级可配项（站点参数等）都归入此页新增 Tab
import { IconDelete, IconRefresh } from "@douyinfe/semi-icons";
import {
	Banner,
	Button,
	Empty,
	Form,
	Image,
	Popconfirm,
	Radio,
	RadioGroup,
	Spin,
	TabPane,
	Tabs,
	Toast,
	Typography,
} from "@douyinfe/semi-ui";
import type { InfiniteData } from "@tanstack/react-query";
import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
// 现代图片预览:手指捏合/双击/滑动切换/滚轮缩放(Semi ImagePreview 无触摸手势,站长拍板引入);
// AdminPhotoProvider 在其上增强下载/复制链接/切换箭头/底部缩略图条
import { PhotoView } from "react-photo-view";
import {
	CONVERT_FORMAT_OPTIONS,
	type ImageHostingConfig,
	type ImageListResult,
	imageHostingApi,
	REGION_OPTIONS,
} from "@/api/imageHosting";
import { type SiteFlags, flagsApi } from "@/api/flags";
import { AdminPhotoProvider } from "@/components/AdminPhotoProvider";
import { QiniuUpload } from "@/components/QiniuUpload";
import { usePageShell } from "@/hooks/usePageShell";

const { Title, Text } = Typography;

// 图床配置 Tab：读配置回显 → Semi Form 编辑 → PUT 保存
function ImageHostingTab() {
	const queryClient = useQueryClient();
	// 域名协议告警：博客是 HTTPS，HTTP 图片 URL 会被浏览器混合内容拦截
	const [httpWarning, setHttpWarning] = useState(false);
	// 「上传时转换格式」开关的实时值:控制格式下拉框显隐
	const [convertOn, setConvertOn] = useState(false);

	const { data, isLoading, isError, error, refetch } = useQuery({
		queryKey: ["image-hosting-config"],
		queryFn: () => imageHostingApi.getConfig(),
	});

	// 配置到达(或 refetch)后同步开关显隐(useState 初值拿不到异步 data)
	useEffect(() => {
		if (data) setConvertOn(data.convertEnabled === true);
	}, [data]);

	const saveMutation = useMutation({
		mutationFn: (values: ImageHostingConfig) =>
			imageHostingApi.saveConfig(values),
		onSuccess: (res) => {
			Toast.success("图床配置已保存，秒级生效");
			// PUT 返回后端规整过的配置（trim、去尾斜杠等），直接写回缓存保证回显一致
			queryClient.setQueryData(["image-hosting-config"], res.config);
		},
		onError: (err: Error) => Toast.error(err.message || "保存失败"),
	});

	// Form 泛型为 ImageHostingConfig，onValueChange 回调签名须与之一致
	const handleValueChange = useCallback((values: ImageHostingConfig) => {
		const domain =
			typeof values.domain === "string" ? values.domain.trim() : "";
		setHttpWarning(domain !== "" && domain.startsWith("http://"));
		setConvertOn(values.convertEnabled === true);
	}, []);

	if (isLoading) {
		// Spin 的 tip 仅在作为包裹元素(有 children)时才有正常布局,
		// 单独用会文字竖排(坑 36),故改 Spin + 独立文字纵向居中
		return (
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					gap: 12,
					padding: "48px 0",
				}}
			>
				<Spin size="large" />
				<span style={{ color: "var(--semi-color-text-2)" }}>
					正在读取图床配置…
				</span>
			</div>
		);
	}

	if (isError) {
		return (
			<Empty
				image={<div style={{ fontSize: 48 }}>⚠️</div>}
				title="读取图床配置失败"
				description={(error as Error)?.message || "请检查 KV 绑定或稍后重试"}
			>
				<Button onClick={() => refetch()}>重试</Button>
			</Empty>
		);
	}

	return (
		<div style={{ maxWidth: 560 }}>
			<Text type="tertiary">
				密钥（AccessKey / SecretKey）不在此配置，只存于 EdgeOne 环境变量
				QINIU_ACCESS_KEY / QINIU_SECRET_KEY，变更密钥需在控制台修改后重新部署。
			</Text>

			{httpWarning && (
				<Banner
					type="warning"
					description="访问域名使用了 http://，博客站点是 HTTPS，HTTP 图片会被浏览器当作混合内容拦截，强烈建议改用 https://"
					style={{ marginTop: 12 }}
				/>
			)}

			{/* initValues 只在挂载时消费一次，故必须等配置加载完成后再渲染 Form（上方 isLoading 已保证） */}
			<Form<ImageHostingConfig>
				initValues={data}
				onSubmit={(values) => saveMutation.mutate(values as ImageHostingConfig)}
				onValueChange={handleValueChange}
				disabled={saveMutation.isPending}
			>
				<Form.Switch
					field="enabled"
					label="启用图床"
					extraText="未配全空间名和访问域名前无法启用；关闭后上传入口置灰，已有图片 URL 不受影响"
				/>
				<Form.Input
					field="bucket"
					label="空间名（bucket）"
					placeholder="七牛控制台的存储空间名称"
					showClear
				/>
				<Form.Input
					field="domain"
					label="访问域名"
					placeholder="https://qiniuyun.cchaoka.cn"
					extraText="空间绑定的 CDN 加速域名，含协议；上传成功后用它拼图片 URL"
					showClear
					rules={[
						{
							validator: (_rule, value: string) =>
								!value || /^https?:\/\//.test(value.trim()),
							message: "域名必须以 http:// 或 https:// 开头",
						},
					]}
				/>
				<Form.Select
					field="region"
					label="存储区域"
					optionList={REGION_OPTIONS}
					style={{ width: 240 }}
				/>
				<Form.Input
					field="prefix"
					label="存储前缀"
					placeholder="blog-img/"
					extraText="上传的图片 key 统一加此前缀，留空 = 空间根目录"
					showClear
				/>
				<Form.InputNumber
					field="maxSizeMB"
					label="上传大小上限（MB）"
					min={1}
					max={100}
					precision={0}
					style={{ width: 240 }}
				/>
				<Form.Switch
					field="convertEnabled"
					label="上传时转换格式"
					extraText="开启后上传前在浏览器本地转码为所选格式再上传，节省空间与流量；GIF/SVG 自动跳过（保动画/矢量）；浏览器不支持所选编码时自动回退原图"
				/>
				{convertOn && (
					<Form.Select
						field="convertFormat"
						label="转换目标格式"
						optionList={CONVERT_FORMAT_OPTIONS}
						style={{ width: 300 }}
					/>
				)}
				<div style={{ marginTop: 24 }}>
					<Button
						htmlType="submit"
						theme="solid"
						type="primary"
						loading={saveMutation.isPending}
					>
						保存配置
					</Button>
				</div>
			</Form>
		</div>
	);
}

// 动态数据快照开关 Tab：读开关回显 → Semi Form 编辑 → PUT 保存（KV 秒级生效）
function SiteFlagsTab() {
	const queryClient = useQueryClient();

	const { data, isLoading, isError, error, refetch } = useQuery({
		queryKey: ["site-flags"],
		queryFn: () => flagsApi.get(),
	});

	const saveMutation = useMutation({
		mutationFn: (values: SiteFlags) => flagsApi.save(values),
		onSuccess: (res) => {
			Toast.success("开关已保存，秒级生效");
			// PUT 返回后端规整过的开关，直接写回缓存保证回显一致
			queryClient.setQueryData(["site-flags"], res.config);
		},
		onError: (err: Error) => Toast.error(err.message || "保存失败"),
	});

	if (isLoading) {
		// Spin 单独用会文字竖排（坑 36），故 Spin + 独立文字纵向居中
		return (
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					gap: 12,
					padding: "48px 0",
				}}
			>
				<Spin size="large" />
				<span style={{ color: "var(--semi-color-text-2)" }}>
					正在读取开关配置…
				</span>
			</div>
		);
	}

	if (isError) {
		return (
			<Empty
				image={<div style={{ fontSize: 48 }}>⚠️</div>}
				title="读取开关配置失败"
				description={(error as Error)?.message || "请检查 KV 绑定或稍后重试"}
			>
				<Button onClick={() => refetch()}>重试</Button>
			</Empty>
		);
	}

	return (
		<div style={{ maxWidth: 560 }}>
			<Banner
				type="info"
				description="说说 / 公告 / 友链 / 设备 4 类动态数据采用「构建期快照 + 运行时 fetch 覆盖」模式。开启此开关后，这 4 类首屏不再使用构建期快照、仅靠运行时拉取（秒级新鲜、消除快照与实时不一致的闪烁，代价是这部分内容失去 SEO 索引）。关闭则保持现状。"
				style={{ marginBottom: 16 }}
			/>

			{/* initValues 只在挂载时消费一次，故必须等配置加载完成后再渲染 Form（上方 isLoading 已保证） */}
			<Form<SiteFlags>
				initValues={data}
				onSubmit={(values) =>
					saveMutation.mutate(values as SiteFlags)
				}
				disabled={saveMutation.isPending}
			>
				<Form.Switch
					field="snapshotDisabled"
					label="禁用动态数据快照"
					extraText="开启：4 类动态数据首屏空态 + 运行时 fetch 填充（消除闪烁，无 SEO）；关闭：快照 + 运行时覆盖（现状）。一言按日期种子静态化，不受此开关影响"
				/>
				<div style={{ marginTop: 24 }}>
					<Button
						htmlType="submit"
						theme="solid"
						type="primary"
						loading={saveMutation.isPending}
					>
						保存开关
					</Button>
				</div>
			</Form>
		</div>
	);
}

// 字节数 → 人类可读（列表卡片展示用）
function formatSize(bytes: number): string {
	if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
	if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${bytes} B`;
}

// 图片管理 Tab：直传上传区 + 已上传网格（scope 切换 + marker 分页 + 删除）
function ImageManageTab() {
	const queryClient = useQueryClient();
	const { isMobile } = usePageShell();
	const { data: config } = useQuery({
		queryKey: ["image-hosting-config"],
		queryFn: () => imageHostingApi.getConfig(),
	});
	// 列表范围：只看配置前缀下 / 整个空间（方案第二章「列表范围前端可切换」）
	const [scope, setScope] = useState<"prefix" | "all">("prefix");
	// 本次会话的上传记录（仅内存，刷新即清；持久列表在下方网格）
	const [uploaded, setUploaded] = useState<{ url: string; key: string }[]>([]);

	const listQuery = useInfiniteQuery({
		queryKey: ["image-list", scope],
		queryFn: ({ pageParam }) => imageHostingApi.list(scope, pageParam),
		initialPageParam: "",
		getNextPageParam: (last) => (last.hasMore ? last.marker : undefined),
		// 空间名配置好前不发请求（bucket 为空时后端会 400）
		enabled: Boolean(config?.bucket),
	});

	const removeMutation = useMutation({
		mutationFn: (key: string) => imageHostingApi.remove(key),
		onSuccess: (_res, key) => {
			Toast.success("已删除");
			// 从两个 scope 的缓存里同时剔除（避免切换 scope 后看到已删图）
			queryClient.setQueriesData<InfiniteData<ImageListResult>>(
				{ queryKey: ["image-list"] },
				(old) =>
					old && {
						...old,
						pages: old.pages.map((p) => ({
							...p,
							items: p.items.filter((i) => i.key !== key),
						})),
					},
			);
			setUploaded((list) => list.filter((u) => u.key !== key));
		},
		onError: (err: Error) => Toast.error(err.message || "删除失败"),
	});

	const handleUploaded = useCallback(
		(url: string, key: string) => {
			setUploaded((list) => [{ url, key }, ...list]);
			// 新图进列表：失效列表缓存重拉（七牛 list 偶有秒级延迟，没出现点刷新即可）
			queryClient.invalidateQueries({ queryKey: ["image-list"] });
			// 自动复制到剪贴板；权限被拒时静默（下方列表有复制按钮兜底）
			navigator.clipboard?.writeText(url).then(
				() => Toast.success("上传成功，URL 已复制到剪贴板"),
				() => Toast.success("上传成功"),
			);
		},
		[queryClient],
	);

	// 「整个空间」scope 会列出桶里所有文件,只保留图片:
	// mimeType 前缀判断为主,key 扩展名兜底(个别工具上传的图 mimeType 可能是 octet-stream)
	const images = (listQuery.data?.pages.flatMap((p) => p.items) ?? []).filter(
		(i) =>
			i.mimeType?.startsWith("image/") ||
			/\.(jpe?g|png|webp|avif|gif|svg|bmp|ico)$/i.test(i.key),
	);

	return (
		<div style={{ maxWidth: 960 }}>
			{config && config.enabled !== true && (
				<Banner
					type="info"
					description="图床未启用：请先在「图床配置」Tab 填写空间信息并启用，再回来上传。"
					style={{ marginBottom: 16 }}
				/>
			)}

			<QiniuUpload draggable onUploaded={handleUploaded} />

			{uploaded.length > 0 && (
				<div style={{ marginTop: 16 }}>
					<Text strong>
						本次上传 {uploaded.length} 张（点击 URL 右侧图标复制）
					</Text>
					{uploaded.map((u) => (
						<div
							key={u.key}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 12,
								marginTop: 8,
							}}
						>
							<img
								src={u.url}
								alt={u.key}
								style={{
									width: 40,
									height: 40,
									objectFit: "cover",
									borderRadius: 4,
									flexShrink: 0,
								}}
							/>
							<Text copyable style={{ wordBreak: "break-all" }}>
								{u.url}
							</Text>
						</div>
					))}
				</div>
			)}

			{/* 已上传列表：标题行 + scope 切换 + 刷新(小屏可换行,桌面放得下不触发) */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					flexWrap: "wrap",
					gap: 8,
					marginTop: 32,
					marginBottom: 12,
				}}
			>
				<Text strong style={{ fontSize: 16 }}>
					已上传图片
				</Text>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						flexWrap: "wrap",
						gap: 12,
					}}
				>
					<RadioGroup
						type="button"
						value={scope}
						onChange={(e) => setScope(e.target.value as "prefix" | "all")}
					>
						<Radio value="prefix">只看前缀 {config?.prefix || "（空）"}</Radio>
						<Radio value="all">整个空间</Radio>
					</RadioGroup>
					<Button
						icon={<IconRefresh />}
						loading={listQuery.isRefetching}
						onClick={() => listQuery.refetch()}
						aria-label="刷新列表"
					/>
				</div>
			</div>

			{!config?.bucket ? (
				<Empty
					title="尚未配置空间"
					description="先在「图床配置」Tab 填写空间名，这里才能列出图片"
				/>
			) : listQuery.isLoading ? (
				<div style={{ padding: "32px 0", textAlign: "center" }}>
					<Spin size="large" />
				</div>
			) : listQuery.isError ? (
				<Empty
					image={<div style={{ fontSize: 48 }}>⚠️</div>}
					title="读取图片列表失败"
					description={(listQuery.error as Error)?.message || "请稍后重试"}
				>
					<Button onClick={() => listQuery.refetch()}>重试</Button>
				</Empty>
			) : images.length === 0 ? (
				<Empty title="还没有图片" description="从上方上传第一张图" />
			) : (
				<>
					{/* 小屏 grid 强制两列(flex+百分比宽会被图片自然宽撑破);桌面保持 148 固定宽流式。
					    AdminPhotoProvider 分组:点任意图进入预览后可切换整组 */}
					<AdminPhotoProvider>
						<div
							style={
								isMobile
									? {
											display: "grid",
											gridTemplateColumns: "repeat(2, 1fr)",
											gap: 12,
										}
									: { display: "flex", flexWrap: "wrap", gap: 12 }
							}
						>
							{images.map((img) => (
								<div
									key={img.key}
									style={{
										width: isMobile ? undefined : 148,
										minWidth: 0,
										border: "1px solid var(--semi-color-border)",
										borderRadius: 6,
										overflow: "hidden",
									}}
								>
									{/* PhotoView 的 trigger 用原生 div(可收 ref/onClick,打开动画从缩略图起);
									    Semi Image 关掉内置预览只作展示。其 width/height prop 是 <img> 的
									    HTML 属性,不认 "100%",小屏尺寸必须走 CSS(style/imgStyle) */}
									<PhotoView src={img.url}>
										<div style={{ cursor: "zoom-in" }}>
											<Image
												src={img.url}
												preview={false}
												width={isMobile ? undefined : 146}
												height={100}
												style={isMobile ? { width: "100%" } : undefined}
												imgStyle={
													isMobile
														? { width: "100%", height: 100, objectFit: "cover" }
														: { objectFit: "cover" }
												}
												alt={img.key}
											/>
										</div>
									</PhotoView>
									<div style={{ padding: "6px 8px" }}>
										<Text
											type="tertiary"
											size="small"
											ellipsis={{ showTooltip: true }}
											style={{
												display: "block",
												maxWidth: isMobile ? "100%" : 130,
											}}
										>
											{img.key}
										</Text>
										<Text type="tertiary" size="small">
											{formatSize(img.fsize)} ·{" "}
											{new Date(img.putTimeMs).toLocaleDateString("zh-CN")}
										</Text>
										<div
											style={{
												display: "flex",
												alignItems: "center",
												justifyContent: "space-between",
												marginTop: 4,
											}}
										>
											<Text copyable={{ content: img.url }} size="small">
												复制 URL
											</Text>
											<Popconfirm
												title="确认删除这张图片？"
												content="删除后所有引用此图的地方（文章/说说/资料等）都会图裂，不可恢复！CDN 缓存可能让它短时间内仍可访问。"
												okType="danger"
												okText="删除"
												cancelText="取消"
												onConfirm={() => removeMutation.mutate(img.key)}
											>
												<Button
													icon={<IconDelete />}
													size="small"
													theme="borderless"
													type="danger"
													aria-label={`删除 ${img.key}`}
												/>
											</Popconfirm>
										</div>
									</div>
								</div>
							))}
						</div>
					</AdminPhotoProvider>
					{listQuery.hasNextPage && (
						<div style={{ marginTop: 16, textAlign: "center" }}>
							<Button
								loading={listQuery.isFetchingNextPage}
								onClick={() => listQuery.fetchNextPage()}
							>
								加载更多
							</Button>
						</div>
					)}
				</>
			)}
		</div>
	);
}

export function SettingsPage() {
	const { pageStyle, stickyStyle } = usePageShell();

	return (
		<div style={pageStyle}>
			{/* 吸顶区:标题行 sticky(与其他管理页保持一致) */}
			<div style={stickyStyle}>
				<Title heading={3} style={{ margin: 0 }}>
					系统设置
				</Title>
			</div>

			<Tabs className="admin-scroll-tabs" type="line" defaultActiveKey="image-hosting">
				<TabPane tab="图床配置" itemKey="image-hosting">
					<div style={{ paddingTop: 16 }}>
						<ImageHostingTab />
					</div>
				</TabPane>
				<TabPane tab="图片管理" itemKey="image-manage">
					<div style={{ paddingTop: 16 }}>
						<ImageManageTab />
					</div>
				</TabPane>
				<TabPane tab="动态数据快照" itemKey="site-flags">
					<div style={{ paddingTop: 16 }}>
						<SiteFlagsTab />
					</div>
				</TabPane>
			</Tabs>
		</div>
	);
}
