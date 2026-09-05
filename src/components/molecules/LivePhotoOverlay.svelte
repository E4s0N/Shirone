<script lang="ts">
/**
 * Live Photo 悬浮播放层（molecule）— 参照 chronoframe 小图 Live Photo 的播放方式：
 * active 时静音重播配对视频，播完淡回静态图；覆盖层与图片同尺寸对齐。
 * 纯展示组件：播放时机（悬浮/长按/徽章点击）由父级决定，自身只响应 active。
 */
let {
	src,
	active,
}: {
	src: string;
	active: boolean;
} = $props();

let video: HTMLVideoElement | undefined = $state();
let ended = $state(false);

$effect(() => {
	const el = video;
	if (!el) return;
	if (active) {
		ended = false;
		el.muted = true;
		if (el.readyState < 2) el.load();
		try {
			el.currentTime = 0;
		} catch {
			/* 元数据未就绪 */
		}
		el.play().catch(() => {});
	} else {
		el.pause();
		try {
			el.currentTime = 0;
		} catch {
			/* 元数据未就绪 */
		}
	}
});
</script>

<video
	bind:this={video}
	{src}
	muted
	playsinline
	preload="metadata"
	disablepictureinpicture
	aria-hidden="true"
	class={`pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ease-[var(--m3e-easing-standard)] ${active && !ended ? "opacity-100" : "opacity-0"}`}
	onended={() => (ended = true)}
></video>
