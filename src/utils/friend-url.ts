/**
 * 友链 URL 归一化：只保留主机名（保留端口），用于跨数据源对齐键。
 *
 * 之前各处（快照写入、页面查表、内联脚本）用的是「去协议/www/末尾斜杠」的写法，
 * 会保留路径：同一个站点在本地配置（https://x.com/）与远程接口（https://x.com/blog）
 * 下会算出两个不同的键，查表落空后被误判成「未探测」。
 * 友链是站点级引用，按主机名对齐才是正确口径。
 */
export const normalizeFriendUrl = (value: string): string => {
	const raw = (value ?? "").trim();
	if (!raw) return "";
	try {
		const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
		const host = url.hostname.toLowerCase().replace(/^www\./u, "");
		return url.port ? `${host}:${url.port}` : host;
	} catch {
		// URL 解析失败时退回字符串清洗，至少保证同一个输入得到同一个键
		return raw
			.replace(/^https?:\/\//iu, "")
			.replace(/^www\./iu, "")
			.replace(/\/.*$/u, "")
			.toLowerCase();
	}
};
