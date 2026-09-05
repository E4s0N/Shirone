<script lang="ts">
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import Icon from "@iconify/svelte";
import LivePhotoOverlay from "@components/molecules/LivePhotoOverlay.svelte";
import type { AlbumLayout, AlbumPhoto } from "@/types/album";

let {
	photos = [] as AlbumPhoto[],
	layout = "masonry" as AlbumLayout,
	columns = 3,
	albumTitle = "",
}: {
	photos?: AlbumPhoto[];
	layout?: AlbumLayout;
	columns?: 2 | 3 | 4;
	/** 所属相册标题，透传给查看器信息栏 */
	albumTitle?: string;
} = $props();

let measuredRatios = $state<Record<string, number>>({});

// Live Photo 悬浮播放：进入即播，离开延迟 150ms 回退（快速扫过不闪烁）
let liveHoverIndex = $state<number | null>(null);
let liveLeaveTimer: ReturnType<typeof setTimeout> | undefined;

function hoverLivePhoto(index: number) {
	clearTimeout(liveLeaveTimer);
	liveHoverIndex = index;
}

function unhoverLivePhoto() {
	clearTimeout(liveLeaveTimer);
	liveLeaveTimer = setTimeout(() => (liveHoverIndex = null), 150);
}

function photoRatio(photo: AlbumPhoto): number | undefined {
	if (photo.width && photo.height) return photo.width / photo.height;
	return measuredRatios[photo.id];
}

function orientationPriority(photo: AlbumPhoto): number {
	// Only authoritative metadata may affect ordering; measured image ratios arrive
	// asynchronously and must not reshuffle an already rendered masonry grid.
	const value =
		photo.width && photo.height ? photo.width / photo.height : undefined;
	if (value === undefined || value === 1) return 1;
	return value < 1 ? 0 : 2;
}

const visiblePhotos = $derived.by(() => {
	if (layout !== "masonry") return photos;
	return photos
		.map((photo, index) => ({ photo, index }))
		.sort(
			(a, b) =>
				orientationPriority(a.photo) - orientationPriority(b.photo) ||
				a.index - b.index,
		)
		.map(({ photo }) => photo);
});

function rememberNaturalRatio(photo: AlbumPhoto, event: Event) {
	if (photo.width && photo.height) return;
	const image = event.currentTarget as HTMLImageElement;
	if (!image.naturalWidth || !image.naturalHeight) return;
	measuredRatios[photo.id] = image.naturalWidth / image.naturalHeight;
}

function openPhoto(event: MouseEvent, photo: AlbumPhoto) {
	event.preventDefault();
	event.stopPropagation();
	// 整册照片传入查看器：底部缩略图切换 + 右侧信息栏；
	// WebGL 查看器按需动态加载（组件+引擎 chunk 仅在首次点击时拉取），
	// WebGL 不可用时由 opener 回退 Fancybox。
	const startIndex = visiblePhotos.indexOf(photo);
	void import("@utils/webgl-viewer/opener").then(({ openWebGLViewer }) =>
		openWebGLViewer({
			photos: photos.map((item) => ({
				...item,
				album: albumTitle || undefined,
			})),
			startIndex: startIndex >= 0 ? startIndex : 0,
		}),
	);
}

function ratio(photo: AlbumPhoto): string {
	const value = photoRatio(photo);
	return value === undefined ? "4 / 3" : String(value);
}
</script>

{#if visiblePhotos.length > 0}
			<div
				class="album-gallery album-gallery--{layout}"
				style={`--album-columns: ${columns}`}
				role="list"
				aria-label={i18n(I18nKey.imageViewer)}
			>
		{#each visiblePhotos as photo, index (photo.id)}
			<button
				type="button"
					class="album-gallery__item"
					style={`--album-photo-ratio: ${ratio(photo)}`}
					aria-label={`${i18n(I18nKey.openImage)} ${index + 1}: ${photo.alt}`}
						onclick={(event) => openPhoto(event, photo)}
					onmouseenter={photo.liveVideo ? () => hoverLivePhoto(index) : undefined}
					onmouseleave={photo.liveVideo ? unhoverLivePhoto : undefined}
				>
					<img
					src={photo.thumbnail || photo.src}
						alt={photo.alt}
						width={photo.width}
						height={photo.height}
						loading="lazy"
					decoding="async"
					referrerpolicy="no-referrer"
					onload={(event) => rememberNaturalRatio(photo, event)}
					/>
					{#if photo.liveVideo}
						<LivePhotoOverlay
							src={photo.liveVideo}
							active={liveHoverIndex === index}
						/>
						<!-- Live Photo 标识 -->
						<span
							class="absolute top-2 right-2 grid h-6 w-6 place-items-center rounded-[var(--shape-corner-full)] bg-black/45 text-white backdrop-blur-sm"
							aria-label={i18n(I18nKey.livePhoto)}
						>
							<Icon icon="material-symbols:motion-photos-on-rounded" aria-hidden="true" class="h-3.5 w-3.5" />
						</span>
					{/if}
				</button>
		{/each}
	</div>
{:else}
	<div class="album-gallery__empty">
		<Icon icon="material-symbols:photo-library-outline-rounded" aria-hidden="true" />
		<span>{i18n(I18nKey.noData)}</span>
	</div>
{/if}

<style lang="stylus">
.album-gallery
	--album-gap: var(--m3e-space-3, 0.75rem)
	width: 100%

	&--grid
		display: grid
		grid-template-columns: repeat(var(--album-columns), minmax(0, 1fr))
		gap: var(--album-gap)

	&--masonry
		direction: ltr
		column-width: 240px
		column-gap: var(--album-gap)
		column-fill: balance

	&__item
		position: relative
		display: block
		width: 100%
		margin: 0 0 var(--album-gap)
		padding: 0
		overflow: hidden
		border: 0
		border-radius: var(--shape-corner-m)
		background: var(--surface-container-high)
		color: inherit
		cursor: zoom-in
		break-inside: avoid
		font: inherit
		text-align: start
		&:focus-visible
			outline: 2px solid var(--primary)
			outline-offset: 2px
		> img
			display: block
			width: 100%
			max-width: 100%
			aspect-ratio: var(--album-photo-ratio)
			object-fit: cover
			transition: transform var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate), filter var(--m3e-duration-medium) var(--m3e-easing-standard)
		.album-gallery--masonry & > img
			aspect-ratio: auto
			object-fit: cover

	&__item:hover > img
		transform: scale(1.025)
		filter: brightness(0.92)

	&__empty
		display: grid
		place-items: center
		gap: 0.5rem
		min-height: 12rem
		color: var(--on-surface-variant)
		font: var(--m3e-type-body-medium)
		> :global(svg)
			width: 2rem
			height: 2rem

@media (max-width: 47.99rem)
	.album-gallery--masonry
		column-width: 180px

@media (max-width: 29.99rem)
	.album-gallery--masonry
		column-width: 140px
	.album-gallery--grid
		grid-template-columns: repeat(2, minmax(0, 1fr))

:global(html.motion-reduced) .album-gallery__item > img
	transition: none

@media (prefers-reduced-motion: reduce)
	.album-gallery__item > img
		transition: none
</style>
