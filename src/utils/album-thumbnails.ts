import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
	THUMBNAIL_DIRECTORY,
	VIDEO_EXTENSIONS,
	resolveLocalPhotoFiles,
} from "./album-scanner";

/**
 * 相册媒体产物生成器（Node 侧工具，dev 启动与内容仓 CI 共用同一约定）。
 *
 * 缩略图：<相册目录>/thumb/<照片名去扩展名>.webp 是该照片的展示缩略图，
 * 瀑布流与查看器在原图加载期间先显示它（见 album-scanner 的读取规则）。
 * Motion Photo：MVIMG 等 Android 动态照片的视频附加在 JPEG 尾部，
 * 依 XMP 标记定位后提取为 thumb/<照片名>.mp4 sidecar，扫描器自动配对为
 * liveVideo。两者均幂等：产物已存在的一律跳过，重复运行不会重复生成。
 *
 * 构建期不运行本模块：双仓模式下产物由内容仓 CI 生成并提交，
 * 随 content:sync 物化进主题仓；dev 启动时的生成只补齐本地缺失，
 * 下次 sync 被裁剪也无妨（CI 产物会再物化回来，或本地重新生成）。
 */

export const THUMBNAIL_WIDTH = 640;
export const THUMBNAIL_QUALITY = 80;

export interface ThumbnailLogger {
	info?: (message: string) => void;
	warn?: (message: string) => void;
}

/** 与 sharp 的链式调用兼容的最小接口（避免在类型层依赖 sharp） */
export interface SharpLike {
	(input: string | Buffer): {
		resize(options: {
			width: number;
			withoutEnlargement?: boolean;
		}): SharpChain;
	};
}

export interface SharpChain {
	webp(options?: { quality?: number }): {
		toFile(path: string): Promise<unknown>;
	};
}

export function listAlbumDirectories(
	albumRoot: string,
): Array<{ albumId: string; albumDir: string }> {
	if (!fs.existsSync(albumRoot)) return [];
	return fs
		.readdirSync(albumRoot, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => ({
			albumId: entry.name,
			albumDir: path.join(albumRoot, entry.name),
		}));
}

function hasThumbnail(albumDir: string, baseName: string): boolean {
	return (
		fs.existsSync(path.join(albumDir, THUMBNAIL_DIRECTORY, `${baseName}.webp`)) ||
		fs.existsSync(path.join(albumDir, `${baseName}.thumb.webp`))
	);
}

/**
 * 为 albumRoot 下所有本地相册补齐缺失的展示缩略图与 Motion Photo 视频。
 * 返回各自生成的数量；单项失败只告警，不中断整体。
 */
export async function generateMissingAlbumMedia(options: {
	albumRoot: string;
	sharp: SharpLike;
	log?: ThumbnailLogger;
}): Promise<{ thumbnails: number; videos: number }> {
	const { albumRoot, sharp, log } = options;
	const thumbnails = await generateMissingAlbumThumbnails({
		albumRoot,
		sharp,
		log,
	});
	const videos = await extractMissingMotionPhotoVideos({ albumRoot, log });
	return { thumbnails, videos };
}

export async function generateMissingAlbumThumbnails(options: {
	albumRoot: string;
	sharp: SharpLike;
	log?: ThumbnailLogger;
}): Promise<number> {
	const { albumRoot, sharp, log } = options;
	let generated = 0;

	for (const { albumId, albumDir } of listAlbumDirectories(albumRoot)) {
		for (const fileName of resolveLocalPhotoFiles(albumDir)) {
			const baseName = path.basename(fileName, path.extname(fileName));
			if (hasThumbnail(albumDir, baseName)) continue;

			const thumbDir = path.join(albumDir, THUMBNAIL_DIRECTORY);
			const thumbPath = path.join(thumbDir, `${baseName}.webp`);
			fs.mkdirSync(thumbDir, { recursive: true });
			try {
				await sharp(path.join(albumDir, fileName))
					.resize({ width: THUMBNAIL_WIDTH, withoutEnlargement: true })
					.webp({ quality: THUMBNAIL_QUALITY })
					.toFile(thumbPath);
				generated += 1;
				log?.info?.(`[albums] ${albumId}: generated thumb for ${fileName}`);
			} catch (error) {
				log?.warn?.(
					`[albums] ${albumId}: failed to generate thumb for ${fileName}: ${
						error instanceof Error ? error.message : String(error)
					}`,
				);
			}
		}
	}

	return generated;
}

