// 配置中心 dirty 域列表的轻量跨组件存储
// SiteConfigPage 写入，AppLayout 侧栏二级分组读出打橙点（不引入全局状态库）

type Listener = () => void;

let dirtyDomains: string[] = [];
const listeners = new Set<Listener>();

export function setConfigDirtyDomains(domains: string[]): void {
	// 引用稳定：内容相同则不通知，避免无意义重渲染
	if (
		domains.length === dirtyDomains.length &&
		domains.every((d, i) => d === dirtyDomains[i])
	) {
		return;
	}
	dirtyDomains = domains.slice();
	for (const l of listeners) l();
}

export function getConfigDirtyDomains(): string[] {
	return dirtyDomains;
}

export function subscribeConfigDirty(listener: Listener): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}
