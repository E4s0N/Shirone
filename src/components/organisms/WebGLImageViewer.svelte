<script lang="ts">
/**
 * WebGL 图片查看器覆盖层（organism）。
 * 由 @utils/webgl-viewer/opener.ts 在点击相册图片时按需动态挂载，
 * 自身不在任何页面静态渲染。布局参照 chronoframe 查看器并以 M3E 风格实现：
 * 中央 WebGL 画布 + 底部缩略图切换条 + 右侧图片信息栏（移动端为底部信息片）。
 * 信息栏内容：基本信息 / 拍摄参数 / 直方图。EXIF 与直方图由解码 Worker
 * 就地解析采样（零额外网络请求），经引擎 onMetadata 回调送达。
 * Escape 关闭，+/-/0 缩放，←/→ 切换照片；reduced-motion 时禁用补间。
 * WebGL 不支持的场景由 opener 直接回退 Fancybox。
 */
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import Icon from "@iconify/svelte";
import { prefersReducedMotion } from "@utils/motion";
import { WebGLImageViewerEngine } from "@utils/webgl-viewer/engine";
import type {
	ExifSummary,
	HistogramData,
	ViewerPhoto,
} from "@utils/webgl-viewer/types";
import { onMount } from "svelte";

let {
	photos,
	startIndex = 0,
	onRequestClose,
}: {
	photos: ViewerPhoto[];
	startIndex?: number;
	onRequestClose?: () => void;
} = $props();

let root: HTMLDivElement | undefined = $state();
let canvas: HTMLCanvasElement | undefined = $state();
let strip: HTMLDivElement | undefined = $state();
let closeButton: HTMLButtonElement | undefined = $state();
let engine: WebGLImageViewerEngine | null = null;
let previousOverflow = "";
let previousFocus: HTMLElement | null = null;

let index = $state(
	Math.min(Math.max(startIndex, 0), Math.max(photos.length - 1, 0)),
);
let loading = $state(true);
let loadFailed = $state(false);
let showInfo = $state(false);
let isMobile = $state(false);
let hintVisible = $state(false);
let meta = $state<ViewerMetadata>({});
// 缩略图预览：加载期间画布渲染当前照片的缩略图纹理（引擎 setPreview），
// 翻页拖拽时与邻图并排跟手，不再使用 DOM 占位层
const thumbImages = new Map<string, HTMLImageElement>();

function getThumbImage(photo: ViewerPhoto): HTMLImageElement {
	let img = thumbImages.get(photo.src);
	if (!img) {
		img = new Image();
		img.src = photo.thumbnail || photo.src;
		thumbImages.set(photo.src, img);
	}
	return img;
}

$effect(() => {
	const photo = photos[index];
	if (!photo || !engine) return;
	const img = getThumbImage(photo);
	const deliver = () => engine?.setPreview(photo.src, img);
	if (img.complete && img.naturalWidth > 0) {
		deliver();
	} else {
		img.addEventListener("load", deliver, { once: true });
	}
});
// 切换动画：1 = 下一张（新内容从右进入），-1 = 上一张（从左进入）
/** 退场中：旧图淡出完成后再真正交换照片并加载 */
let exiting = $state(false);
let exitTimer: ReturnType<typeof setTimeout> | null = null;
// 取图进度（total 为 0 表示无 Content-Length）
let progress = $state<{ loaded: number; total: number } | null>(null);

const SWITCH_EXIT_MS = 160;

const progressText = $derived.by(() => {
	if (progress) {
		if (progress.total > 0) {
			return `${Math.min(100, Math.round((progress.loaded / progress.total) * 100))}%`;
		}
		return formatBytes(progress.loaded);
	}
	return i18n(I18nKey.imageLoading);
});
// Live Photo
let liveVideo: HTMLVideoElement | undefined = $state();
let livePlaying = $state(false);

const current = $derived(photos[index]);
const hasMultiple = $derived(photos.length > 1);
const currentLiveVideo = $derived(current?.liveVideo);

