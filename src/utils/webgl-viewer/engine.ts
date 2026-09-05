/**
 * WebGL 图片查看器引擎（框架无关）。
 * 移植自 webgl-image 的 WebGLImageViewerEngine，裁剪为 Shirone 所需子集：
 * 整图纹理 + 超大图瓦片两条渲染路径、Worker 离线解码（含主线程回退）、
 * 拖拽/滚轮/双指/双击交互、边界约束与 easeOutQuart 补间。
 * 交互状态下图像不参与 DOM 变换，全部通过 uniform 矩阵在 GPU 上绘制。
 */

import { HISTOGRAM_SAMPLE, histogramFromImageData } from "./histogram";
import { createProgram } from "./shaders";
import {
	clamp,
	easeOutQuart,
	getMaxTextureSize,
	RENDER_CONFIG,
	throttle,
} from "./support";
import type {
	Animation,
	HistogramData,
	ImageSource,
	Tile,
	Transform,
	ViewerCallbacks,
	ViewerEngineConfig,
} from "./types";

const DEFAULT_CONFIG: ViewerEngineConfig = {
	minScale: 0.1,
	maxScale: 10,
	wheelStep: 0.1,
	doubleClickStep: 2,
	animationTime: 250,
	tileEnabled: true,
	tileSize: 1024,
	limitToBounds: true,
	centerOnInit: true,
};

export class WebGLImageViewerEngine {
	private canvas: HTMLCanvasElement;
	private gl: WebGLRenderingContext;
	private config: ViewerEngineConfig;
	private callbacks: ViewerCallbacks;

	private image: ImageSource | null = null;
	private texture: WebGLTexture | null = null;
	private program: WebGLProgram | null = null;
	private tiles: Tile[] = [];
	private useTiles = false;

	private worker: Worker | null = null;
	private imageLoadingResolve: (() => void) | null = null;
	private imageLoadingReject: ((error: Error) => void) | null = null;

	private transform: Transform = { scale: 1, translateX: 0, translateY: 0 };
	private initialScale = 1;

	private animation: Animation | null = null;
	private animationId: number | null = null;

	private isDragging = false;
	private lastMousePos: { x: number; y: number } | null = null;
	private touchState: {
		lastDistance: number;
	} | null = null;
	private lastClickTime = 0;
	private lastTouchTime = 0;
	private lastTouchPosition: { x: number; y: number } | null = null;
	private hasMoved = false;

	private positionBuffer: WebGLBuffer | null = null;
	private texCoordBuffer: WebGLBuffer | null = null;
	private positionLocation = -1;
	private texCoordLocation = -1;
	private matrixLocation: WebGLUniformLocation | null = null;
	private resolutionLocation: WebGLUniformLocation | null = null;
	private imageLocation: WebGLUniformLocation | null = null;

	private loaded = false;
	private requestCounter = 0;
	private currentRequestId = 0;
	private lastRequestedSrc: string | null = null;

	private throttledRender: () => void;
	private resizeObserver: ResizeObserver | null = null;
	private resizeFrameId: number | null = null;

	// 绑定后的处理器引用，destroy 时成对移除（含 document 级监听）
	private boundHandlers: Array<[EventTarget, string, EventListener]> = [];

	constructor(
		canvas: HTMLCanvasElement,
		config: Partial<ViewerEngineConfig> = {},
		callbacks: ViewerCallbacks = {},
	) {
		this.canvas = canvas;
		this.config = { ...DEFAULT_CONFIG, ...config };
		this.callbacks = callbacks;

		const gl = canvas.getContext("webgl", {
			alpha: true,
			antialias: true,
			depth: false,
			stencil: false,
			preserveDrawingBuffer: false,
		});
		if (!gl) {
			throw new Error("WebGL not supported");
		}
		this.gl = gl;

		this.throttledRender = throttle(
			() => this.render(),
			RENDER_CONFIG.THROTTLE_MS,
		);
		this.setupWebGL();
		this.setupWorker();
		this.setupEventListeners();
		this.setupResizeObserver();
		this.resize();
	}

	// ------------------------------------------------------------ 初始化