// ------------------------------------------------------------ Motion Photo 提取
// 约定与 chronoframe 的 motion-photo.ts 一致：先按 XMP 标记判定动态照片，
// 优先用显式偏移（旧 MicroVideoOffset / 新 Container Item:Length）定位尾部视频，
// 都失败时在文件尾部扫描 MP4 ftyp box 兜底。
// 提取出的视频统一写入 thumb/ 目录（<照片名>.mp4，与展示缩略图同目录）。

const XMP_SCAN_BYTES = 512 * 1024;
const MOTION_FALLBACK_SCAN_BYTES = 8 * 1024 * 1024;
const MIN_VIDEO_SIZE_BYTES = 8 * 1024;
const MP4_FTYP = Buffer.from("ftyp");

/** sidecar 视频存放目录（与展示缩略图同目录） */
export const VIDEO_SIDECAR_DIRECTORY = THUMBNAIL_DIRECTORY;

function readXmpSegment(buffer: Buffer): string | null {
	const head = buffer.toString(
		"latin1",
		0,
		Math.min(buffer.length, XMP_SCAN_BYTES),
	);
	const start = head.indexOf("<x:xmpmeta");
	if (start === -1) return null;
	const end = head.indexOf("</x:xmpmeta>", start);
	if (end === -1) return null;
	return head.slice(start, end + "</x:xmpmeta>".length);
}

/** 动态照片标记：GCamera:MotionPhoto / MotionPhoto / (GCamera:)MicroVideo，属性或元素形式 */
function xmpIndicatesMotion(xmp: string | null): boolean {
	if (!xmp) return false;
	return /(?:[\w-]+:)?(?:MotionPhoto|MicroVideo)\s*=\s*"(?:1|true|yes)"/i.test(
		xmp,
	);
}

/** 新版 Google Container：Item:Semantic="MotionPhoto" 且 Mime="video/mp4" 的 Item:Length */
function containerVideoLength(xmp: string | null): number | null {
	if (!xmp) return null;
	for (const match of xmp.matchAll(/<[^>]*:Item\b[^>]*>/g)) {
		const tag = match[0];
		if (!/Semantic\s*=\s*"MotionPhoto"/i.test(tag)) continue;
		if (!/Mime\s*=\s*"video\/mp4"/i.test(tag)) continue;
		const length = /Length\s*=\s*"(\d+)"/i.exec(tag);
		if (length) return Number(length[1]);
	}
	return null;
}

/** 旧版 MicroVideo：视频长度 = MicroVideoOffset（从文件末尾往前计） */
function microVideoOffset(xmp: string | null): number | null {
	if (!xmp) return null;
	const match = /(?:[\w-]+:)?MicroVideoOffset\s*=\s*"(\d+)"/i.exec(xmp);
	return match ? Number(match[1]) : null;
}

function isMp4At(buffer: Buffer, start: number): boolean {
	if (start <= 0 || start >= buffer.length - MIN_VIDEO_SIZE_BYTES) return false;
	return buffer.subarray(start, start + 32).indexOf(MP4_FTYP) !== -1;
}

function hasVideoSidecar(albumDir: string, baseName: string): boolean {
	for (const ext of VIDEO_EXTENSIONS) {
		if (
			fs.existsSync(
				path.join(albumDir, VIDEO_SIDECAR_DIRECTORY, `${baseName}${ext}`),
			) ||
			fs.existsSync(path.join(albumDir, `${baseName}${ext}`))
		) {
			return true;
		}
	}
	return false;
}

/** 顶层 box 遍历（含 64 位 largesize），返回 moov box 的切片范围；找不到返回 null */
function findMoovRange(
	buffer: Buffer,
): { start: number; end: number } | null {
	let offset = 0;
	while (offset + 8 <= buffer.length) {
		let size = buffer.readUInt32BE(offset);
		const type = buffer.toString("latin1", offset + 4, offset + 8);
		let headerSize = 8;
		if (size === 1) {
			if (offset + 16 > buffer.length) return null;
			size = Number(buffer.readBigUInt64BE(offset + 8));
			headerSize = 16;
		} else if (size === 0) {
			size = buffer.length - offset;
		}
		if (size < headerSize || offset + size > buffer.length) return null;
		if (type === "moov") {
			return { start: offset, end: offset + size };
		}
		offset += size;
	}
	return null;
}

