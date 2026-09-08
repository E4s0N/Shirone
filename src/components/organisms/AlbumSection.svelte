<script lang="ts">
import Chips from "@components/atoms/action/Chips.svelte";
import Card from "@components/atoms/display/Card.svelte";
import IconButton from "@components/atoms/action/IconButton.svelte";
import LoadingIndicator from "@components/atoms/feedback/LoadingIndicator.svelte";
import TextField from "@components/atoms/input/TextField.svelte";
import SegmentedButton from "@components/atoms/selection/SegmentedButton.svelte";
import AlbumCard from "@components/molecules/AlbumCard.svelte";
import PageHeader from "@components/molecules/PageHeader.svelte";
import PhotoMasonry from "@components/molecules/PhotoMasonry.svelte";
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import Icon from "@iconify/svelte";
import { openWebGLViewer } from "@utils/webgl-viewer/opener";
import { onMount } from "svelte";
import type { AlbumIndexItem, WallPhoto } from "@/types/album";

let {
	albums = [] as AlbumIndexItem[],
	photos = [] as WallPhoto[],
}: {
	albums?: AlbumIndexItem[];
	photos?: WallPhoto[];
} = $props();

/** 视图模式：「所有图片」瀑布流 /「相册」卡片列表；
 * 初始值与切换均与 category-bar 的模式切换同步（albums:mode 事件 + ?mode= 参数） */
let mode = $state<"photos" | "albums">("photos");

let query = $state("");
let selectedTag = $state("");
let sortBy = $state<"date" | "name" | "size">("date");
let sortAsc = $state(false);
let initialized = false;
type FilterPhase = "idle" | "loading" | "out";
let phase = $state<FilterPhase>("idle");
let phaseTimers: ReturnType<typeof setTimeout>[] = [];

const tagItems = $derived(
	Array.from(new Set(albums.flatMap((album) => album.tags)))
		.sort((a, b) => a.localeCompare(b))
		.map((tag) => ({ value: tag, label: tag })),
);

const filtered = $derived.by(() => {
	const normalized = query.trim().toLowerCase();
	const filteredAlbums = albums.filter((album) => {
		if (selectedTag && !album.tags.includes(selectedTag)) return false;
		if (!normalized) return true;
		return [album.title, album.description, album.location, ...album.tags]
			.join(" ")
			.toLowerCase()
			.includes(normalized);
	});
	return [...filteredAlbums].sort((a, b) => {
		let cmp = 0;
		if (sortBy === "date") cmp = (a.date || "").localeCompare(b.date || "");
		else if (sortBy === "name") cmp = a.title.localeCompare(b.title);
		else if (sortBy === "size") cmp = a.photoCount - b.photoCount;
		return sortAsc ? cmp : -cmp;
	});
});

const sortedPhotos = $derived.by(() => {
	return [...photos].sort((a, b) => {
		let cmp = 0;
		if (sortBy === "date") cmp = (a.date || "").localeCompare(b.date || "");
		else if (sortBy === "name") cmp = (a.alt || "").localeCompare(b.alt || "");
		// WallPhoto 没有 size 字段，按 date 降序作为默认
		return sortAsc ? cmp : -cmp;
	});
});

function onTagChange() {
	phaseTimers.forEach(clearTimeout);
	phase = "loading";
	phaseTimers = [
		setTimeout(() => (phase = "out"), 300),
		setTimeout(() => (phase = "idle"), 450),
	];
}

function openPhoto(index: number) {
	// WebGL 查看器按需动态加载（组件+引擎 chunk 仅在首次点击时拉取）；
	// WebGL 不可用时由 opener 回退 Fancybox。
	void openWebGLViewer({ photos, startIndex: index });
}

function syncUrl() {
	const params = new URLSearchParams(window.location.search);
	if (mode === "photos") params.delete("mode");
	else params.set("mode", "albums");
	params.delete("q");
	params.delete("albumTag");
	params.delete("sort");
	params.delete("order");
	if (query.trim()) params.set("q", query.trim());
	if (selectedTag) params.set("albumTag", selectedTag);
	if (sortBy !== "date") params.set("sort", sortBy);
	if (sortAsc) params.set("order", "asc");
	const search = params.toString();
	history.replaceState(
		null,
		"",
		search ? `?${search}` : window.location.pathname,
	);
}

$effect(() => {
	if (!initialized) return;
	syncUrl();
});

onMount(() => {
	const params = new URLSearchParams(window.location.search);
	mode = params.get("mode") === "albums" ? "albums" : "photos";
	query = params.get("q") || "";
	selectedTag = params.get("albumTag") || "";
	const sortParam = params.get("sort");
	if (sortParam === "name" || sortParam === "size") sortBy = sortParam;
	sortAsc = params.get("order") === "asc";
	initialized = true;

	// category-bar（持久外壳）模式切换按钮 → 本组件
	const onModeChange = (event: Event) => {
		const detail = (event as CustomEvent<{ mode: "photos" | "albums" }>).detail;
		if (detail?.mode && detail.mode !== mode) mode = detail.mode;
	};
	document.addEventListener("albums:mode", onModeChange);
	return () => {
		document.removeEventListener("albums:mode", onModeChange);
		phaseTimers.forEach(clearTimeout);
	};
});
</script>

