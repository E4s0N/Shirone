import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/**
 * Fontsource 包的本地解析。
 *
 * Astro 的远程 `fontProviders.fontsource()` 初始化时必须访问
 * `api.fontsource.org` 拉取字体元数据，网络不可达时字体整体失效。
 * 而配置里的 `file` 本来就指向已安装的 `@fontsource/*` npm 包 CSS，
 * 因此这里直接解析该 CSS 内的 @font-face 声明，把 woff2 文件以
 * 本地 provider 的形式交给 Astro fonts，完全离线且结果确定。
 */

/** 一个 @font-face 子集条目（src 已解析为绝对路径） */
export interface FontsourceFace {
	src: string;
	unicodeRange?: string[];
}

const FONT_FACE_BLOCK = /@font-face\s*\{([^}]*)\}/g;
const WOFF2_URL = /url\(\s*["']?([^)"']+?\.woff2)["']?\s*\)/i;
const UNICODE_RANGE = /unicode-range\s*:\s*([^;}]+)/i;

/** 按候选根目录依次解析 Fontsource CSS 导入路径，返回 CSS 文件绝对路径 */
export function resolveFontsourceSpecifier(
	specifier: string,
	roots: string[],
): string {
	for (const root of roots) {
		try {
			return createRequire(join(root, "package.json")).resolve(specifier);
		} catch {
			// 尝试下一个根目录
		}
	}
	const packageName = specifier.split("/").slice(0, 2).join("/");
	throw new Error(
		`[font-system] Cannot resolve "${specifier}". ` +
			`Install the matching Fontsource package first, e.g. \`pnpm.cmd add ${packageName}\`.`,
	);
}

/**
 * 解析 Fontsource CSS 文本中的全部 @font-face 块。
 *
 * 只提取 woff2 `src` 与 `unicode-range`；字重/样式/字体族仍以
 * `fontConfig.ts` 的声明为准（与 CSS 内容一致）。`cssDir` 用于把 CSS 内
 * 的相对 `./files/...` URL 解析为绝对路径。
 */
export function parseFontsourceCss(
	cssText: string,
	cssDir: string,
): FontsourceFace[] {
	const faces: FontsourceFace[] = [];
	for (const [, body] of cssText.matchAll(FONT_FACE_BLOCK)) {
		const url = body.match(WOFF2_URL)?.[1];
		if (!url) continue;
		const range = body.match(UNICODE_RANGE)?.[1]?.trim();
		faces.push({
			src: join(cssDir, url),
			...(range
				? { unicodeRange: range.split(",").map((part) => part.trim()) }
				: {}),
		});
	}
	return faces;
}

/** 解析导入路径并读取 CSS，返回该变体下全部子集的本地 woff2 faces */
export function loadFontsourceFaces(
	specifier: string,
	roots: string[],
): FontsourceFace[] {
	const cssPath = resolveFontsourceSpecifier(specifier, roots);
	return parseFontsourceCss(readFileSync(cssPath, "utf8"), dirname(cssPath));
}