/** 视频编码：HEVC 在无硬件解码的浏览器/播放器里只有黑屏，必须转码为 H.264 */
function detectVideoCodec(buffer: Buffer): "hevc" | "h264" | "unknown" {
	const moov = findMoovRange(buffer);
	const searchIn = moov
		? buffer.subarray(moov.start, moov.end)
		: buffer.subarray(Math.max(0, buffer.length - 256 * 1024));
	if (
		searchIn.indexOf(Buffer.from("hvc1")) !== -1 ||
		searchIn.indexOf(Buffer.from("hev1")) !== -1
	) {
		return "hevc";
	}
	if (searchIn.indexOf(Buffer.from("avc1")) !== -1) return "h264";
	return "unknown";
}

let resolvedFfmpeg: string | null | undefined;

/**
 * 定位 ffmpeg：先按 PATH 探测，Windows 上再兜底扫描 winget 的安装位置——
 * winget 安装后只更新注册表 PATH，已启动的进程（如正在运行的 dev server）
 * 拿到的是旧 PATH，仅靠 PATH 探测会误报“未安装”。
 */
function resolveFfmpeg(): string | null {
	if (resolvedFfmpeg !== undefined) return resolvedFfmpeg;

	const probe = (command: string): boolean => {
		try {
			return spawnSync(command, ["-version"], { stdio: "ignore" }).status === 0;
		} catch {
			return false;
		}
	};

	if (probe("ffmpeg")) {
		resolvedFfmpeg = "ffmpeg";
		return resolvedFfmpeg;
	}

	if (process.platform === "win32") {
		const candidates: string[] = [];
		const localAppData = process.env.LOCALAPPDATA;
		if (localAppData) {
			candidates.push(
				path.join(localAppData, "Microsoft", "WinGet", "Links", "ffmpeg.exe"),
			);
			// winget portable 包：Packages/Gyan.FFmpeg_*/ffmpeg-*/bin/ffmpeg.exe
			const packagesDir = path.join(
				localAppData,
				"Microsoft",
				"WinGet",
				"Packages",
			);
			try {
				for (const entry of fs.readdirSync(packagesDir, {
					withFileTypes: true,
				})) {
					if (!entry.isDirectory() || !/^gyan\.ffmpeg/i.test(entry.name)) {
						continue;
					}
					const packageDir = path.join(packagesDir, entry.name);
					try {
						for (const sub of fs.readdirSync(packageDir, {
							withFileTypes: true,
						})) {
							if (!sub.isDirectory()) continue;
							candidates.push(
								path.join(packageDir, sub.name, "bin", "ffmpeg.exe"),
							);
						}
					} catch {
						/* 单个包目录不可读则跳过 */
					}
				}
			} catch {
				/* 无 WinGet Packages 目录 */
			}
		}
		candidates.push("C:\\ffmpeg\\bin\\ffmpeg.exe");
		for (const candidate of candidates) {
			if (fs.existsSync(candidate) && probe(candidate)) {
				resolvedFfmpeg = candidate;
				return resolvedFfmpeg;
			}
		}
	}

	resolvedFfmpeg = null;
	return resolvedFfmpeg;
}

/** HEVC → H.264（yuv420p + faststart，浏览器与本地播放器通用） */
function transcodeToH264(ffmpeg: string, input: string, output: string): boolean {
	try {
		const result = spawnSync(
			ffmpeg,
			[
				"-y",
				"-i",
				input,
				"-c:v",
				"libx264",
				"-preset",
				"veryfast",
				"-crf",
				"23",
				"-pix_fmt",
				"yuv420p",
				"-tag:v",
				"avc1",
				"-c:a",
				"aac",
				"-b:a",
				"128k",
				"-movflags",
				"+faststart",
				output,
			],
			{ stdio: "ignore" },
		);
		return (
			result.status === 0 &&
			fs.existsSync(output) &&
			fs.statSync(output).size > MIN_VIDEO_SIZE_BYTES
		);
	} catch {
		return false;
	}
}

