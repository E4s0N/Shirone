<script lang="ts">
/**
 * 照片瀑布流（molecule）— 参照 chronoframe 首页的紧凑瀑布流展示：
 * 窄列距、原始纵横比、悬停浮现标题/日期/地点/相机信息，点击回调打开查看器。
 * 纯展示组件：不查询集合、不做路由跳转，打开查看器由调用方（organism）决定。
 */
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import Icon from "@iconify/svelte";
import LivePhotoOverlay from "@components/molecules/LivePhotoOverlay.svelte";
import type { WallPhoto } from "@/types/album";

let {
	photos = [] as WallPhoto[],
	onOpen,
}: {
	photos?: WallPhoto[];
	onOpen?: (index: number) => void;
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

function photoRatio(photo: WallPhoto): number | undefined {
	if (photo.width && photo.height) return photo.width / photo.height;
	return measuredRatios[photo.id];
}

function rememberNaturalRatio(photo: WallPhoto, event: Event) {
	if (photo.width && photo.height) return;
	const image = event.currentTarget as HTMLImageElement;
	if (!image.naturalWidth || !image.naturalHeight) return;
	measuredRatios[photo.id] = image.naturalWidth / image.naturalHeight;
}

function ratioStyle(photo: WallPhoto): string {
	const value = photoRatio(photo);
	return value === undefined ? "4 / 3" : String(value);
}
</script>

<div class="photo-wall" role="list" aria-label={i18n(I18nKey.imageViewer)}>
	{#each photos as photo, index (photo.id)}
		<div class="photo-wall__item" role="listitem" style={`--photo-delay: ${Math.min(index, 11) * 40}ms`}>
			<button
				type="button"
				class="group block w-full cursor-zoom-in overflow-hidden rounded-[var(--shape-corner-s)] bg-[var(--surface-container-high)] text-start"
				aria-label={`${i18n(I18nKey.openImage)}: ${photo.alt}`}
				onmouseenter={photo.liveVideo ? () => hoverLivePhoto(index) : undefined}
				onmouseleave={photo.liveVideo ? unhoverLivePhoto : undefined}
				onclick={() => onOpen?.(index)}
			>
				<span class="relative block w-full" style={`aspect-ratio: ${ratioStyle(photo)}`}>
					<img
						src={photo.thumbnail || photo.src}
						alt={photo.alt}
						width={photo.width}
						height={photo.height}
						loading="lazy"
						decoding="async"
						referrerpolicy="no-referrer"
						class="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-[var(--m3e-easing-standard)] group-hover:scale-[1.03]"
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
					<!-- 悬停信息浮层（图片覆盖层可读性例外：黑色渐变） -->
					<span class="pointer-events-none absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-black/70 to-transparent p-3 text-white opacity-0 transition-all duration-300 ease-[var(--m3e-easing-emphasized-decelerate)] group-hover:translate-y-0 group-hover:opacity-100">
						<span class="line-clamp-1 block text-sm font-medium">{photo.title || photo.alt}</span>
						{#if photo.date || photo.location || photo.album}
							<span class="mt-0.5 block text-xs opacity-85">
								{#if photo.date}{photo.date}{/if}
								{#if photo.location}{photo.date ? " · " : ""}{photo.location}{/if}
								{#if photo.album}{photo.date || photo.location ? " · " : ""}{photo.album}{/if}
							</span>
						{/if}
						{#if photo.camera}
							<span class="mt-1 flex items-center gap-1 text-xs opacity-70">
								<Icon icon="material-symbols:photo-camera-outline-rounded" aria-hidden="true" class="h-3.5 w-3.5" />
								<span class="line-clamp-1">{photo.camera}</span>
							</span>
						{/if}
					</span>
				</span>
			</button>
		</div>
	{/each}
</div>

<style lang="stylus">
.photo-wall
	column-width: 15rem
	column-gap: 0.5rem

	&__item
		break-inside: avoid
		margin-bottom: 0.5rem
		animation: photo-wall-in var(--m3e-duration-long) var(--m3e-easing-emphasized-decelerate) both
		animation-delay: var(--photo-delay)

:global(html.motion-reduced) .photo-wall__item
	animation: none

@media (max-width: 47.99rem)
	.photo-wall
		column-width: 10rem

@media (prefers-reduced-motion: reduce)
	.photo-wall__item
		animation: none

@keyframes photo-wall-in
	from
		opacity: 0
		transform: translateY(0.5rem)
	to
		opacity: 1
		transform: translateY(0)
</style>
