import fs from "node:fs";
import path from "node:path";
import type {
	AlbumGroup,
	AlbumIndexItem,
	AlbumLayout,
	AlbumPhoto,
} from "@/types/album";

const ALBUM_ROOT = path.resolve(process.cwd(), "public/images/albums");
const IMAGE_EXTENSIONS = new Set([
	".jpg",
	".jpeg",
	".png",
	".gif",
	".webp",
	".svg",
	".avif",
	".bmp",
	".tiff",
	".tif",
]);

/** Live Photo 配对视频的 sidecar 扩展名 */
export const VIDEO_EXTENSIONS = new Set([".mov", ".mp4", ".webm", ".m4v"]);

/** 展示缩略图目录：`<相册目录>/thumb/<照片名去扩展名>.webp`（dev/CI 自动生成） */
export const THUMBNAIL_DIRECTORY = "thumb";

const DEFAULT_DATE = new Intl.DateTimeFormat("en-CA").format(new Date());

type RawPhoto = Record<string, unknown>;
type RawAlbum = Record<string, unknown>;

function stringValue(value: unknown, fallback = ""): string {
	return typeof value === "string" ? value.trim() : fallback;
}

function stringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value
				.filter((item): item is string => typeof item === "string")
				.map((item) => item.trim())
				.filter(Boolean)
		: [];
}

function numberValue(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? value
		: undefined;
}

function dateValue(value: unknown, fallback = DEFAULT_DATE): string {
	const date = stringValue(value, fallback);
	return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : fallback;
}

function layoutValue(value: unknown): AlbumLayout {
	return value === "grid" ? "grid" : "masonry";
}

function columnsValue(value: unknown): 2 | 3 | 4 {
	const columns = typeof value === "number" ? Math.round(value) : 3;
	return columns <= 2 ? 2 : columns >= 4 ? 4 : 3;
}

function toPublicPath(relativePath: string): string {
	return `/images/albums/${relativePath.replaceAll(path.sep, "/")}`;
}

/** 文件名首个 `_` 之后的段解析为照片标签（如 `sunset_beach.webp` → ["beach"]） */
function parseFileNameTags(fileName: string): string[] {
	const baseName = path.basename(fileName, path.extname(fileName));
	const [, ...tags] = baseName.split("_");
	return tags.filter(Boolean);
}

function readJson(filePath: string): RawAlbum | null {
	try {
		const parsed: unknown = JSON.parse(fs.readFileSync(filePath, "utf8"));
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as RawAlbum)
			: null;
	} catch {
		return null;
	}
}

/**
 * 无 info.json 的目录相册：直接读取目录内图片，零配置即可展示。
 * 标题用目录名，封面回退第一张照片，日期取最新一张照片的文件日期。
 */
function directoryAlbum(id: string, albumDir: string): AlbumGroup | null {
	const photos = localPhotos(id, albumDir);
	if (!photos.length) return null;
	const date = photos.reduce(
		(latest, photo) => (photo.date && photo.date > latest ? photo.date : latest),
		DEFAULT_DATE,
	);
	return {
		id,
		title: id,
		description: "",
		cover: photos[0]?.src ?? "",
		date,
		location: "",
		tags: [],
		layout: "masonry",
		columns: 3,
		hidden: false,
		photos,
	};
}

function fileDate(filePath: string): string {
	try {
		return dateValue(fs.statSync(filePath).mtime.toISOString().slice(0, 10));
	} catch {
		return DEFAULT_DATE;
	}
}

/** 列出相册目录内的照片文件（应用 cover/缩略图/Live Photo 过滤与数字感知排序） */
export function resolveLocalPhotoFiles(albumDir: string): string[] {	const files = fs
		.readdirSync(albumDir, { withFileTypes: true })
		.filter(
			(entry) =>
				entry.isFile() &&
				IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()),
		)
		.map((entry) => entry.name)
		// .thumb.webp 是展示用缩略图 sidecar，不作为照片本身
		.filter((name) => !/\.thumb\.webp$/i.test(name))
		.filter((name) => !/^cover\.(?:webp|jpg)$/i.test(name));
	const names = new Set(files);
	return files
		.filter((name) => {
			const ext = path.extname(name).toLowerCase();
			if (!names.has(`${path.basename(name, path.extname(name))}.webp`))
				return true;
			return ext === ".webp";
		})
		.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function localPhotos(albumId: string, albumDir: string): AlbumPhoto[] {
	return resolveLocalPhotoFiles(albumDir).map((fileName, index) => {
		const relative = `${albumId}/${fileName}`;
		// 展示缩略图：优先 thumb/<名>.webp（自动生成），回退 <名>.thumb.webp（手工 sidecar）
		const baseName = path.basename(fileName, path.extname(fileName));
		const folderThumb = path.join(albumDir, THUMBNAIL_DIRECTORY, `${baseName}.webp`);
		const sidecarThumb = path.join(albumDir, `${baseName}.thumb.webp`);
		return {
			id: `${albumId}-photo-${index + 1}`,
			src: toPublicPath(relative),
			// 悬浮浮层与查看器信息栏展示完整文件名，不按下划线截断成标题
			alt: fileName,
			thumbnail: fs.existsSync(folderThumb)
				? toPublicPath(`${albumId}/${THUMBNAIL_DIRECTORY}/${baseName}.webp`)
				: fs.existsSync(sidecarThumb)
					? toPublicPath(`${albumId}/${baseName}.thumb.webp`)
					: undefined,
			tags: parseFileNameTags(fileName),
			date: fileDate(path.join(albumDir, fileName)),
			liveVideo: findLivePhotoSidecar(albumId, albumDir, fileName),
		};
	});
}

