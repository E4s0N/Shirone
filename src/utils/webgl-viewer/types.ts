/**
 * WebGL 图片查看器类型定义。
 * 由 webgl-image（Vue 版）移植，剥离 Vue/调试/剪贴板层，
 * 只保留 Shirone 相册查看大图所需的渲染与交互核心。
 */

import type { HistogramData } from "./histogram";

export type { HistogramData };

export interface Transform {
	scale: number;
	translateX: number;
	translateY: number;
}

export interface Animation {
	startTime: number;
	duration: number;
	startTransform: Transform;
	targetTransform: Transform;
	easing: (t: number) => number;
}

export interface ViewerEngineConfig {
	/** 相对最小缩放（相对初始适配缩放的倍数） */
	minScale: number;
	/** 相对最大缩放（相对初始适配缩放的倍数） */
	maxScale: number;
	/** 滚轮/双击每步缩放系数 */
	wheelStep: number;
	doubleClickStep: number;
	/** 补间动画时长（ms），0 表示直接到位（reduced-motion 降级） */
	animationTime: number;
	/** 是否启用瓦片渲染（超大图分块上传纹理） */
	tileEnabled: boolean;
	/** 瓦片边长（px） */
	tileSize: number;
	/** 是否把平移限制在图片边界内 */
	limitToBounds: boolean;
	/** 加载完成后是否居中适配 */
	centerOnInit: boolean;
}

export interface ViewerCallbacks {
	/** 加载状态变化：loading 为 true 表示解码/建纹理中；error 为 true 表示最终失败 */
	onLoadChange?: (loading: boolean, error: boolean) => void;
	/** 任意 transform 变化（拖拽/缩放/动画每帧） */
	onTransformChange?: (transform: Transform) => void;
	/** 图片加载成功后返回元数据（EXIF 解析或直方图采样失败时字段省略） */
	onMetadata?: (metadata: ViewerMetadata) => void;
}

/**
 * Worker 就地解析的 EXIF 摘要（字段缺失即省略，全部可选）。
 */
export interface ExifSummary {
	camera?: string;
	lens?: string;
	/** 作者（Artist） */
	artist?: string;
	/** 焦距（mm） */
	focalLength?: number;
	/** 等效焦距（35mm，mm） */
	focalLength35?: number;
	/** 镜头最大光圈值 */
	maxAperture?: number;
	/** 光圈值 */
	fNumber?: number;
	/** 曝光时间（秒） */
	exposureTime?: number;
	iso?: number;
	/** 拍摄时间（相机原始墙上时间，YYYY-MM-DD HH:mm:ss） */
	dateTaken?: string;
	colorSpace?: string;
	software?: string;
	/** 曝光程序（exifr 已翻译的可读字符串） */
	exposureProgram?: string;
	meteringMode?: string;
	whiteBalance?: string;
	flash?: string;
	latitude?: number;
	longitude?: number;
}

/** 随图片加载返回的元数据（EXIF / 直方图 / 文件大小 / 解码后实际尺寸） */
export interface ViewerMetadata {
	exif?: ExifSummary;
	histogram?: HistogramData;
	fileSize?: number;
	/** 解码后位图的实际像素尺寸（相册元数据缺 width/height 时的兜底） */
	width?: number;
	height?: number;
}

export interface Tile {
	x: number;
	y: number;
	width: number;
	height: number;
	texture: WebGLTexture | null;
}

export type ImageSource = HTMLImageElement | HTMLCanvasElement | ImageBitmap;

/**
 * 查看器照片条目。字段是 AlbumPhoto 的超集兼容形状：
 * 相册页（全站所有图 / 单个相册）直接传入其照片数组，
 * `album` 由调用方附带，用于信息栏展示所属相册。
 */
export interface ViewerPhoto {
	src: string;
	thumbnail?: string;
	alt: string;
	title?: string;
	description?: string;
	tags?: string[];
	date?: string;
	location?: string;
	width?: number;
	height?: number;
	camera?: string;
	lens?: string;
	settings?: string;
	/** Live Photo 配对视频（有值即显示 LIVE 徽章并支持播放） */
	liveVideo?: string;
	album?: string;
}
