/**
 * WebGL 图片查看器的程序化入口。
 * 相册相关页面点击图片时动态 import 查看器组件并挂载到 body，
 * 关闭/切页前卸载；WebGL 不可用时回退 Fancybox 灯箱。
 * 组件与引擎 chunk 仅在首次调用时加载（零额外负担：不点不开）。
 */

import { checkWebGLSupport } from "./support";
import type { ViewerPhoto } from "./types";

interface ViewerOptions {
	/** 浏览的照片列表（至少一项） */
	photos: ViewerPhoto[];
	/** 初始定位的照片下标 */
	startIndex?: number;
}

interface ActiveViewer {
	close: () => void;
}

let activeViewer: ActiveViewer | null = null;

export function closeWebGLViewer(): void {
	activeViewer?.close();
}

export async function openWebGLViewer(options: ViewerOptions): Promise<void> {
	if (activeViewer) {
		closeWebGLViewer();
	}

	const photos = options.photos.filter((photo) => photo.src);
	if (!photos.length) return;

	if (!checkWebGLSupport()) {
		const { openFancyboxGallery } = await import("@utils/fancybox-handler");
		await openFancyboxGallery(
			photos.map((photo) => ({ src: photo.src, caption: photo.alt })),
			Math.max(0, options.startIndex ?? 0),
		);
		return;
	}

	const { mount, unmount } = await import("svelte");
	const Viewer = (await import("@components/organisms/WebGLImageViewer.svelte"))
		.default;

	const container = document.createElement("div");
	container.className = "webgl-viewer-root";
	document.body.appendChild(container);

	const close = () => {
		activeViewer = null;
		unmount(instance);
		container.remove();
	};

	const instance = mount(Viewer, {
		target: container,
		props: {
			photos,
			startIndex: Math.min(
				Math.max(options.startIndex ?? 0, 0),
				photos.length - 1,
			),
			onRequestClose: close,
		},
	});

	activeViewer = { close };
}
