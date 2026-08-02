// 页面内容管理页：关于 / 留言板 / 页脚 HTML 三个 Tab
//
// 与说说/公告/一言（KV，秒级）不同，本页走 Git 通道：
//   - GET 读 CNB main 上白名单文件（push 后即刻可读）
//   - PUT 把整个文件原始内容写回并 git push，触发 CNB 流水线重建（约 3-5 分钟生效）
//
// 整文件纯文本编辑：
//   - about / guestbook：md-editor-rt 直接编辑整个 .md（含 frontmatter）
//   - footerHtml：TextArea 等宽编辑 FooterConfig.html（完整 HTML 文档）
// 保存原样写回，零格式变动风险。交互沿用资料数据页的「本地暂存 + 显式保存」。
//
// 布局一律用原生 <div>（Semi 2.83 的 <Space vertical/align> 在此环境报 TS2322，坑 18）。
import { IconRefresh, IconSave } from "@douyinfe/semi-icons";
import {
	Banner,
	Button,
	Empty,
	Popconfirm,
	Spin,
	TabPane,
	Tabs,
	TextArea,
	Toast,
	Typography,
} from "@douyinfe/semi-ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
	type SpecName,
	SPEC_REPO_PATHS,
	specApi,
} from "@/api/spec";
import { AdminMdEditor } from "@/components/AdminMdEditor";
import { BusySpin } from "@/components/BusySpin";
import { usePageShell } from "@/hooks/usePageShell";

const { Title, Text } = Typography;

// 各 Tab 中文名（commit message 用）
const SPEC_LABELS: Record<SpecName, string> = {
	about: "关于",
	guestbook: "留言板",
	footerHtml: "页脚 HTML",
};

// ---------- 通用面板：加载 → 本地编辑 → dirty → 整体保存 ----------

function SpecTabPanel({ name }: { name: SpecName }) {
	const queryClient = useQueryClient();
	const isHtml = name === "footerHtml";
	const repoPath = SPEC_REPO_PATHS[name];

	const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
		queryKey: ["spec", name],
		queryFn: () => specApi.get(name),
	});

	// 本地正文（null = 尚未从服务端初始化）
	const [content, setContent] = useState<string | null>(null);
	// 上次「与服务端一致」的快照（用于 dirty 比对）
	const [baseline, setBaseline] = useState<string>("");

	// 服务端数据到达（或 refetch 后）重新灌入本地
	useEffect(() => {
		if (data) {
			setContent(data.content);
			setBaseline(data.content);
		}
	}, [data]);

	const dirty = content !== null && content !== baseline;

	const saveMutation = useMutation({
		mutationFn: () =>
			specApi.save(
				name,
				content ?? "",
				`页面: 更新 ${SPEC_LABELS[name]}`,
			),
		onSuccess: () => {
			Toast.success("已提交，构建约 3-5 分钟后生效");
			if (content !== null) setBaseline(content);
			queryClient.invalidateQueries({ queryKey: ["builds"] });
		},
		onError: (err: Error) => Toast.error(err.message || "保存失败"),
	});

	const resetLocal = () => {
		if (data) {
			setContent(data.content);
			setBaseline(data.content);
			Toast.info("已放弃本地修改");
		}
	};

	if (isError) {
		return (
			<Empty
				image={<div style={{ fontSize: 48 }}>⚠️</div>}
				title="读取失败"
				description={(error as Error)?.message || "请检查 CNB 通道或稍后重试"}
			>
				<Button onClick={() => refetch()}>重试</Button>
			</Empty>
		);
	}

	if (isLoading || content === null) {
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
				<span style={{ color: "var(--semi-color-text-2)" }}>加载内容中…</span>
			</div>
		);
	}

	return (
		<BusySpin spinning={saveMutation.isPending}>
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
					{/* 用完整仓库路径显示（后端 file 仅 basename，footerHtml 不在 spec/ 下） */}
					<Text type="tertiary">文件：{repoPath}</Text>
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
							content="将丢弃未保存的编辑，恢复到服务端当前内容"
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
						保存到仓库
					</Button>
				</div>
			</div>

			{/* dirty 提示 */}
			{dirty ? (
				<Banner
					type="warning"
					description="本地有未保存的修改。点击「保存到仓库」写回并触发构建（约 3-5 分钟生效）。"
					style={{ marginBottom: 12 }}
					closeIcon={null}
				/>
			) : null}

			{/* 整文件编辑器：md 用 AdminMdEditor；HTML 用等宽 TextArea */}
			{isHtml ? (
				<TextArea
					value={content}
					onChange={setContent}
					autosize={{ minRows: 18, maxRows: 40 }}
					style={{
						fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
						fontSize: 13,
					}}
				/>
			) : (
				<AdminMdEditor
					value={content}
					onChange={setContent}
					desktopHeight={560}
				/>
			)}
		</div>
		</BusySpin>
	);
}

// ============================================================
// 页面：3 个 Tab
// ============================================================

export function PagesPage() {
	const [active, setActive] = useState<SpecName>("about");
	const { pageStyle, stickyStyle } = usePageShell();

	return (
		<div style={pageStyle}>
			{/* 吸顶区:只吸标题+副标题(Tab 头跟内容滚,Semi Tabs 内部 DOM 不能单独 sticky) */}
			<div style={stickyStyle}>
				<Title heading={3} style={{ margin: "0 0 4px" }}>
					页面内容
				</Title>
				<Text type="tertiary" style={{ display: "block" }}>
					关于 / 留言板 / 页脚 HTML 走 Git 通道：整文件编辑，保存后写回仓库并触发构建，约
					3-5 分钟生效。
				</Text>
			</div>

			<Tabs
				className="admin-scroll-tabs"
				type="line"
				activeKey={active}
				onChange={(k) => setActive(k as SpecName)}
				lazyRender
				keepDOM={false}
			>
				<TabPane tab="关于" itemKey="about">
					<SpecTabPanel name="about" />
				</TabPane>
				<TabPane tab="留言板" itemKey="guestbook">
					<SpecTabPanel name="guestbook" />
				</TabPane>
				<TabPane tab="页脚 HTML" itemKey="footerHtml">
					<SpecTabPanel name="footerHtml" />
				</TabPane>
			</Tabs>
		</div>
	);
}