/**
 * Live Photo 配对视频：thumb/<照片名>.<ext>（提取/提交的标准位置）优先，
 * 兼容相册根目录的同名视频；扩展名 .mov/.mp4/.webm/.m4v，忽略大小写。
 */
function findLivePhotoSidecar(
	albumId: string,
	albumDir: string,
	fileName: string,
): string | undefined {
	const base = path
		.basename(fileName, path.extname(fileName))
		.toLowerCase();
	const searchDirs = [
		path.join(albumDir, THUMBNAIL_DIRECTORY),
		albumDir,
	];
	let sidecar: string | undefined;
	for (const searchDir of searchDirs) {
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(searchDir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (!entry.isFile()) continue;
			const ext = path.extname(entry.name).toLowerCase();
			if (!VIDEO_EXTENSIONS.has(ext)) continue;
			if (path.basename(entry.name, ext).toLowerCase() === base) {
				// 多个扩展名并存时按文件名序取第一个，保证确定性
				if (!sidecar || entry.name < sidecar) sidecar = entry.name;
			}
		}
		if (sidecar) {
			return toPublicPath(
				`${albumId}/${path.relative(albumDir, path.join(searchDir, sidecar)).replaceAll(path.sep, "/")}`,
			);
		}
	}
	return undefined;
}

function externalPhotos(albumId: string, rawPhotos: unknown): AlbumPhoto[] {
	if (!Array.isArray(rawPhotos)) return [];
	return rawPhotos.flatMap((value, index) => {
		if (!value || typeof value !== "object") return [];
		const raw = value as RawPhoto;
		const src = stringValue(raw.src);
		if (!src) {
			console.warn(
				`[albums] Skipping ${albumId} photo ${index + 1}: missing src`,
			);
			return [];
		}
		const title = stringValue(raw.title);
		return [
			{
				id: stringValue(raw.id, `${albumId}-external-photo-${index + 1}`),
				src,
				thumbnail: stringValue(raw.thumbnail) || undefined,
				alt: stringValue(raw.alt, title || `Photo ${index + 1}`),
				title: title || undefined,
				description: stringValue(raw.description) || undefined,
				tags: stringArray(raw.tags),
				date: dateValue(raw.date),
				location: stringValue(raw.location) || undefined,
				width: numberValue(raw.width),
				height: numberValue(raw.height),
				camera: stringValue(raw.camera) || undefined,
				lens: stringValue(raw.lens) || undefined,
				settings: stringValue(raw.settings) || undefined,
			},
		];
	});
}

function scanAlbumDirectory(entry: fs.Dirent): AlbumGroup | null {
	if (!entry.isDirectory()) return null;
	const id = entry.name;
	const albumDir = path.join(ALBUM_ROOT, id);
	const infoPath = path.join(albumDir, "info.json");

	const raw = readJson(infoPath);
	if (!raw) {
		// info.json 是可选项：缺失时静默按目录相册读取；损坏时告警（内容错误需要暴露）但同样回退
		if (fs.existsSync(infoPath)) {
			console.warn(
				`[albums] ${id}: info.json is invalid, falling back to directory defaults`,
			);
		}
		return directoryAlbum(id, albumDir);
	}
	const external = raw.mode === "external";
	const cover = external
		? stringValue(raw.cover)
		: fs.existsSync(path.join(albumDir, "cover.webp"))
			? toPublicPath(`${id}/cover.webp`)
			: fs.existsSync(path.join(albumDir, "cover.jpg"))
				? toPublicPath(`${id}/cover.jpg`)
				: "";
	if (!cover) {
		console.warn(`[albums] Skipping ${id}: cover is missing`);
		return null;
	}
	const photos = external
		? externalPhotos(id, raw.photos)
		: localPhotos(id, albumDir);
	return {
		id,
		title: stringValue(raw.title, id),
		description: stringValue(raw.description),
		cover,
		date: dateValue(raw.date),
		location: stringValue(raw.location),
		tags: stringArray(raw.tags),
		layout: layoutValue(raw.layout),
		columns: columnsValue(raw.columns),
		hidden: raw.hidden === true,
		password: stringValue(raw.password) || undefined,
		passwordHint: stringValue(raw.passwordHint) || undefined,
		photos,
	};
}

export function scanAllAlbums(): AlbumGroup[] {
	if (!fs.existsSync(ALBUM_ROOT)) return [];
	return fs
		.readdirSync(ALBUM_ROOT, { withFileTypes: true })
		.map(scanAlbumDirectory)
		.filter((album): album is AlbumGroup => album !== null)
		.sort(
			(a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title),
		);
}

export function scanVisibleAlbums(): AlbumGroup[] {
	return scanAllAlbums().filter((album) => !album.hidden);
}

export function toAlbumIndexItem(album: AlbumGroup): AlbumIndexItem {
	const { photos, password, ...metadata } = album;
	return {
		...metadata,
		photoCount: photos.length,
		protected: Boolean(password),
	};
}

export function findAlbum(id: string): AlbumGroup | undefined {
	return scanAllAlbums().find((album) => album.id === id);
}
