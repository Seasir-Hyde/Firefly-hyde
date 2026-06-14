export interface MusicItem {
    title: string;
    artist: string;
    cover: string;
    url: string;
    lrc?: string;
    duration?: string;
}

/**
 * 此时歌曲数据源于 Meting API 自动生成的 './music.json' 以及配置中的自定义歌单.
 * 运行 `pnpm prefetch:music` 即可自动更新 Meting 歌单数据及自定义音乐时长。
 */
import musicData from './music.json';

const raw: any = musicData;
const musicList: MusicItem[] = Array.isArray(raw) ? raw : (raw.songs || []);

export { musicList };

export const playlistCounts: Record<string, number> = Array.isArray(raw) ? {} : (raw.playlistCounts || {});

export const playlistSongs: Record<string, MusicItem[]> = Array.isArray(raw) ? {} : (raw.playlistSongs || {});