<Card color="var(--card-bg)" radius="l" class="album-section px-8 py-6">
	<PageHeader
		icon="material-symbols:photo-library-outline-rounded"
		title={mode === "albums" ? i18n(I18nKey.albums) : ""}
		subtitle=""
	/>

	<!-- 排序工具栏 -->
	<div class="album-section__sort">
		<SegmentedButton
			bind:value={sortBy}
			label={i18n(I18nKey.albumsSortBy)}
			options={[
				{ value: "date", label: i18n(I18nKey.albumsSortDate) },
				{ value: "name", label: i18n(I18nKey.albumsSortName) },
				{ value: "size", label: i18n(I18nKey.albumsSortSize) },
			]}
		/>
		<IconButton
			variant="outlined"
			icon={sortAsc ? "material-symbols:keyboard-arrow-up-rounded" : "material-symbols:keyboard-arrow-down-rounded"}
			label={sortAsc ? i18n(I18nKey.albumsSortDesc) : i18n(I18nKey.albumsSortAsc)}
			onclick={() => (sortAsc = !sortAsc)}
		/>
	</div>

	{#if mode === "photos"}
		{#if sortedPhotos.length > 0}
			<p class="album-section__count album-section__count--wall" aria-live="polite">
				{sortedPhotos.length} {i18n(I18nKey.albumsPhotos)}
			</p>
			<PhotoMasonry photos={sortedPhotos} onOpen={openPhoto} />
		{:else}
			<div class="album-section__empty">
				<Icon icon="material-symbols:photo-library-outline-rounded" aria-hidden="true" />
				<span>{i18n(I18nKey.noData)}</span>
			</div>
		{/if}
	{:else}
		{#if albums.length > 0}
			<div class="album-section__tools">
				<div class="album-section__search">
					<TextField
						type="search"
						bind:value={query}
						placeholder={i18n(I18nKey.search)}
						label={i18n(I18nKey.search)}
						hideLabel
						variant="outlined"
						class="!rounded-(--shape-corner-l)"
					>
						<Icon slot="leading" icon="material-symbols:search-rounded" aria-hidden="true" />
					</TextField>
					{#if query}
						<button
							type="button"
							class="album-section__clear"
							aria-label={i18n(I18nKey.clear)}
							onclick={() => (query = "")}
						>
							<Icon icon="material-symbols:close-rounded" aria-hidden="true" />
						</button>
					{/if}
				</div>
				{#if tagItems.length > 0}
					<Chips items={tagItems} variant="filter" bind:value={selectedTag} onchange={onTagChange} />
				{/if}
				<p class="album-section__count" aria-live="polite">
					{filtered.length} {i18n(I18nKey.albumsCounts)}
				</p>
			</div>
		{/if}

		{#if phase !== "idle"}
			<div class="album-section__loading" class:album-section__loading--out={phase === "out"}>
				<LoadingIndicator contained size={64} />
			</div>
		{:else if filtered.length > 0}
			<div class="album-section__grid">
				{#each filtered as album, index (album.id)}
					<div class="album-section__item" style={`--album-delay: ${Math.min(index, 7) * 45}ms`}>
						<AlbumCard {album} />
					</div>
				{/each}
			</div>
		{:else}
			<div class="album-section__empty">
				<Icon icon="material-symbols:search-off-rounded" aria-hidden="true" />
				<span>{i18n(I18nKey.albumsNoResults)}</span>
			</div>
		{/if}
	{/if}
</Card>

<style lang="stylus">
.album-section
	display: block
	&__sort
		display: flex
		align-items: center
		gap: 0.75rem
		padding-bottom: 1rem
		border-bottom: 1px solid var(--outline-variant)
		margin-bottom: 1rem
		:global(.m3-segmented)
			flex: 1
			min-width: 0
			overflow-x: auto
		:global(.m3-segmented__segment)
			white-space: nowrap
			flex: 0 0 auto
			min-width: 0
	&__tools
		display: grid
		gap: 0.875rem
		padding-bottom: 1.5rem
		border-bottom: 1px solid var(--outline-variant)
	&__search
		position: relative
		width: 100%
		max-width: 32rem
		:global(.m3-text-field)
			width: 100%
	&__clear
		position: absolute
		right: 0.5rem
		top: 50%
		display: grid
		place-items: center
		width: 1.75rem
		height: 1.75rem
		padding: 0.25rem
		transform: translateY(-50%)
		border: 0
		border-radius: var(--shape-corner-full)
		background: transparent
		color: var(--on-surface-variant)
		cursor: pointer
		> :global(svg)
			width: 1.25rem
			height: 1.25rem
	&__count
		margin: 0
		color: var(--on-surface-variant)
		font: var(--m3e-type-body-small)
		&--wall
			padding: 1rem 0 0.75rem
	&__grid
		display: grid
		grid-template-columns: repeat(1, minmax(0, 1fr))
		gap: 1rem
		padding-top: 1.5rem
		@media (min-width: 40rem)
			grid-template-columns: repeat(2, minmax(0, 1fr))
		@media (min-width: 75rem)
			grid-template-columns: repeat(3, minmax(0, 1fr))
	&__item
		min-width: 0
		animation: album-card-in var(--m3e-duration-long) var(--m3e-easing-emphasized-decelerate) both
		animation-delay: var(--album-delay)
	&__loading
		display: grid
		place-items: center
		min-height: 12rem
		padding-top: 1.5rem
		opacity: 1
		transition: opacity var(--m3e-duration-short) var(--m3e-easing-standard)
		&--out
			opacity: 0
	&__empty
		display: grid
		place-items: center
		gap: 0.75rem
		min-height: 12rem
		padding-top: 1.5rem
		color: var(--on-surface-variant)
		font: var(--m3e-type-body-medium)
		> :global(svg)
			width: 2rem
			height: 2rem

@keyframes album-card-in
	from
		opacity: 0
		transform: translateY(0.5rem)
	to
		opacity: 1
		transform: translateY(0)

:global(html.motion-reduced) .album-section__item
	animation: none

:global(html.motion-reduced) .album-section__loading
	transition: none

@media (prefers-reduced-motion: reduce)
	.album-section__item
		animation: none
	.album-section__loading
		transition: none
</style>