	private setupWebGL(): void {
		const { gl } = this;
		this.program = createProgram(gl);
		if (!this.program) {
			throw new Error("Failed to create shader program");
		}

		gl.useProgram(this.program);
		this.positionLocation = gl.getAttribLocation(this.program, "a_position");
		this.texCoordLocation = gl.getAttribLocation(this.program, "a_texCoord");
		this.matrixLocation = gl.getUniformLocation(this.program, "u_matrix");
		this.resolutionLocation = gl.getUniformLocation(
			this.program,
			"u_resolution",
		);
		this.imageLocation = gl.getUniformLocation(this.program, "u_image");

		this.positionBuffer = gl.createBuffer();
		this.texCoordBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]),
			gl.STATIC_DRAW,
		);

		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		gl.clearColor(0, 0, 0, 0);
	}

	private setupWorker(): void {
		if (typeof Worker === "undefined") return;
		try {
			this.worker = new Worker(new URL("./worker.ts", import.meta.url), {
				type: "module",
				name: "webgl-image-decoder",
			});
		} catch {
			// Worker 创建失败时退回主线程解码
			this.worker = null;
			return;
		}

		this.worker.onmessage = (event: MessageEvent) => {
			const { type, payload } = event.data;
			if (!this.isCurrentRequest(payload?.requestId)) return;
			if (type === "loaded") {
				const rendered = this.applyDecodedImage(payload.imageBitmap);
				if (rendered) {
					this.callbacks.onMetadata?.({
						exif: payload.exif,
						histogram: payload.histogram,
						fileSize: payload.fileSize,
						width: payload.imageBitmap.width,
						height: payload.imageBitmap.height,
					});
					this.resolvePendingImageLoad();
				} else {
					void this.decodeOnMainThread();
				}
			} else if (type === "load-error") {
				void this.decodeOnMainThread();
			}
		};
		this.worker.onerror = () => {
			void this.decodeOnMainThread();
		};
	}

	private addListener<T extends Event>(
		target: EventTarget,
		type: string,
		handler: (event: T) => void,
		options?: AddEventListenerOptions,
	): void {
		target.addEventListener(type, handler as EventListener, options);
		this.boundHandlers.push([target, type, handler as EventListener]);
	}

	private setupEventListeners(): void {
		this.addListener(this.canvas, "mousedown", this.onMouseDown);
		this.addListener(this.canvas, "wheel", this.onWheel, { passive: false });
		this.addListener(this.canvas, "click", this.onClick);
		this.addListener(this.canvas, "touchstart", this.onTouchStart, {
			passive: false,
		});
		this.addListener(this.canvas, "touchmove", this.onTouchMove, {
			passive: false,
		});
		this.addListener(this.canvas, "touchend", this.onTouchEnd, {
			passive: false,
		});
		this.addListener(this.canvas, "webglcontextlost", this.onContextLost);
		this.addListener(
			this.canvas,
			"webglcontextrestored",
			this.onContextRestored,
		);
		this.addListener(this.canvas, "contextmenu", (event) =>
			event.preventDefault(),
		);
	}

	private setupResizeObserver(): void {
		this.resizeObserver = new ResizeObserver(() => {
			if (this.resizeFrameId !== null) {
				cancelAnimationFrame(this.resizeFrameId);
			}
			this.resizeFrameId = requestAnimationFrame(() => {
				this.resizeFrameId = null;
				this.resize();
			});
		});
		this.resizeObserver.observe(this.canvas);
	}

	// ------------------------------------------------------------ 图片加载

	public loadImage(src: string): Promise<void> {
		this.lastRequestedSrc = src;
		// 请求代际：快速切换图片时丢弃过期回包
		const requestId = ++this.requestCounter;
		this.currentRequestId = requestId;
		// 丢弃上一张的画面：切换加载期间 render 只清屏不绘制旧图，
		// 残影交给缩略图占位层替代
		this.loaded = false;
		this.render();
		this.callbacks.onLoadChange?.(true, false);

		return new Promise((resolve, reject) => {
			this.imageLoadingResolve = resolve;
			this.imageLoadingReject = reject;

			if (this.worker) {
				this.worker.postMessage({
					type: "load",
					payload: {
						src: new URL(src, self.location.origin).toString(),
						requestId,
					},
				});
			} else {
				void this.decodeOnMainThread();
			}
		});
	}

	private isCurrentRequest(requestId: unknown): boolean {
		return requestId === undefined || requestId === this.currentRequestId;
	}

	/** 预热相邻照片：Worker 内只取字节入缓存，不解码；切换到时省去下载等待 */
	public preload(src: string): void {
		if (!this.worker) return;
		this.worker.postMessage({
			type: "preload",
			payload: { src: new URL(src, self.location.origin).toString() },
		});
	}

	// 主线程回退解码（Worker 不可用或解码失败时）
	private async decodeOnMainThread(): Promise<void> {
		const src = this.lastRequestedSrc;
		if (!src) {
			this.rejectPendingImageLoad(new Error("No image source available"));
			return;
		}
		const requestId = this.currentRequestId;
		this.callbacks.onLoadChange?.(true, false);
		try {
			const image = await new Promise<HTMLImageElement>((resolve, reject) => {
				const img = new Image();
				img.crossOrigin = "anonymous";
				img.decoding = "async";
				img.onload = () => resolve(img);
				img.onerror = () => reject(new Error("Failed to decode image"));
				img.src = src;
			});
			// 解码期间用户已切换到其他图片：丢弃本次结果
			if (requestId !== this.currentRequestId) return;
			const rendered = this.applyDecodedImage(image);
			if (!rendered) {
				throw new Error("Failed to render decoded image");
			}
			// 主线程回退路径没有 Worker 的 EXIF 解析，仅采样直方图
			this.callbacks.onMetadata?.({
				histogram: this.computeHistogramOnMainThread(image),
				width: image.width,
				height: image.height,
			});
			this.resolvePendingImageLoad();
		} catch (error) {
			if (requestId !== this.currentRequestId) return;
			this.rejectPendingImageLoad(error);
		}
	}

	private resolvePendingImageLoad(): void {
		const resolve = this.imageLoadingResolve;
		this.imageLoadingResolve = null;
		this.imageLoadingReject = null;
		resolve?.();
	}

	private rejectPendingImageLoad(error: unknown): void {
		const reject = this.imageLoadingReject;
		this.imageLoadingResolve = null;
		this.imageLoadingReject = null;
		this.callbacks.onLoadChange?.(false, true);
		reject?.(
			error instanceof Error ? error : new Error("Unknown image load error"),
		);
	}

	private applyDecodedImage(source: ImageSource): boolean {
		const dimensions = this.getSourceDimensions(source);
		if (!dimensions) return false;

		this.image = source;
		this.loaded = true;

		let usingTiles = false;
		if (this.shouldUseTiles(dimensions)) {
			usingTiles = this.createTiles(source);
		}

		if (!usingTiles) {
			this.cleanupTiles();
			if (this.createTexture(source) === null) {
				this.image = null;
				this.loaded = false;
				return false;
			}
		} else if (this.texture) {
			this.gl.deleteTexture(this.texture);
			this.texture = null;
		}
		this.useTiles = usingTiles;

		if (this.config.centerOnInit) {
			this.centerImage();
		}

		this.callbacks.onLoadChange?.(false, false);
		this.render();
		return true;
	}

	/** 主线程直方图采样（Worker 不可用时的回退）；跨域无 CORS 时 getImageData 会抛错，按无直方图处理 */
	private computeHistogramOnMainThread(
		source: ImageSource,
	): HistogramData | undefined {
		if (typeof document === "undefined" || !source.width || !source.height) {
			return undefined;
		}
		try {
			const scale = Math.min(
				1,
				HISTOGRAM_SAMPLE / Math.max(source.width, source.height),
			);
			const width = Math.max(1, Math.round(source.width * scale));
			const height = Math.max(1, Math.round(source.height * scale));
			const canvas = document.createElement("canvas");
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext("2d", { willReadFrequently: true });
			if (!ctx) return undefined;
			ctx.drawImage(source as CanvasImageSource, 0, 0, width, height);
			return histogramFromImageData(ctx.getImageData(0, 0, width, height));
		} catch {
			return undefined;
		}
	}

	private getSourceDimensions(source: {
		width: number;
		height: number;
	}): { width: number; height: number } | null {
		const { width, height } = source;
		if (
			!Number.isFinite(width) ||
			!Number.isFinite(height) ||
			width <= 0 ||
			height <= 0
		) {
			return null;
		}
		return { width, height };
	}

	// ------------------------------------------------------------ 纹理

	private createTexture(source: ImageSource): WebGLTexture | null {
		const { gl } = this;

		if (this.texture) {
			gl.deleteTexture(this.texture);
			this.texture = null;
		}

		const dimensions = this.getSourceDimensions(source);
		if (!dimensions) return null;

		const maxTextureSize = getMaxTextureSize(gl);
		const maxPixels = Math.min(
			RENDER_CONFIG.MAX_TEXTURE_UPLOAD_PIXELS,
			maxTextureSize * maxTextureSize,
		);
		const sourcePixels = dimensions.width * dimensions.height;

		let targetWidth = dimensions.width;
		let targetHeight = dimensions.height;
		if (sourcePixels > maxPixels) {
			const scale = Math.sqrt(maxPixels / sourcePixels);
			targetWidth = Math.max(1, Math.floor(dimensions.width * scale));
			targetHeight = Math.max(1, Math.floor(dimensions.height * scale));
		}
		if (
			dimensions.width > maxTextureSize ||
			dimensions.height > maxTextureSize
		) {
			const scale = Math.min(
				maxTextureSize / dimensions.width,
				maxTextureSize / dimensions.height,
			);
			targetWidth = Math.max(1, Math.floor(targetWidth * scale));
			targetHeight = Math.max(1, Math.floor(targetHeight * scale));
		}

		let uploadSource: ImageSource = source;
		if (
			targetWidth !== dimensions.width ||
			targetHeight !== dimensions.height
		) {
			const resized = this.resizeSource(source, targetWidth, targetHeight);
			if (resized) uploadSource = resized;
		}

		let attempt = 0;
		while (attempt < RENDER_CONFIG.TEXTURE_RETRY_LIMIT) {
			const texture = gl.createTexture();
			if (!texture) break;

			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

			let uploadError: unknown = null;
			try {
				gl.texImage2D(
					gl.TEXTURE_2D,
					0,
					gl.RGBA,
					gl.RGBA,
					gl.UNSIGNED_BYTE,
					uploadSource,
				);
			} catch (error) {
				uploadError = error;
			}

			if (!uploadError && gl.getError() === gl.NO_ERROR) {
				this.texture = texture;
				this.image = uploadSource;
				this.updatePositionBuffer();
				gl.bindTexture(gl.TEXTURE_2D, null);
				return texture;
			}

			gl.deleteTexture(texture);
			gl.bindTexture(gl.TEXTURE_2D, null);

			const current = this.getSourceDimensions(uploadSource);
			if (!current) break;
			const retryWidth = Math.max(
				1,
				Math.floor(current.width * RENDER_CONFIG.TEXTURE_RETRY_SCALE_FACTOR),
			);
			const retryHeight = Math.max(
				1,
				Math.floor(current.height * RENDER_CONFIG.TEXTURE_RETRY_SCALE_FACTOR),
			);
			if (retryWidth >= current.width && retryHeight >= current.height) break;
			const resized = this.resizeSource(uploadSource, retryWidth, retryHeight);
			if (!resized) break;
			uploadSource = resized;
			attempt += 1;
		}

		return null;
	}

	private resizeSource(
		source: CanvasImageSource,
		width: number,
		height: number,
	): HTMLCanvasElement | null {
		const offscreen = document.createElement("canvas");
		offscreen.width = width;
		offscreen.height = height;
		const ctx = offscreen.getContext("2d");
		if (!ctx) return null;
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = "high";
		ctx.drawImage(source, 0, 0, width, height);
		return offscreen;
	}

	private shouldUseTiles(dimensions: {
		width: number;
		height: number;
	}): boolean {
		if (!this.config.tileEnabled) return false;
		if (
			dimensions.width * dimensions.height >
			RENDER_CONFIG.MAX_TILE_TOTAL_PIXELS
		) {
			return false;
		}
		const maxTextureSize = getMaxTextureSize(this.gl);
		if (
			dimensions.width > maxTextureSize ||
			dimensions.height > maxTextureSize
		) {
			return true;
		}
		return (
			dimensions.width > this.config.tileSize ||
			dimensions.height > this.config.tileSize
		);
	}

	private createTiles(source: ImageSource): boolean {
		const { gl } = this;
		this.cleanupTiles();

		const dimensions = this.getSourceDimensions(source);
		if (!dimensions) return false;

		const tileSize = Math.min(this.config.tileSize, getMaxTextureSize(gl));
		const columns = Math.ceil(dimensions.width / tileSize);
		const rows = Math.ceil(dimensions.height / tileSize);
		const offscreen = document.createElement("canvas");
		const tiles: Tile[] = [];

		for (let row = 0; row < rows; row++) {
			for (let col = 0; col < columns; col++) {
				const x = col * tileSize;
				const y = row * tileSize;
				const width = Math.min(tileSize, dimensions.width - x);
				const height = Math.min(tileSize, dimensions.height - y);
				if (width <= 0 || height <= 0) continue;

				offscreen.width = width;
				offscreen.height = height;
				const ctx = offscreen.getContext("2d");
				if (!ctx) {
					this.cleanupTiles();
					return false;
				}
				ctx.drawImage(source, x, y, width, height, 0, 0, width, height);

				const texture = gl.createTexture();
				if (!texture) {
					this.cleanupTiles();
					return false;
				}
				gl.bindTexture(gl.TEXTURE_2D, texture);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
				gl.texImage2D(
					gl.TEXTURE_2D,
					0,
					gl.RGBA,
					gl.RGBA,
					gl.UNSIGNED_BYTE,
					offscreen,
				);
				tiles.push({ x, y, width, height, texture });
			}
		}
		gl.bindTexture(gl.TEXTURE_2D, null);

		if (!tiles.length) return false;
		this.tiles = tiles;
		this.updatePositionBuffer();
		return true;
	}

	private cleanupTiles(): void {
		for (const tile of this.tiles) {
			if (tile.texture) this.gl.deleteTexture(tile.texture);
		}
		this.tiles = [];
	}

	private getVisibleTiles(): Tile[] {
		if (!this.tiles.length) return [];
		const { scale, translateX, translateY } = this.transform;
		if (!Number.isFinite(scale) || scale <= 0) return this.tiles;

		const viewLeft = -translateX / scale;
		const viewTop = -translateY / scale;
		const viewRight = (this.canvas.width - translateX) / scale;
		const viewBottom = (this.canvas.height - translateY) / scale;

		return this.tiles.filter((tile) => {
			return (
				tile.x + tile.width >= viewLeft &&
				tile.x <= viewRight &&
				tile.y + tile.height >= viewTop &&
				tile.y <= viewBottom
			);
		});
	}

	private updatePositionBuffer(): void {
		if (!this.image || !this.positionBuffer) return;
		const { gl } = this;
		const { width, height } = this.getSourceDimensions(this.image) ?? {
			width: 1,
			height: 1,
		};
		gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array([
				0,
				0,
				width,
				0,
				0,
				height,
				0,
				height,
				width,
				0,
				width,
				height,
			]),
			gl.STATIC_DRAW,
		);
	}

	// ------------------------------------------------------------ 视图状态

	public resize(): void {
		const rect = this.canvas.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) return;

		const dpr = window.devicePixelRatio || 1;
		const width = Math.max(1, Math.round(rect.width * dpr));
		const height = Math.max(1, Math.round(rect.height * dpr));
		if (width === this.canvas.width && height === this.canvas.height) return;

		const prevScale = this.transform.scale;
		const prevTranslateX = this.transform.translateX;
		const prevTranslateY = this.transform.translateY;
		const prevInitialScale = this.initialScale;

		this.canvas.width = width;
		this.canvas.height = height;
		this.gl.viewport(0, 0, width, height);

		if (this.image && prevScale > 0 && prevInitialScale > 0) {
			// 保持当前缩放级别与视口中心对应的图像点不变
			const centerImageX = (this.canvas.width / 2 - prevTranslateX) / prevScale;
			const centerImageY =
				(this.canvas.height / 2 - prevTranslateY) / prevScale;

			this.initialScale = this.getFitScale();
			const nextScale = this.clampScale(
				this.initialScale * (prevScale / prevInitialScale),
			);
			this.transform.scale = nextScale;
			this.transform.translateX =
				this.canvas.width / 2 - centerImageX * nextScale;
			this.transform.translateY =
				this.canvas.height / 2 - centerImageY * nextScale;
			this.constrainToBounds();
		}

		if (this.image && (this.texture || this.useTiles)) {
			this.throttledRender();
		}
	}

	private centerImage(): void {
		if (!this.image || this.canvas.width <= 0 || this.canvas.height <= 0)
			return;

		this.initialScale = this.getFitScale();
		const scale = this.clampScale(this.initialScale);
		const scaledWidth = this.image.width * scale;
		const scaledHeight = this.image.height * scale;

		this.transform = {
			scale,
			translateX: (this.canvas.width - scaledWidth) / 2,
			translateY: (this.canvas.height - scaledHeight) / 2,
		};
		this.callbacks.onTransformChange?.({ ...this.transform });
	}

	private constrainToBounds(): void {
		if (!this.config.limitToBounds || !this.image) return;

		const scaledWidth = this.image.width * this.transform.scale;
		const scaledHeight = this.image.height * this.transform.scale;

		if (scaledWidth <= this.canvas.width) {
			this.transform.translateX = (this.canvas.width - scaledWidth) / 2;
		} else {
			this.transform.translateX = clamp(
				this.transform.translateX,
				this.canvas.width - scaledWidth,
				0,
			);
		}

		if (scaledHeight <= this.canvas.height) {
			this.transform.translateY = (this.canvas.height - scaledHeight) / 2;
		} else {
			this.transform.translateY = clamp(
				this.transform.translateY,
				this.canvas.height - scaledHeight,
				0,
			);
		}
	}

	private clampScale(scale: number): number {
		return clamp(
			scale,
			this.initialScale * this.config.minScale,
			this.initialScale * this.config.maxScale,
		);
	}

	private getFitScale(): number {
		if (!this.image || this.canvas.width <= 0 || this.canvas.height <= 0) {
			return this.initialScale;
		}
		const canvasAspect = this.canvas.width / this.canvas.height;
		const imageAspect = this.image.width / this.image.height;
		return imageAspect > canvasAspect
			? this.canvas.width / this.image.width
			: this.canvas.height / this.image.height;
	}

	public getScale(): number {
		return this.transform.scale;
	}

	public getRelativeScale(): number {
		return this.initialScale > 0 ? this.transform.scale / this.initialScale : 1;
	}

	// ------------------------------------------------------------ 渲染

	private render(): void {
		if (!this.program || (!this.texture && !this.useTiles)) return;
		const { gl } = this;

		try {
			if (gl.isContextLost()) return;

			if (!this.loaded) {
				// 切换/加载期间：只清屏等待新图，避免上一张的残影
				gl.clear(gl.COLOR_BUFFER_BIT);
				return;
			}

			this.updateAnimation();

			gl.clear(gl.COLOR_BUFFER_BIT);
			gl.useProgram(this.program);
			gl.uniform2f(
				this.resolutionLocation,
				this.canvas.width,
				this.canvas.height,
			);
			gl.uniform1i(this.imageLocation, 0);
			gl.uniformMatrix3fv(
				this.matrixLocation,
				false,
				createTransformMatrix(this.transform),
			);

			if (!this.positionBuffer || !this.texCoordBuffer) return;

			gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
			gl.enableVertexAttribArray(this.texCoordLocation);
			gl.vertexAttribPointer(this.texCoordLocation, 2, gl.FLOAT, false, 0, 0);
			gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
			gl.enableVertexAttribArray(this.positionLocation);
			gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);

			gl.activeTexture(gl.TEXTURE0);

			if (this.useTiles) {
				for (const tile of this.getVisibleTiles()) {
					if (!tile.texture) continue;
					gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
					gl.bufferData(
						gl.ARRAY_BUFFER,
						new Float32Array([
							tile.x,
							tile.y,
							tile.x + tile.width,
							tile.y,
							tile.x,
							tile.y + tile.height,
							tile.x,
							tile.y + tile.height,
							tile.x + tile.width,
							tile.y,
							tile.x + tile.width,
							tile.y + tile.height,
						]),
						gl.DYNAMIC_DRAW,
					);
					gl.bindTexture(gl.TEXTURE_2D, tile.texture);
					gl.drawArrays(gl.TRIANGLES, 0, 6);
				}
			} else if (this.texture) {
				gl.bindTexture(gl.TEXTURE_2D, this.texture);
				gl.drawArrays(gl.TRIANGLES, 0, 6);
			}
		} catch (error) {
			console.error("WebGL viewer render error:", error);
		}
	}

	private updateAnimation(): void {
		if (!this.animation) return;

		const elapsed = Date.now() - this.animation.startTime;
		const progress = Math.min(elapsed / this.animation.duration, 1);

		if (progress >= 1 || this.animation.duration <= 0) {
			this.transform = { ...this.animation.targetTransform };
			this.animation = null;
			if (this.animationId !== null) {
				cancelAnimationFrame(this.animationId);
				this.animationId = null;
			}
			this.callbacks.onTransformChange?.({ ...this.transform });
			return;
		}

		const t = this.animation.easing(progress);
		const { startTransform, targetTransform } = this.animation;
		this.transform = {
			scale:
				startTransform.scale +
				(targetTransform.scale - startTransform.scale) * t,
			translateX:
				startTransform.translateX +
				(targetTransform.translateX - startTransform.translateX) * t,
			translateY:
				startTransform.translateY +
				(targetTransform.translateY - startTransform.translateY) * t,
		};
		this.callbacks.onTransformChange?.({ ...this.transform });

		this.animationId = requestAnimationFrame(() => this.render());
	}

	private animateTo(target: Transform): void {
		if (this.animationId !== null) {
			cancelAnimationFrame(this.animationId);
			this.animationId = null;
		}

		if (this.config.animationTime <= 0) {
			this.transform = { ...target };
			this.constrainToBounds();
			this.callbacks.onTransformChange?.({ ...this.transform });
			this.throttledRender();
			return;
		}

		this.animation = {
			startTime: Date.now(),
			duration: this.config.animationTime,
			startTransform: { ...this.transform },
			targetTransform: { ...target },
			easing: easeOutQuart,
		};
		this.render();
	}

	// ------------------------------------------------------------ 缩放

	public zoomIn(animate = true): void {
		this.zoomAtPoint(
			this.canvas.width / 2,
			this.canvas.height / 2,
			1 + this.config.wheelStep,
			animate,
		);
	}

	public zoomOut(animate = true): void {
		this.zoomAtPoint(
			this.canvas.width / 2,
			this.canvas.height / 2,
			1 - this.config.wheelStep,
			animate,
		);
	}

	public resetView(): void {
		if (!this.image) return;

		this.initialScale = this.getFitScale();
		const scale = this.clampScale(this.initialScale);
		const scaledWidth = this.image.width * scale;
		const scaledHeight = this.image.height * scale;
		this.animateTo({
			scale,
			translateX: (this.canvas.width - scaledWidth) / 2,
			translateY: (this.canvas.height - scaledHeight) / 2,
		});
	}

	private zoomAtPoint(
		x: number,
		y: number,
		scaleFactor: number,
		animate: boolean,
	): void {
		if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) return;

		const newScale = this.clampScale(this.transform.scale * scaleFactor);
		if (newScale === this.transform.scale) return;

		const imageX = (x - this.transform.translateX) / this.transform.scale;
		const imageY = (y - this.transform.translateY) / this.transform.scale;
		const target: Transform = {
			scale: newScale,
			translateX: x - imageX * newScale,
			translateY: y - imageY * newScale,
		};

		if (animate) {
			this.animateTo(target);
			return;
		}

		this.transform = target;
		this.constrainToBounds();
		this.callbacks.onTransformChange?.({ ...this.transform });
		this.throttledRender();
	}

	// ------------------------------------------------------------ 交互

	private clientToCanvas(
		clientX: number,
		clientY: number,
	): {
		x: number;
		y: number;
	} {
		const rect = this.canvas.getBoundingClientRect();
		const dpr = window.devicePixelRatio || 1;
		return {
			x: (clientX - rect.left) * dpr,
			y: (clientY - rect.top) * dpr,
		};
	}

	private onMouseDown = (event: MouseEvent): void => {
		this.isDragging = true;
		this.lastMousePos = { x: event.clientX, y: event.clientY };
		this.canvas.style.cursor = "grabbing";
		this.addListener(document, "mousemove", this.onMouseMove);
		this.addListener(document, "mouseup", this.onMouseUp);
		event.preventDefault();
	};

	private onMouseMove = (event: MouseEvent): void => {
		if (!this.isDragging || !this.lastMousePos) return;

		const dpr = window.devicePixelRatio || 1;
		this.transform.translateX += (event.clientX - this.lastMousePos.x) * dpr;
		this.transform.translateY += (event.clientY - this.lastMousePos.y) * dpr;
		this.constrainToBounds();
		this.lastMousePos = { x: event.clientX, y: event.clientY };
		this.callbacks.onTransformChange?.({ ...this.transform });
		this.throttledRender();
		event.preventDefault();
	};

	private onMouseUp = (): void => {
		this.isDragging = false;
		this.lastMousePos = null;
		this.canvas.style.cursor = "grab";
		this.removeListener(document, "mousemove", this.onMouseMove);
		this.removeListener(document, "mouseup", this.onMouseUp);
	};

	private onWheel = (event: WheelEvent): void => {
		event.preventDefault();
		const point = this.clientToCanvas(event.clientX, event.clientY);
		const factor =
			event.deltaY < 0 ? 1 + this.config.wheelStep : 1 - this.config.wheelStep;
		this.zoomAtPoint(point.x, point.y, factor, false);
	};

	private onClick = (event: MouseEvent): void => {
		const now = Date.now();
		if (now - this.lastClickTime < RENDER_CONFIG.DOUBLE_CLICK_DELAY) {
			const point = this.clientToCanvas(event.clientX, event.clientY);
			const zoomedIn = this.transform.scale > this.initialScale * 1.1;
			if (zoomedIn) {
				this.resetView();
			} else {
				this.zoomAtPoint(point.x, point.y, this.config.doubleClickStep, true);
			}
			this.lastClickTime = 0;
			return;
		}
		this.lastClickTime = now;
	};

	private onTouchStart = (event: TouchEvent): void => {
		event.preventDefault();

		if (event.touches.length === 1) {
			this.hasMoved = false;
			this.isDragging = true;
			const touch = event.touches[0];
			if (touch) this.lastMousePos = { x: touch.clientX, y: touch.clientY };
		} else if (event.touches.length === 2) {
			const [a, b] = [event.touches[0], event.touches[1]];
			if (!a || !b) return;
			this.isDragging = false;
			this.lastMousePos = null;
			this.touchState = {
				lastDistance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
			};
		}
	};

	private onTouchMove = (event: TouchEvent): void => {
		event.preventDefault();

		if (event.touches.length === 1 && this.isDragging && this.lastMousePos) {
			const touch = event.touches[0];
			if (!touch) return;
			const dpr = window.devicePixelRatio || 1;
			const deltaX = (touch.clientX - this.lastMousePos.x) * dpr;
			const deltaY = (touch.clientY - this.lastMousePos.y) * dpr;
			if (Math.abs(deltaX) > 5 * dpr || Math.abs(deltaY) > 5 * dpr) {
				this.hasMoved = true;
			}
			this.transform.translateX += deltaX;
			this.transform.translateY += deltaY;
			this.constrainToBounds();
			this.lastMousePos = { x: touch.clientX, y: touch.clientY };
			this.callbacks.onTransformChange?.({ ...this.transform });
			this.throttledRender();
		} else if (event.touches.length === 2 && this.touchState) {
			const [a, b] = [event.touches[0], event.touches[1]];
			if (!a || !b) return;
			const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
			const center = this.clientToCanvas(
				(a.clientX + b.clientX) / 2,
				(a.clientY + b.clientY) / 2,
			);
			this.zoomAtPoint(
				center.x,
				center.y,
				distance / this.touchState.lastDistance,
				false,
			);
			this.touchState.lastDistance = distance;
		}
	};

	private onTouchEnd = (event: TouchEvent): void => {
		const now = Date.now();

		if (event.touches.length === 0 && this.lastMousePos && !this.hasMoved) {
			const position = this.lastMousePos;
			if (
				this.lastTouchTime > 0 &&
				now - this.lastTouchTime < RENDER_CONFIG.DOUBLE_CLICK_DELAY &&
				this.lastTouchPosition &&
				Math.hypot(
					position.x - this.lastTouchPosition.x,
					position.y - this.lastTouchPosition.y,
				) < 50
			) {
				const rect = this.canvas.getBoundingClientRect();
				const dpr = window.devicePixelRatio || 1;
				const centerX = (position.x - rect.left) * dpr;
				const centerY = (position.y - rect.top) * dpr;
				const zoomedIn = this.transform.scale > this.initialScale * 1.1;
				if (zoomedIn) {
					this.resetView();
				} else {
					this.zoomAtPoint(centerX, centerY, this.config.doubleClickStep, true);
				}
				this.lastTouchTime = 0;
				this.lastTouchPosition = null;
			} else {
				this.lastTouchTime = now;
				this.lastTouchPosition = position;
			}
		} else {
			this.lastTouchTime = 0;
			this.lastTouchPosition = null;
		}

		this.isDragging = false;
		this.lastMousePos = null;
		this.touchState = null;
		this.hasMoved = false;
	};

	private onContextLost = (event: Event): void => {
		event.preventDefault();
		if (this.animationId !== null) {
			cancelAnimationFrame(this.animationId);
			this.animationId = null;
		}
		this.animation = null;
		this.isDragging = false;
		this.lastMousePos = null;
		this.touchState = null;
	};

	private onContextRestored = (): void => {
		try {
			this.setupWebGL();
			if (this.image && this.loaded) {
				let usingTiles = this.useTiles;
				if (usingTiles) {
					usingTiles = this.createTiles(this.image);
				}
				if (!usingTiles && this.createTexture(this.image) === null) {
					console.error("Failed to restore WebGL viewer after context loss");
					return;
				}
				this.useTiles = usingTiles && this.tiles.length > 0;
				this.render();
			}
		} catch (error) {
			console.error("Failed to restore WebGL context:", error);
		}
	};

	private removeListener<T extends Event>(
		target: EventTarget,
		type: string,
		handler: (event: T) => void,
	): void {
		const listener = handler as EventListener;
		target.removeEventListener(type, listener);
		this.boundHandlers = this.boundHandlers.filter(
			([t, ty, h]) => !(t === target && ty === type && h === listener),
		);
	}

	// ------------------------------------------------------------ 销毁

	public destroy(): void {
		if (this.animationId !== null) {
			cancelAnimationFrame(this.animationId);
			this.animationId = null;
		}
		if (this.resizeFrameId !== null) {
			cancelAnimationFrame(this.resizeFrameId);
			this.resizeFrameId = null;
		}

		for (const [target, type, handler] of this.boundHandlers) {
			target.removeEventListener(type, handler);
		}
		this.boundHandlers = [];

		const { gl } = this;
		if (this.texture) {
			gl.deleteTexture(this.texture);
			this.texture = null;
		}
		this.cleanupTiles();
		this.useTiles = false;
		if (this.positionBuffer) {
			gl.deleteBuffer(this.positionBuffer);
			this.positionBuffer = null;
		}
		if (this.texCoordBuffer) {
			gl.deleteBuffer(this.texCoordBuffer);
			this.texCoordBuffer = null;
		}
		if (this.program) {
			gl.deleteProgram(this.program);
			this.program = null;
		}

		this.resizeObserver?.disconnect();
		this.resizeObserver = null;

		this.animation = null;
		this.image = null;
		this.loaded = false;

		this.worker?.terminate();
		this.worker = null;
	}
}

/** 由 scale/translate 构造 3×3 仿射矩阵（列主序） */
function createTransformMatrix(transform: Transform): Float32Array {
	const { scale, translateX, translateY } = transform;
	return new Float32Array([
		scale,
		0,
		0,
		0,
		scale,
		0,
		translateX,
		translateY,
		1,
	]);
}
