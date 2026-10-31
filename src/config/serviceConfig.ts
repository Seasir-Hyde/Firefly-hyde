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
};
