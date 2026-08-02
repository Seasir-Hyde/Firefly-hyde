// 七牛云浏览器直传工具：封面 Upload 与 Markdown 编辑器 onUploadImg 共用
// 流程：按配置本地转码 → 后端签发 token/key → XHR FormData 直传七牛 → 返回 publicUrl
// 不经过 EdgeOne 函数体，避免请求体/时长限制；XHR 可拿上传进度
import { Toast } from "@douyinfe/semi-ui";
import {
	type ConvertFormat,
	type ImageHostingConfig,
	imageHostingApi,
} from "@/api/imageHosting";

// 可本地转码的源类型:GIF 跳过(canvas 只取首帧会丢动画)、SVG 跳过(栅格化丢矢量)
const CONVERTIBLE_TYPES = /^image\/(jpeg|png|webp|avif|bmp)$/;

// 转码质量(webp/avif 有损压缩系数,0.85 在体积与画质间平衡)
const CONVERT_QUALITY = 0.85;

/**
 * 浏览器本地把图片转码为目标格式。
 * 返回 null 表示不转(类型不适用/已是目标格式/浏览器不支持该编码/转码失败),调用方回退原图。
 * createImageBitmap 默认尊重 EXIF 方向,转出的图方向正确。
 */
async function convertToFormat(
	file: File,
	format: ConvertFormat,
): Promise<{ blob: Blob; name: string } | null> {
	const targetMime = `image/${format}`;
	if (!CONVERTIBLE_TYPES.test(file.type) || file.type === targetMime) {
		return null;
	}
	try {
		const bitmap = await createImageBitmap(file);
		const canvas = document.createElement("canvas");
		canvas.width = bitmap.width;
		canvas.height = bitmap.height;
		const ctx = canvas.getContext("2d");
		if (!ctx) return null;
		ctx.drawImage(bitmap, 0, 0);
		bitmap.close();
		const blob = await new Promise<Blob | null>((resolve) => {
			canvas.toBlob(resolve, targetMime, CONVERT_QUALITY);
		});
		// toBlob 对不支持的格式会静默回退产出 png:产物 type 不等于目标 = 浏览器不支持该编码
		if (!blob || blob.type !== targetMime) {
			Toast.warning(
				`当前浏览器不支持 ${format.toUpperCase()} 编码，已按原格式上传`,
			);
			return null;
		}
		const name = `${file.name.replace(/\.[^.]+$/, "")}.${format}`;
		return { blob, name };
	} catch {
		Toast.warning("图片转码失败，已按原格式上传");
		return null;
	}
}

export interface QiniuDirectUploadOptions {
	/** 图床配置；不传则内部拉一次 /api/image/config */
	config?: ImageHostingConfig | null;
	/** 直传进度（0–100）；Semi Upload 的 onProgress 另有 total/loaded 形态 */
	onProgress?: (percent: number) => void;
}

export interface QiniuDirectUploadResult {
	url: string;
	key: string;
}

/**
 * 单文件直传七牛。失败抛 Error（message 已是用户可读中文）。
 * 调用方负责遮罩/计数；本函数不弹成功 Toast，失败会 Toast 再 throw。
 */
export async function uploadFileToQiniu(
	file: File,
	options: QiniuDirectUploadOptions = {},
): Promise<QiniuDirectUploadResult> {
	const config = options.config ?? (await imageHostingApi.getConfig());
	if (config.enabled !== true) {
		const msg = "图床未启用：请先在「图床配置」中填写并启用";
		Toast.error(msg);
		throw new Error(msg);
	}

	const maxBytes = (config.maxSizeMB ?? 10) * 1024 * 1024;
	if (file.size > maxBytes) {
		const msg = `图片超过大小上限 ${config.maxSizeMB ?? 10}MB`;
		Toast.error(msg);
		throw new Error(msg);
	}

	// 0. 按配置本地转码(失败/不适用回退原图);用转码后的文件名签发凭证,
	//    后端 buildKey 从文件名取扩展名,key 自然带 .webp/.avif
	let uploadBlob: Blob = file;
	let uploadName = file.name || "image.png";
	if (config.convertEnabled === true) {
		const converted = await convertToFormat(
			file,
			config.convertFormat ?? "webp",
		);
		if (converted) {
			uploadBlob = converted.blob;
			uploadName = converted.name;
		}
	}

	// 1. 签发凭证：key/publicUrl 均由后端生成，前端不能自定路径（防越权写）
	let tokenResult: Awaited<ReturnType<typeof imageHostingApi.createToken>>;
	try {
		tokenResult = await imageHostingApi.createToken(uploadName);
	} catch (e) {
		const msg = e instanceof Error ? e.message : "获取上传凭证失败";
		Toast.error(msg || "获取上传凭证失败");
		throw new Error(msg || "获取上传凭证失败");
	}

	// 2. XHR 直传七牛（包成 Promise，等 onload/onerror 再结束）
	await new Promise<void>((resolve, reject) => {
		const form = new FormData();
		form.append("key", tokenResult.key);
		form.append("token", tokenResult.token);
		form.append("file", uploadBlob, uploadName);
		const xhr = new XMLHttpRequest();
		xhr.open("POST", tokenResult.uploadHost);
		xhr.upload.onprogress = (e) => {
			if (e.lengthComputable && options.onProgress) {
				options.onProgress(Math.round((e.loaded / e.total) * 100));
			}
		};
		xhr.onload = () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				resolve();
				return;
			}
			// 七牛错误响应体形如 {"error":"..."}，透出给用户
			let msg = `七牛返回 ${xhr.status}`;
			try {
				msg =
					(JSON.parse(xhr.responseText) as { error?: string }).error || msg;
			} catch {
				// 非 JSON 响应保留状态码提示
			}
			Toast.error(`上传失败：${msg}`);
			reject(new Error(msg));
		};
		xhr.onerror = () => {
			const msg = "上传失败：网络错误或跨域被拦截";
			Toast.error(msg);
			reject(new Error(msg));
		};
		xhr.send(form);
	});

	return { url: tokenResult.publicUrl, key: tokenResult.key };
}

/**
 * 多文件顺序直传；单张失败不中断其余。
 * 返回成功项列表（可能为空）。
 */
export async function uploadFilesToQiniu(
	files: File[],
	options: QiniuDirectUploadOptions = {},
): Promise<QiniuDirectUploadResult[]> {
	// 配置只拉一次，多文件复用
	const config = options.config ?? (await imageHostingApi.getConfig());
	const results: QiniuDirectUploadResult[] = [];
	for (const file of files) {
		try {
			const r = await uploadFileToQiniu(file, { ...options, config });
			results.push(r);
		} catch {
			// 单张失败已 Toast，继续下一张
		}
	}
	return results;
}
