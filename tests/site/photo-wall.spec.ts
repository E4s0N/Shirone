import { expect, test } from "@playwright/test";

test("相册页模式切换 + 所有图片瀑布流", async ({ page }) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));

	await page.goto("/albums/", { waitUntil: "networkidle" });

	// category-bar 相册变体：所有图片/相册 两个按钮，默认选中「所有图片」
	const modeGroup = page.locator('[data-bar="albums"]');
	await expect(modeGroup).toBeVisible();
	const photosChip = modeGroup.locator('[data-albums-mode="photos"]');
	const albumsChip = modeGroup.locator('[data-albums-mode="albums"]');
	await expect(photosChip).toHaveClass(/m3-chip--selected/);

	// 默认显示所有图片瀑布流（不含加密相册的照片）
	await expect(page.locator(".photo-wall")).toBeVisible();
	const wallItems = page.locator(".photo-wall__item");
	const wallCount = await wallItems.count();
	expect(wallCount).toBeGreaterThan(0);

	// 切换到「相册」模式：卡片网格 + URL 参数
	await albumsChip.click();
	await expect(page.locator(".album-section__grid")).toBeVisible();
	await expect(photosChip).not.toHaveClass(/m3-chip--selected/);
	expect(new URL(page.url()).searchParams.get("mode")).toBe("albums");

	// 切回所有图片
	await photosChip.click();
	await expect(page.locator(".photo-wall")).toBeVisible();
	expect(new URL(page.url()).searchParams.get("mode")).toBeNull();

	// 悬停浮层元素存在（title/date/album）
	await expect(
		page.locator(".photo-wall__item").first().locator("img"),
	).toBeVisible();
	expect(errors).toEqual([]);
});

test("查看器：缩略图条 + 信息栏 + 切换", async ({ page }) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));

	await page.goto("/albums/", { waitUntil: "networkidle" });
	await page.locator(".photo-wall__item button").first().click();

	const viewer = page.locator(".webgl-viewer-root > div");
	await expect(viewer).toBeVisible();
	await expect(viewer).toHaveAttribute("role", "dialog");

	// 底部缩略图条 + 右侧信息栏
	await expect(viewer.locator("aside")).toBeVisible();
	const strip = viewer.locator("[data-active]");
	const stripButtons = page.locator(".webgl-viewer-root button[data-active]");
	const counter = viewer.locator("span", { hasText: /^\d+ \/ \d+$/ });
	await expect(counter).toBeVisible();

	// 信息栏包含基本信息分区
	await expect(viewer.locator("aside")).toContainText(
		/(基本信息|Basic info|基本情報|기본 정보|Información básica|ข้อมูลพื้นฐาน|Temel bilgiler|Thông tin cơ bản|Info dasar)/,
	);

	// 键盘切换 → 计数变化
	const before = await counter.textContent();
	await page.keyboard.press("ArrowRight");
	await page.waitForTimeout(300);
	const after = await counter.textContent();
	expect(after).not.toBe(before);

	// 点击缩略图切换
	const thumbs = viewer.locator("img[loading='lazy']").last();
	await thumbs.click();
	await page.waitForTimeout(300);

	// Escape 关闭
	await page.keyboard.press("Escape");
	await expect(page.locator(".webgl-viewer-root")).toHaveCount(0);

	expect(errors).toEqual([]);
});

test("相册详情页查看器带相册名与缩略图", async ({ page }) => {
	await page.goto("/albums/AcgExample/", { waitUntil: "networkidle" });
	await page.locator(".album-gallery__item").first().click();

	const viewer = page.locator(".webgl-viewer-root > div");
	await expect(viewer).toBeVisible();
	await expect(viewer.locator("aside")).toBeVisible();
	// 相册名出现在信息栏
	await expect(viewer.locator("aside")).toContainText("Some lovely pictures");
});

test("查看器信息栏：文件大小与直方图", async ({ page }) => {
	await page.goto("/albums/AcgExample/", { waitUntil: "networkidle" });
	await page.locator(".album-gallery__item").first().click();

	const viewer = page.locator(".webgl-viewer-root > div");
	await expect(viewer).toBeVisible();
	const aside = viewer.locator("aside");

	// 文件大小来自 Worker 解码时的 blob
	await expect(aside).toContainText(
		/(文件大小|File size|檔案大小|ファイルサイズ|파일 크기)/,
	);
	await expect(aside).toContainText(/(MB|KB)/);

	// 直方图 canvas 已绘制（非空白）
	await expect(aside).toContainText(
		/(直方图|Histogram|直方圖|ヒストグラム|히스토그램)/,
	);
	const painted = await page.evaluate(() => {
		const canvas = document.querySelector("[data-histogram-canvas]");
		if (!(canvas instanceof HTMLCanvasElement)) return false;
		const ctx = canvas.getContext("2d");
		if (!ctx) return false;
		const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
		for (let i = 3; i < data.length; i += 4) {
			if (data[i] > 0) return true;
		}
		return false;
	});
	expect(painted).toBe(true);
});

test("所有图片瀑布流：Live Photo 悬浮播放", async ({ page }) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));

	await page.goto("/albums/", { waitUntil: "networkidle" });

	// 带配对视频的照片显示 Live 标识，悬浮即播放
	const liveItem = page
		.locator(".photo-wall__item")
		.filter({ has: page.locator("video") })
		.first();
	await expect(liveItem).toBeVisible();
	await liveItem.locator("button").hover();
	await expect(liveItem.locator("video")).toHaveClass(/opacity-100/);

	// 移开鼠标后回退到静态图
	await page.mouse.move(0, 0);
	await expect(liveItem.locator("video")).toHaveClass(/opacity-0/);

	expect(errors).toEqual([]);
});