const filename = $derived.by(() => {
	const raw = (current?.src ?? "").split(/[?#]/)[0]?.split("/").pop() ?? "";
	try {
		return decodeURIComponent(raw);
	} catch {
		return raw;
	}
});

interface KVRow {
	label: string;
	value: string;
}

function formatBytes(bytes: number): string {
	if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(2)} MB`;
	if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${bytes} B`;
}

function formatExposureTime(seconds: number): string {
	if (seconds >= 1) return `${Number(seconds.toFixed(1))} s`;
	return `1/${Math.round(1 / seconds)}`;
}

function formatDms(value: number, directions: "NS" | "EW"): string {
	const direction = value >= 0 ? directions[0] : directions[1];
	const absolute = Math.abs(value);
	const degrees = Math.floor(absolute);
	const minutes = Math.floor((absolute - degrees) * 60);
	const seconds = ((absolute - degrees) * 60 - minutes) * 60;
	return `${degrees}°${minutes}'${seconds.toFixed(2)}"${direction}`;
}

function formatCoordinates(exif?: ExifSummary): string {
	if (exif?.latitude === undefined || exif?.longitude === undefined) return "";
	return `${formatDms(exif.latitude, "NS")}\n${formatDms(exif.longitude, "EW")}`;
}

function formatExifDate(raw: string): string {
	return raw.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3");
}

const basicRows = $derived.by(() => {
	const rows: KVRow[] = [];
	const photo = current;
	if (!photo) return rows;
	if (filename)
		rows.push({ label: i18n(I18nKey.photoFilename), value: filename });
	if (meta.fileSize !== undefined)
		rows.push({
			label: i18n(I18nKey.photoFileSize),
			value: formatBytes(meta.fileSize),
		});
	// 分辨率优先用相册元数据，本地相册缺 width/height 时用解码后的实际尺寸兜底
	const width = photo.width ?? meta.width;
	const height = photo.height ?? meta.height;
	if (width && height) {
		rows.push({
			label: i18n(I18nKey.photoResolution),
			value: `${width} × ${height}`,
		});
		rows.push({
			label: i18n(I18nKey.photoPixels),
			value: `${((width * height) / 1_000_000).toFixed(2)} MP`,
		});
	}
	const dateTaken = meta.exif?.dateTaken
		? formatExifDate(meta.exif.dateTaken)
		: photo.date;
	if (dateTaken)
		rows.push({ label: i18n(I18nKey.photoDateTaken), value: dateTaken });
	if (meta.exif?.colorSpace)
		rows.push({
			label: i18n(I18nKey.photoColorSpace),
			value: meta.exif.colorSpace,
		});
	if (meta.exif?.software)
		rows.push({
			label: i18n(I18nKey.photoSoftware),
			value: meta.exif.software,
		});
	if (meta.exif?.artist)
		rows.push({ label: i18n(I18nKey.photoArtist), value: meta.exif.artist });
	if (photo.location)
		rows.push({ label: i18n(I18nKey.photoLocation), value: photo.location });
	if (photo.album)
		rows.push({ label: i18n(I18nKey.photoAlbum), value: photo.album });
	return rows;
});

const captureRows = $derived.by(() => {
	const rows: KVRow[] = [];
	const photo = current;
	const exif = meta.exif;
	if (!photo) return rows;
	const camera = exif?.camera || photo.camera;
	if (camera) rows.push({ label: i18n(I18nKey.photoCamera), value: camera });
	const lens = exif?.lens || photo.lens;
	if (lens) rows.push({ label: i18n(I18nKey.photoLens), value: lens });
	if (exif?.focalLength !== undefined)
		rows.push({
			label: i18n(I18nKey.photoFocal),
			value: `${Number(exif.focalLength.toFixed(1))} mm`,
		});
	if (exif?.focalLength35 !== undefined)
		rows.push({
			label: i18n(I18nKey.photoFocal35),
			value: `${Number(exif.focalLength35.toFixed(1))} mm`,
		});
	if (exif?.maxAperture !== undefined)
		rows.push({
			label: i18n(I18nKey.photoMaxAperture),
			value: `f/${exif.maxAperture}`,
		});
	if (exif?.fNumber !== undefined)
		rows.push({
			label: i18n(I18nKey.photoAperture),
			value: `f/${exif.fNumber}`,
		});
	if (exif?.exposureTime !== undefined)
		rows.push({
			label: i18n(I18nKey.photoExposureTime),
			value: formatExposureTime(exif.exposureTime),
		});
	if (exif?.iso !== undefined)
		rows.push({ label: i18n(I18nKey.photoISO), value: String(exif.iso) });
	if (exif?.exposureProgram)
		rows.push({
			label: i18n(I18nKey.photoExposureProgram),
			value: exif.exposureProgram,
		});
	if (exif?.meteringMode)
		rows.push({
			label: i18n(I18nKey.photoMetering),
			value: exif.meteringMode,
		});
	if (exif?.whiteBalance)
		rows.push({
			label: i18n(I18nKey.photoWhiteBalance),
			value: exif.whiteBalance,
		});
	if (exif?.flash)
		rows.push({ label: i18n(I18nKey.photoFlash), value: exif.flash });
	if (photo.settings)
		rows.push({ label: i18n(I18nKey.photoExposure), value: photo.settings });
	// GPS 坐标固定在拍摄参数最下面一行（度分秒，纬度在前经度在后）
	const coordinates = formatCoordinates(meta.exif);
	if (coordinates)
		rows.push({ label: i18n(I18nKey.photoCoordinates), value: coordinates });
	return rows;
});

function close() {
	onRequestClose?.();
}

// ------------------------------------------------------------ 丝滑切换

// 邻图预热 + 告知引擎邻图 src（翻页跟手拖拽用）
const preloaded = new Set<string>();

function preloadNeighbors() {
	if (!engine) return;
	const prev = photos[index - 1] ?? null;
	const next = photos[index + 1] ?? null;
	engine.updateNeighbors(
		prev?.src ?? null,
		next?.src ?? null,
		{
			prev: prev ? getThumbImage(prev) : undefined,
			next: next ? getThumbImage(next) : undefined,
		},
	);
	for (const neighbor of [prev, next]) {
		if (!neighbor || preloaded.has(neighbor.src)) continue;
		preloaded.add(neighbor.src);
		engine.preload(neighbor.src);
	}
	// 提前解码 ±2 张的缩略图：连续快滑时邻图纹理即取即用
	for (const photo of [photos[index - 2], photos[index + 2]]) {
		if (photo) getThumbImage(photo);
	}
}

// ------------------------------------------------------------ Live Photo

function stopLivePhoto() {
	if (!liveVideo) return;
	liveVideo.pause();
	try {
		liveVideo.currentTime = 0;
	} catch {
		/* 元数据未就绪 */
	}
	livePlaying = false;
}

function playLivePhoto() {
	const video = liveVideo;
	if (!video || !currentLiveVideo) return;
	video.muted = true;
	if (video.readyState < 2) video.load();
	try {
		video.currentTime = 0;
	} catch {
		/* 元数据未就绪 */
	}
	video.play().then(
		() => {
			livePlaying = true;
		},
		() => {
			// 自动播放被拒：延迟后重试一次
			setTimeout(() => {
				video.play().then(
					() => {
						livePlaying = true;
					},
					() => {},
				);
			}, 150);
		},
	);
}

function toggleLivePhoto() {
	if (livePlaying) {
		stopLivePhoto();
	} else {
		playLivePhoto();
	}
}

// 桌面悬浮徽章即播放；触屏设备 tap 走 click，pointerenter 不触发避免立即回停
function handleLiveBadgeEnter(event: PointerEvent) {
	if (event.pointerType !== "touch") playLivePhoto();
}

function handleLiveBadgeLeave(event: PointerEvent) {
	if (event.pointerType !== "touch") stopLivePhoto();
}

function goTo(next: number) {
	if (next < 0 || next >= photos.length || next === index) return;
	stopLivePhoto();
	if (loading) {
		// 旧画面已隐藏（上一次切换尚在加载）：直接交换
		applySwitch(next);
		return;
	}
	// 先淡出旧图（160ms），再交换并加载新图
	exiting = true;
	if (exitTimer !== null) clearTimeout(exitTimer);
	exitTimer = setTimeout(() => {
		exitTimer = null;
		exiting = false;
		applySwitch(next);
	}, SWITCH_EXIT_MS);
}

function applySwitch(next: number, skipLoad = false) {
	index = next;
	if (!skipLoad) loading = true;
	loadFailed = false;
	hintVisible = false;
	meta = {};
	progress = null;
	if (engine && !skipLoad) {
		engine
			.loadImage(photos[index].src)
			.catch(() => {
				loadFailed = true;
			})
			.finally(() => {
				loading = false;
			});
	}
	scrollStripToActive();
}

function cancelExit(): void {
	if (exitTimer !== null) {
		clearTimeout(exitTimer);
		exitTimer = null;
	}
	exiting = false;
}

const previous = () => {
	cancelExit();
	if (index - 1 >= 0 && engine?.pageTo(-1)) return;
	goTo(index - 1);
};

const next = () => {
	cancelExit();
	if (index + 1 < photos.length && engine?.pageTo(1)) return;
	goTo(index + 1);
};

// 缩略图条：当前项滚动到可视中心（chronoframe GalleryThumbnail 行为）
function scrollStripToActive() {
	if (!strip) return;
	const active = strip.querySelector<HTMLElement>("[data-active='true']");
	active?.scrollIntoView({
		inline: "center",
		block: "nearest",
		behavior: prefersReducedMotion() ? "auto" : "smooth",
	});
}

function handleStripWheel(event: WheelEvent) {
	if (!strip) return;
	event.preventDefault();
	strip.scrollLeft +=
		Math.abs(event.deltaX) > Math.abs(event.deltaY)
			? event.deltaX
			: event.deltaY;
}

// 直方图绘制：灰度打底 + RGB screen 混合（chronoframe Histogram 视觉），
// easeOutCubic 入场动画，reduced-motion 时直接画终帧
function drawHistogram(canvasEl: HTMLCanvasElement, histogram?: HistogramData) {
	const ctx = canvasEl.getContext("2d");
	if (!ctx) return;
	const dpr = window.devicePixelRatio || 1;
	const width = canvasEl.clientWidth || 288;
	const height = canvasEl.clientHeight || 112;
	canvasEl.width = Math.max(1, Math.round(width * dpr));
	canvasEl.height = Math.max(1, Math.round(height * dpr));
	ctx.scale(dpr, dpr);

	const drawBase = () => {
		ctx.fillStyle = "rgba(24, 24, 26, 0.65)";
		ctx.beginPath();
		if (typeof ctx.roundRect === "function") {
			ctx.roundRect(0.5, 0.5, width - 1, height - 1, 8);
		} else {
			ctx.rect(0.5, 0.5, width - 1, height - 1);
		}
		ctx.fill();

		ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
		ctx.lineWidth = 0.5;
		for (let i = 1; i <= 3; i++) {
			ctx.beginPath();
			ctx.moveTo(1, (height / 4) * i);
			ctx.lineTo(width - 1, (height / 4) * i);
			ctx.stroke();
		}
	};

	const drawBars = (
		data: number[],
		color: string,
		alpha: number,
		progress: number,
	) => {
		const barWidth = (width - 2) / data.length;
		for (let i = 0; i < data.length; i++) {
			const barHeight = (data[i] / maxCount) * (height - 2) * progress;
			if (barHeight <= 0) continue;
			const x = 1 + i * barWidth;
			const y = 1 + (height - 2) - barHeight;
			const w = Math.max(barWidth * 0.8, 1);
			const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
			gradient.addColorStop(0, `rgba(${color}, ${alpha})`);
			gradient.addColorStop(1, `rgba(${color}, ${alpha * 0.3})`);
			ctx.fillStyle = gradient;
			ctx.beginPath();
			if (typeof ctx.roundRect === "function") {
				ctx.roundRect(x, y, w, barHeight, [
					Math.min(w / 2, 2),
					Math.min(w / 2, 2),
					0,
					0,
				]);
			} else {
				ctx.rect(x, y, w, barHeight);
			}
			ctx.fill();
		}
	};

	const maxCount = histogram
		? Math.max(
				...histogram.red,
				...histogram.green,
				...histogram.blue,
				...histogram.gray,
			)
		: 0;

	const render = (progress: number) => {
		ctx.clearRect(0, 0, width, height);
		drawBase();
		if (!histogram || maxCount <= 0) return;
		drawBars(histogram.gray, "255, 255, 255", 0.4, progress);
		ctx.globalCompositeOperation = "screen";
		drawBars(histogram.red, "255, 98, 89", 0.8, progress);
		drawBars(histogram.green, "46, 209, 87", 0.8, progress);
		drawBars(histogram.blue, "59, 154, 255", 0.8, progress);
		ctx.globalCompositeOperation = "source-over";
	};

	if (prefersReducedMotion()) {
		render(1);
		return;
	}
	render(0);
	const startTime = Date.now();
	const tick = () => {
		const linear = Math.min((Date.now() - startTime) / 600, 1);
		render(1 - (1 - linear) ** 3);
		if (linear < 1) setTimeout(tick, 16);
	};
	tick();
}

$effect(() => {
	if (!root) return;
	for (const canvasEl of root.querySelectorAll<HTMLCanvasElement>(
		"[data-histogram-canvas]",
	)) {
		drawHistogram(canvasEl, meta.histogram);
	}
});

function handleKeydown(event: KeyboardEvent) {
	if (event.key === "Escape") {
		event.preventDefault();
		close();
		return;
	}
	if (!engine) return;
	if (event.key === "+" || event.key === "=") {
		event.preventDefault();
		engine.zoomIn(true);
	} else if (event.key === "-") {
		event.preventDefault();
		engine.zoomOut(true);
	} else if (event.key === "0") {
		event.preventDefault();
		engine.resetView();
	} else if (event.key === "ArrowLeft" && hasMultiple) {
		event.preventDefault();
		previous();
	} else if (event.key === "ArrowRight" && hasMultiple) {
		event.preventDefault();
		next();
	}
}

onMount(() => {
	previousFocus = document.activeElement as HTMLElement | null;
	previousOverflow = document.body.style.overflow;
	document.body.style.overflow = "hidden";
	window.addEventListener("keydown", handleKeydown);
	// 查看器挂在 #swup-container 之外的 body 上：Swup 换页（如后退）时自关，
	// 避免覆盖层残留到新页面
	document.addEventListener("swup:content:replace", close);

	const mobileQuery = window.matchMedia("(max-width: 767px)");
	const syncMobile = () => {
		isMobile = mobileQuery.matches;
	};
	syncMobile();
	mobileQuery.addEventListener("change", syncMobile);

	// 操作提示：首次打开短暂显示
	hintVisible = true;
	const hintTimer = setTimeout(() => {
		hintVisible = false;
	}, 3000);

	if (canvas) {
		try {
			engine = new WebGLImageViewerEngine(
				canvas,
				{ animationTime: prefersReducedMotion() ? 0 : 250 },
				{
					onLoadChange: (isLoading, hasError) => {
						loading = isLoading;
						if (hasError) loadFailed = true;
						if (!isLoading && !hasError) preloadNeighbors();
					},
					onProgress: (loaded, total) => {
						progress = { loaded, total };
					},
					// 翻页拖拽提交：committed 时引擎已把邻图显示在画布上，只更新索引
					// 并静默升级全分辨率；否则走普通加载路径（快速轻扫早于解码完成）
					onPageChange: (direction, committed) => {
						const target = index + direction;
						if (target < 0 || target >= photos.length) return;
						applySwitch(target, committed);
						if (committed) engine?.refreshCurrent(photos[target].src);
						preloadNeighbors();
					},
					// 移动端未放大时单指左右滑动切换照片
					onSwipe: (direction) => {
						if (direction === "left") {
							next();
						} else {
							previous();
						}
					},
					onMetadata: (value) => {
						meta = value;
					},
				},
			);
			// 挂载即告知邻图：首图尚未加载完成时也能翻页跟手切换
			preloadNeighbors();
			engine
				.loadImage(photos[index].src)
				.catch(() => {
					loadFailed = true;
				})
				.finally(() => {
					loading = false;
				});
		} catch {
			loadFailed = true;
			loading = false;
		}
	}

	return () => {
		window.removeEventListener("keydown", handleKeydown);
		document.removeEventListener("swup:content:replace", close);
		mobileQuery.removeEventListener("change", syncMobile);
		clearTimeout(hintTimer);
		engine?.destroy();
		engine = null;
		document.body.style.overflow = previousOverflow;
		previousFocus?.focus();
	};
});
</script>

	{#snippet infoBody()}
		{#if current?.description}
			<p class="text-justify text-sm text-white/90">{current.description}</p>
		{/if}
		{#if basicRows.length > 0}
			<section aria-label={i18n(I18nKey.photoBasicInfo)}>
				<h4 class="mb-2 text-sm font-medium tracking-wide uppercase">{i18n(I18nKey.photoBasicInfo)}</h4>
				<dl>
					{#each basicRows as row (row.label)}
						<div class="flex items-start justify-between gap-3 border-b border-white/5 py-1.5 last:border-b-0">
							<dt class="shrink-0 text-xs text-white/60">{row.label}</dt>
							<dd class="text-right text-xs break-all whitespace-pre-line">{row.value}</dd>
						</div>
					{/each}
				</dl>
			</section>
		{/if}
		{#if captureRows.length > 0}
			<section aria-label={i18n(I18nKey.photoCaptureParams)}>
				<h4 class="mb-2 text-sm font-medium tracking-wide uppercase">{i18n(I18nKey.photoCaptureParams)}</h4>
				<dl>
					{#each captureRows as row (row.label)}
						<div class="flex items-start justify-between gap-3 border-b border-white/5 py-1.5 last:border-b-0">
							<dt class="shrink-0 text-xs text-white/60">{row.label}</dt>
							<dd class="text-right text-xs break-all">{row.value}</dd>
						</div>
					{/each}
				</dl>
			</section>
		{/if}
		<section aria-label={i18n(I18nKey.photoHistogram)}>
			<h4 class="mb-2 text-sm font-medium tracking-wide uppercase">{i18n(I18nKey.photoHistogram)}</h4>
			<canvas data-histogram-canvas class="h-28 w-full rounded-lg"></canvas>
		</section>
		{#if current?.tags?.length}
			<section aria-label={i18n(I18nKey.tags)}>
				<h4 class="mb-2 text-sm font-medium tracking-wide uppercase">{i18n(I18nKey.tags)}</h4>
				<div class="flex flex-wrap gap-1.5">
					{#each current.tags as tag (tag)}
						<span class="rounded-[var(--shape-corner-s)] bg-white/10 px-2 py-0.5 text-xs text-white/90">#{tag}</span>
					{/each}
				</div>
			</section>
		{/if}
	{/snippet}


<div bind:this={root} class="fixed inset-0 z-[90] bg-[rgb(0_0_0_/_0.9)] backdrop-blur-lg" role="dialog" aria-modal="true" aria-label={i18n(I18nKey.imageViewer)}>
	<div class="flex h-full w-full">
		<!-- 主区域：画布舞台 + 缩略图条 -->
		<div class="flex min-w-0 flex-1 flex-col">
				<div class="group relative min-h-0 flex-1 overflow-hidden">
					<!-- 画布层：切换时旧图淡出退场；加载期间由引擎渲染缩略图预览，
						翻页拖拽全程在画布内跟手。按下时停掉 Live Photo 播放 -->
					<div
						onpointerdown={stopLivePhoto}
						class={`absolute inset-0 transition-opacity duration-150 ease-[var(--m3e-easing-standard)] motion-reduce:transition-none ${exiting ? "opacity-0" : "opacity-100"}`}
					>
						<canvas
							bind:this={canvas}
							class="absolute inset-0 h-full w-full cursor-grab touch-none outline-none active:cursor-grabbing"
							role="img"
							aria-label={current?.alt || i18n(I18nKey.imageViewer)}
						></canvas>
					</div>


				<!-- Live Photo 视频层：播放时淡入覆盖在 canvas 上，结束后淡回静态图 -->
				{#if currentLiveVideo}
					<video
						bind:this={liveVideo}
						src={currentLiveVideo}
						muted
						playsinline
						preload="metadata"
						disablepictureinpicture
						aria-hidden="true"
						class={`pointer-events-none absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ease-[var(--m3e-easing-standard)] ${livePlaying ? "opacity-100" : "opacity-0"}`}
						onended={stopLivePhoto}
					></video>
				{/if}

				{#if loading || loadFailed}
					<!-- 加载指示：右下角 + 取图进度（图片覆盖层可读性例外：固定黑底玻璃） -->
					<div
						class="absolute right-4 bottom-4 flex items-center gap-2 rounded-[var(--shape-corner-full)] bg-black/55 px-3.5 py-2 text-white backdrop-blur-sm"
						style="font: var(--m3e-type-body-medium)"
						aria-live="polite"
					>
						{#if loadFailed}
							<Icon icon="material-symbols:error-outline-rounded" aria-hidden="true" class="h-5 w-5" />
							<span>{i18n(I18nKey.imageLoadFailed)}</span>
						{:else}
							<span class="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true"></span>
							<span class="tabular-nums">{progressText}</span>
						{/if}
					</div>
				{/if}

				<!-- 顶部工具栏（图片覆盖层可读性例外：固定黑底玻璃） -->
				<div class="absolute inset-x-0 top-0 flex items-center justify-between gap-3 p-3 text-white">
					<div class="flex min-w-0 items-center gap-1.5">
						{#if hasMultiple}
							<span class="shrink-0 rounded-[var(--shape-corner-full)] bg-black/35 px-3 py-1.5 text-sm font-medium backdrop-blur-sm">
								{index + 1} / {photos.length}
							</span>
						{/if}
						{#if currentLiveVideo}
							<button
								type="button"
								class={`flex shrink-0 items-center gap-1 rounded-[var(--shape-corner-full)] px-3 py-1.5 text-sm font-medium backdrop-blur-sm transition-colors duration-[var(--m3e-duration-short)] ${livePlaying ? "bg-white/25" : "bg-black/35 hover:bg-black/55"} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white`}
								aria-label={i18n(I18nKey.playLivePhoto)}
								aria-pressed={livePlaying}
								onpointerenter={handleLiveBadgeEnter}
								onpointerleave={handleLiveBadgeLeave}
								onclick={toggleLivePhoto}
							>
								<Icon icon="material-symbols:motion-photos-on-rounded" aria-hidden="true" class="h-4 w-4" />
								<span>{i18n(I18nKey.livePhoto)}</span>
							</button>
						{/if}
					</div>
					<div class="flex items-center gap-1.5">
						<button type="button" class="grid h-10 w-10 place-items-center rounded-[var(--shape-corner-full)] bg-black/35 backdrop-blur-sm transition-colors duration-[var(--m3e-duration-short)] hover:bg-black/55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" aria-label={i18n(I18nKey.zoomIn)} onclick={() => engine?.zoomIn(true)}>
							<Icon icon="material-symbols:zoom-in-rounded" aria-hidden="true" class="h-[1.375rem] w-[1.375rem]" />
						</button>
						<button type="button" class="grid h-10 w-10 place-items-center rounded-[var(--shape-corner-full)] bg-black/35 backdrop-blur-sm transition-colors duration-[var(--m3e-duration-short)] hover:bg-black/55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" aria-label={i18n(I18nKey.zoomOut)} onclick={() => engine?.zoomOut(true)}>
							<Icon icon="material-symbols:zoom-out-rounded" aria-hidden="true" class="h-[1.375rem] w-[1.375rem]" />
						</button>
						<button type="button" class="grid h-10 w-10 place-items-center rounded-[var(--shape-corner-full)] bg-black/35 backdrop-blur-sm transition-colors duration-[var(--m3e-duration-short)] hover:bg-black/55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" aria-label={i18n(I18nKey.resetView)} onclick={() => engine?.resetView()}>
							<Icon icon="material-symbols:fit-screen-rounded" aria-hidden="true" class="h-[1.375rem] w-[1.375rem]" />
						</button>
						{#if isMobile}
							<button type="button" class={`grid h-10 w-10 place-items-center rounded-[var(--shape-corner-full)] backdrop-blur-sm transition-colors duration-[var(--m3e-duration-short)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${showInfo ? "bg-black/15" : "bg-black/60"}`} aria-label={i18n(I18nKey.viewerInfo)} onclick={() => (showInfo = !showInfo)}>
								<Icon icon="material-symbols:info-rounded" aria-hidden="true" class="h-[1.375rem] w-[1.375rem]" />
							</button>
						{/if}
						<button bind:this={closeButton} type="button" class="grid h-10 w-10 place-items-center rounded-[var(--shape-corner-full)] bg-black/35 backdrop-blur-sm transition-colors duration-[var(--m3e-duration-short)] hover:bg-black/55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" aria-label={i18n(I18nKey.close)} onclick={close}>
							<Icon icon="material-symbols:close-rounded" aria-hidden="true" class="h-[1.375rem] w-[1.375rem]" />
						</button>
					</div>
				</div>

				<!-- 桌面端左右切换 -->
				{#if hasMultiple}
					{#if index > 0}
						<button type="button" class="absolute top-1/2 left-3 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-[var(--shape-corner-full)] bg-black/30 text-white opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100 hover:bg-black/45 focus-visible:opacity-100" aria-label={i18n(I18nKey.previousImage)} onclick={previous}>
							<Icon icon="material-symbols:chevron-left-rounded" aria-hidden="true" class="h-6 w-6" />
						</button>
					{/if}
					{#if index < photos.length - 1}
						<button type="button" class="absolute top-1/2 right-3 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-[var(--shape-corner-full)] bg-black/30 text-white opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100 hover:bg-black/45 focus-visible:opacity-100" aria-label={i18n(I18nKey.nextImage)} onclick={next}>
							<Icon icon="material-symbols:chevron-right-rounded" aria-hidden="true" class="h-6 w-6" />
						</button>
					{/if}
				{/if}

				<!-- 操作提示 -->
				{#if hintVisible && !loadFailed}
					<div class="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-lg border border-white/10 bg-black/50 px-2.5 py-1 text-xs font-bold text-white shadow-xl">
						{i18n(I18nKey.viewerZoomHint)}
					</div>
				{/if}
			</div>

			<!-- 底部缩略图切换条 -->
			{#if hasMultiple}
				<div class="shrink-0 border-t border-white/10 bg-black/30 backdrop-blur-xl" bind:this={strip} onwheel={handleStripWheel}>
					<div class="flex gap-2 overflow-x-auto p-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
						{#each photos as photo, i (photo.src + i)}
							<button
								type="button"
								data-active={i === index}
								class={`relative aspect-square w-12 shrink-0 overflow-hidden rounded-[var(--shape-corner-s)] border-2 transition-all duration-200 md:w-16 ${
									i === index
										? "scale-110 border-white shadow-lg"
										: "border-white/20 grayscale-[35%] hover:border-white/40 hover:grayscale-0"
								}`}
								aria-label={photo.title || photo.alt}
								aria-current={i === index}
								onclick={() => goTo(i)}
							>
								<img src={photo.thumbnail || photo.src} alt="" class="absolute inset-0 h-full w-full object-cover" loading="lazy" referrerpolicy="no-referrer" />
							</button>
						{/each}
					</div>
				</div>
			{/if}
		</div>



		<!-- 右侧信息栏（桌面端常驻） -->
		<aside class="hidden w-80 shrink-0 flex-col border-l border-white/10 bg-black/30 backdrop-blur-xl text-white md:flex" aria-label={i18n(I18nKey.viewerInfo)}>
			<div class="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
				<h3 class="line-clamp-1 font-black">{current?.title || current?.alt}</h3>
			</div>
			<div class="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 [scrollbar-width:thin]">
				{@render infoBody()}
			</div>
		</aside>
	</div>

	<!-- 移动端信息底部片 -->
	{#if showInfo && isMobile}
		<div class="fixed inset-x-2 bottom-2 z-20 flex max-h-[70vh] flex-col rounded-[var(--shape-corner-l)] border border-white/10 bg-black/50 backdrop-blur-xl text-white" role="region" aria-label={i18n(I18nKey.viewerInfo)}>
			<div class="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
				<h3 class="line-clamp-1 font-black">{current?.title || current?.alt}</h3>
				<button type="button" class="grid h-8 w-8 place-items-center rounded-[var(--shape-corner-full)] hover:bg-white/10" aria-label={i18n(I18nKey.close)} onclick={() => (showInfo = false)}>
					<Icon icon="material-symbols:close-rounded" aria-hidden="true" class="h-5 w-5" />
				</button>
			</div>
			<div class="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
				{@render infoBody()}
			</div>
		</div>
	{/if}
</div>

<style lang="stylus">
/* 进场与 spinner 动画走 token；布局全部由 Tailwind 工具类承担 */
.webgl-viewer-root > :global(div)
	animation: webgl-viewer-in var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate)

:global(html.motion-reduced) .webgl-viewer-root > :global(div)
	animation: none

@media (prefers-reduced-motion: reduce)
	.webgl-viewer-root > :global(div)
		animation: none

@keyframes webgl-viewer-in
	from
		opacity: 0
	to
		opacity: 1
</style>