/**
 * 从 MVIMG 等 Android Motion Photo 中提取附加视频，写成 thumb/<照片名>.mp4 sidecar。
 * HEVC 视频必须转码为 H.264 才有画面：本机有 ffmpeg 时就地转码，没有时跳过并
 * 告警（双仓模式下由内容仓 CI 完成转码），绝不产出无法播放的 sidecar。
 * iPhone Live Photo 的 .mov 侧车文件无法合成，仍需从原设备导出提交。
 */
export async function extractMissingMotionPhotoVideos(options: {
	albumRoot: string;
	log?: ThumbnailLogger;
}): Promise<number> {
	const { albumRoot, log } = options;
	let extracted = 0;

	for (const { albumId, albumDir } of listAlbumDirectories(albumRoot)) {
		for (const fileName of resolveLocalPhotoFiles(albumDir)) {
			const baseName = path.basename(fileName, path.extname(fileName));
			if (hasVideoSidecar(albumDir, baseName)) continue;

			const filePath = path.join(albumDir, fileName);
			let buffer: Buffer;
			try {
				buffer = fs.readFileSync(filePath);
			} catch (error) {
				log?.warn?.(
					`[albums] ${albumId}: cannot read ${fileName}: ${
						error instanceof Error ? error.message : String(error)
					}`,
				);
				continue;
			}

			const xmp = readXmpSegment(buffer);
			if (!xmpIndicatesMotion(xmp)) continue;

			const candidates: number[] = [];
			const containerLength = containerVideoLength(xmp);
			if (containerLength && containerLength < buffer.length) {
				candidates.push(buffer.length - containerLength);
			}
			const microOffset = microVideoOffset(xmp);
			if (microOffset && microOffset < buffer.length) {
				candidates.push(buffer.length - microOffset, microOffset);
			}

			let start = candidates.find((candidate) => isMp4At(buffer, candidate));
			if (start === undefined) {
				// 兜底：在文件尾部扫描 ftyp box（新版容器可能不写显式偏移）
				const searchStart = Math.max(
					0,
					buffer.length - MOTION_FALLBACK_SCAN_BYTES,
				);
				let cursor = buffer.indexOf(MP4_FTYP, searchStart);
				while (cursor !== -1) {
					const boxStart = cursor - 4;
					if (isMp4At(buffer, boxStart)) {
						start = boxStart;
						break;
					}
					cursor = buffer.indexOf(MP4_FTYP, cursor + 1);
				}
			}
			if (start === undefined) {
				log?.warn?.(
					`[albums] ${albumId}: ${fileName} is a motion photo but no embedded MP4 was found`,
				);
				continue;
			}

			const thumbDir = path.join(albumDir, VIDEO_SIDECAR_DIRECTORY);
			const videoPath = path.join(thumbDir, `${baseName}.mp4`);
			fs.mkdirSync(thumbDir, { recursive: true });

			const codec = detectVideoCodec(buffer.subarray(start));
			if (codec === "hevc" && !resolveFfmpeg()) {
				log?.warn?.(
					`[albums] ${albumId}: ${fileName} carries an HEVC motion video but ffmpeg was not found; install it (for example "winget install ffmpeg") and restart the dev server, or let the content repository CI transcode it`,
				);
				continue;
			}

			try {
				if (codec === "hevc") {
					// HEVC 必须转码：先落临时切片再转，失败不留半成品
					const tempPath = `${videoPath}.hevc.tmp`;
					fs.writeFileSync(tempPath, buffer.subarray(start));
					const ok = transcodeToH264(
						resolveFfmpeg() as string,
						tempPath,
						videoPath,
					);
					fs.rmSync(tempPath, { force: true });
					if (!ok) {
						fs.rmSync(videoPath, { force: true });
						log?.warn?.(
							`[albums] ${albumId}: ffmpeg failed to transcode motion video for ${fileName}`,
						);
						continue;
					}
				} else {
					fs.writeFileSync(videoPath, buffer.subarray(start));
				}
				extracted += 1;
				log?.info?.(
					`[albums] ${albumId}: extracted motion video for ${fileName} (${codec})`,
				);
			} catch (error) {
				log?.warn?.(
					`[albums] ${albumId}: failed to write motion video for ${fileName}: ${
						error instanceof Error ? error.message : String(error)
					}`,
				);
			}
		}
	}

	return extracted;
}
