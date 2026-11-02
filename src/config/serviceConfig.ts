/**
 * 友链可见性服务配置
 *
 * friendVisibilityUrl：远端友链可见性状态接口（可选）。
 * 期望返回格式：
 * {
 *   "visibility": [
 *     {
 *       "siteurl": "https://example.com/",
 *       "status": "normal" | "temporarily_unavailable" | "policy_violation",
 *       "violationStartedAt": 1730000000,
 *       "unavailableStartedAt": 1730000000
 *     }
 *   ]
 * }
 *
 * 留空表示纯静态站点，友链状态完全由 src/config/friendsConfig.ts 决定。
 */
export const serviceConfig = {
	friendVisibilityUrl: "",

	/**
	 * visitorLocationUrl：访客 IP 归属地查询接口（可选）。
	 * 期望返回格式：
	 * { "code": 200, "data": { "address": "中国广东省" } }
	 * 组件会依次尝试 data.data.address / data.location / data.city / data.address，
	 * 解析失败则回退到默认欢迎语。
	 *
	 * 留空表示不请求第三方接口，欢迎提示只显示默认文案。
	 */
	visitorLocationUrl: "https://v2.xxapi.cn/api/ip",
};
