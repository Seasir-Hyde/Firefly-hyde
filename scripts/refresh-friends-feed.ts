// 刷新友链 RSS 快照：抓取各友链站点的 feed，写入 src/data/friends-feed-snapshot.json
//
// 用法：pnpm refresh-friends-feed
//
// 说明：FRIENDS_FEED_WRITE_SNAPSHOT 必须在加载 friends-feed 模块之前设置，
// 因为 utils/friends-feed.ts 在模块顶层读取该环境变量决定是否落盘。
// ESM 的 import 会被提升，因此这里用动态 import 保证赋值先于模块求值。
process.env.FRIENDS_FEED_WRITE_SNAPSHOT = "1";

export {};

const { getEnabledFriends } = await import("../src/config/friendsConfig.ts");
const { loadFriendsFeed } = await import("../src/utils/friends-feed.ts");

const friends = getEnabledFriends();
console.log(`开始抓取 ${friends.length} 个友链的 RSS…`);

const feed = await loadFriendsFeed(friends, { cachedOnly: false });

console.log(`完成：${feed.items.length} 条动态`);
console.log(
	`  可用源 ${feed.freshSources} 个，陈旧缓存 ${feed.staleSources} 个`,
);

for (const source of feed.sources) {
	const mark = source.stale ? "（缓存）" : "";
	console.log(`  - ${source.title}: ${source.itemCount} 条${mark}`);
}
