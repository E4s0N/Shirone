import { expect, test } from "@playwright/test";

test.describe("相册页响应式滚动", () => {
	test("从手机视口切换到桌面视口后仍可滚动", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/albums/AcgExample/", { waitUntil: "networkidle" });
		await expect(page.locator(".album-gallery__item").first()).toBeVisible();

		await page.setViewportSize({ width: 1440, height: 900 });
		await expect
			.poll(() =>
				page.evaluate(
					() => document.documentElement.scrollHeight > window.innerHeight,
				),
			)
			.toBe(true);

		await page.evaluate(() => window.scrollTo(0, 700));
		await expect
			.poll(() => page.evaluate(() => window.scrollY))
			.toBeGreaterThan(0);

		await expect(page.locator("html")).not.toHaveAttribute(
			"data-overlayscrollbars",
		);
		await expect(page.locator("body")).not.toHaveAttribute(
			"data-overlayscrollbars",
		);
	});
});

test.describe("受保护相册", () => {
	test("提供完整的密码输入与解锁反馈", async ({ page }) => {
		await page.goto("/albums/EncryptedExample/", { waitUntil: "networkidle" });

		const input = page.getByRole("textbox", { name: "Password" });
		const submit = page.getByRole("button", { name: "Unlock album" });
		const visibility = page.getByRole("button", { name: "Show password" });

		await expect(
			page.getByRole("heading", { name: "This album is protected" }),
		).toBeVisible();
		await expect(page.getByText("Six digits", { exact: true })).toBeVisible();
		await expect(input).toHaveAttribute("type", "password");
		await expect(input).toHaveAttribute("autocomplete", "current-password");

		await visibility.click();
		await expect(input).toHaveAttribute("type", "text");
		await expect(
			page.getByRole("button", { name: "Hide password" }),
		).toBeVisible();

		await submit.click();
		await expect(
			page.getByText("Enter a password", { exact: true }),
		).toBeVisible();
		await expect(input).toHaveAttribute("aria-invalid", "true");

		await input.fill("000000");
		await expect(
			page.getByText("Enter a password", { exact: true }),
		).toBeHidden();
		await submit.click();
		await expect(
			page.getByText("That password could not unlock this album", {
				exact: true,
			}),
		).toBeVisible();

		await input.fill("123456");
		await submit.click();
		await expect(page.locator(".album-gallery__item")).toHaveCount(2);
		await expect(page.locator(".album-gallery")).toHaveClass(
			/album-gallery--masonry/,
		);
		await expect(page.locator(".album-gallery")).not.toHaveClass(
			/album-gallery--grid/,
		);
		const portrait = page.getByAltText("A protected vertical photograph");
		const landscape = page.getByAltText("A protected garden landscape");
		await expect(
			page.locator(".album-gallery__item img").first(),
		).toHaveAttribute("alt", "A protected vertical photograph");
		await expect
			.poll(async () => {
				const portraitBox = await portrait.boundingBox();
				const landscapeBox = await landscape.boundingBox();
				if (!portraitBox || !landscapeBox) return false;
				const naturalDirections = await page.evaluate(() => {
					const portraitImage = document.querySelector(
						'img[alt="A protected vertical photograph"]',
					) as HTMLImageElement | null;
					const landscapeImage = document.querySelector(
						'img[alt="A protected garden landscape"]',
					) as HTMLImageElement | null;
					return Boolean(
						portraitImage &&
							landscapeImage &&
							portraitImage.naturalHeight > portraitImage.naturalWidth &&
							landscapeImage.naturalWidth > landscapeImage.naturalHeight,
					);
				});
				return (
					naturalDirections &&
					portraitBox.height > portraitBox.width &&
					landscapeBox.width > landscapeBox.height &&
					portraitBox.x <= landscapeBox.x
				);
			})
			.toBe(true);
		await expect(page.locator(".password-gate")).toBeHidden();
		await expect
			.poll(() =>
				page.locator(".album-detail__gallery").evaluate((element) => {
					const style = getComputedStyle(element);
					return (
						style.backgroundColor !== "rgba(0, 0, 0, 0)" &&
						style.padding !== "0px"
					);
				}),
			)
			.toBe(true);
	});
});

test.describe("Live Photo", () => {
	test("相册画廊悬浮播放配对视频并显示 Live 标识", async ({ page }) => {
		await page.goto("/albums/LiveExample/", { waitUntil: "networkidle" });

		// 仅带 sidecar 的照片有 Live 标识与视频层
		const items = page.locator(".album-gallery__item");
		await expect(items).toHaveCount(2);
		const liveItem = items.first();
		await expect(liveItem.locator("video")).toHaveCount(1);
		await expect(items.nth(1).locator("video")).toHaveCount(0);

		// 悬浮播放：视频层淡入，并真实解码出画面（videoWidth > 0，防 HEVC 回归）
		await liveItem.hover();
		await expect(liveItem.locator("video")).toHaveClass(/opacity-100/);
		await expect
			.poll(() =>
				liveItem
					.locator("video")
					.evaluate((el) => (el as HTMLVideoElement).videoWidth),
			)
			.toBeGreaterThan(0);
		await page.mouse.move(0, 0);
		await expect(liveItem.locator("video")).toHaveClass(/opacity-0/);
	});

	test("查看器内 Live Photo 徽章可播放视频层", async ({ page }) => {
		await page.goto("/albums/LiveExample/", { waitUntil: "networkidle" });
		await page.locator(".album-gallery__item").first().click();

		const viewer = page.locator(".webgl-viewer-root > div");
		await expect(viewer).toBeVisible();

		// LIVE 徽章 + 配对视频层存在
		const badge = viewer.getByRole("button", {
			name: /(播放实况照片|Play Live Photo|ライブフォトを再生|라이브 포토 재생|Reproducir foto en vivo|เล่นภาพ Live|Canlı Fotoğrafı Oynat|Phát ảnh sống|Putar Foto Langsung|播放實況照片)/,
		});
		await expect(badge).toBeVisible();
		const video = viewer.locator("video");
		await expect(video).toHaveCount(1);
		await expect(video).toHaveAttribute("src", /thumb\/01\.mov$/);

		// 切到无 sidecar 的照片：徽章与视频层消失
		await page.keyboard.press("ArrowRight");
		await expect(badge).toHaveCount(0);
		await expect(viewer.locator("video")).toHaveCount(0);
	});
});
