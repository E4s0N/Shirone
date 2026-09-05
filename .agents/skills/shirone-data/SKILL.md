---
name: shirone-data
description: Managing Shirone data-backed pages and albums - adding or editing album folders, info.json metadata, local or external photos, friends, compass, anime, projects, skills, devices, timelines, and music data. Use when changing content outside src/content/ that feeds these pages.
---

# Shirone 数据与相册

## 先判断归属

- 文章和动态写入 `src/content/`，使用 `shirone-writing`。
- 页面行为、开关、排序和凭据写入 `src/config/`，使用 `shirone-config`。
- 具体条目内容写入 `src/data/`；不要把内容实体塞进 config。
- 相册不是 Content Collection，而是 `public/images/albums/` 下的目录数据。

## 数据页工作流

1. 先阅读对应类型和数据文件：`src/types/<domain>Config.ts`、`src/data/<domain>.ts`，确认字段和现有条目形状。
2. 只修改内容实体；筛选、排序、页面开关使用对应 `src/config/*Config.ts` 的 `categories`、`disabledKeys`、`order` 和 `enable`。
3. 新增条目后运行 `npx.cmd astro check`、`pnpm.cmd check:manifest`，并执行对应页面测试，例如 `tests/site/friends.spec.ts`、`tests/site/anime.spec.ts`、`tests/site/projects.spec.ts`、`tests/site/devices.spec.ts`、`tests/site/timeline.spec.ts`。

## 相册工作流

每个相册是 `public/images/albums/<id>/` 目录：

- `info.json` 是可选项。不写时按目录相册零配置展示：标题用目录名，封面回退第一张照片，日期取最新照片的文件日期，`masonry` 布局；本地照片模式配置了 `info.json` 时需要 `cover.webp` 或 `cover.jpg`，其余图片直接放在同目录；悬浮浮层与查看器信息栏显示完整文件名，文件名中首个 `_` 之后的段解析为照片标签（如 `beach_海边.webp` → 标签 `海边`）。
- Live Photo：配对视频放在相册 `thumb/` 目录下与照片同名（忽略大小写，如 `thumb/IMG_0001.mov`，支持 `.mp4/.webm/.m4v`；兼容相册根目录的同名视频），画廊与查看器显示 Live 徽章并支持悬浮/点击播放；external 模式在照片条目上提供 `liveVideo` 字段，效果相同。没有匹配图片的孤立视频文件会被忽略。Android Motion Photo（`MVIMG_*.jpg` 等带 `GCamera:MotionPhoto`/`MicroVideo` XMP 标记的文件）无需手工 sidecar：dev 启动与内容仓 CI 会自动把内嵌视频提取到 `thumb/<照片名>.mp4` 并配对；内嵌视频多为 HEVC，需 ffmpeg 转码为 H.264（CI 自带，本地未装 ffmpeg 时跳过并告警）；iPhone Live Photo 的 `.mov` 仍需从原设备导出提交。
- 大图占位：`thumb/<照片名>.webp`（dev 启动与内容仓 CI 自动生成，幂等）或手工 sidecar `照片名.thumb.webp` 作为该照片的展示缩略图，瀑布流与查看器在原图加载期间先显示它；两者都不会被视为一张独立照片。
- 外部照片模式在 `info.json` 设置 `"mode": "external"`、`cover` 和 `photos` 数组；每个照片至少提供 `src`，可选 `thumbnail`、`alt`、`title`、`tags`、日期和相机信息。
- `title`、`description`、`date`(YYYY-MM-DD)、`location`、`tags`、`layout`(`masonry`/`grid`)、`columns`(2/3/4)、`hidden`、`password` 和 `passwordHint` 按 `src/types/album.ts` 与 `src/utils/album-scanner.ts` 处理。
- 设有 `password` 的相册必须同时验证详情页和受保护照片，不能把密码或明文受保护清单写入公开文章或日志。

示例结构：

```text
public/images/albums/summer/
├── info.json
├── cover.webp
├── beach_海边.webp
└── sunset_晚霞.webp
```

相册变更后运行 `npx.cmd astro check`、`pnpm.cmd check:manifest`，以及 `npx.cmd playwright test tests/site/albums.spec.ts tests/site/post-encryption.spec.ts`。

## 必读文档

- `src/config/README.md` — config/data 归属和配置导入规则
- `src/types/album.ts`、`src/utils/album-scanner.ts` — 相册实际 schema 与扫描规则
- `src/data/` — 各数据页内容实体
- `src/config/` — 各数据页行为配置
- `src/pages/AGENTS.md` — 相册保护与 SSR 约束

## npm 包模式数据路径

运行 `npx.cmd shirones init` 后，用户数据生成在 `shirones/config/data/` 和 `shirones/content/`，相册及其他静态媒体仍位于用户项目的 `public/`。不要编辑 `node_modules/shirones` 中的包文件；构建期消费数据路径时遵循 `docs/npm-package-mode.md` 和 `docs/packaging-contract.md`。
