# 相册目录说明

在 `public/images/albums/<相册标识>/` 下为每个相册建立一个独立目录。

每个相册目录下需要包含一个 `info.json` 元数据配置文件：

## 本地相册配置示例

```json
{
  "title": "示例相册",
  "description": "相册描述说明",
  "date": "2026-08-01",
  "location": "北京",
  "tags": ["摄影", "日常"],
  "layout": "masonry",
  "columns": 3,
  "hidden": false
}
```

本地相册直接在相册目录下放置 `cover.webp` 封面图以及按序号命名的照片文件，例如 `01.webp`、`02.webp`。

## 远端外链相册配置示例

```json
{
  "mode": "external",
  "title": "远端相册",
  "description": "通过网络外链加载的相册",
  "date": "2026-08-01",
  "cover": "https://example.com/cover.webp",
  "tags": ["风景"],
  "layout": "masonry",
  "columns": 3,
  "photos": [
    {
      "src": "https://example.com/photo1.webp",
      "title": "照片标题",
      "description": "照片描述",
      "width": 1920,
      "height": 1080
    }
  ]
}
```

## 加密相册

在 `info.json` 中配置 `"password": "你的密码"` 即可启用相册访问密码锁。

## 展示缩略图（自动生成）

大图建议提供展示缩略图，瀑布流与图片查看器会在原图加载期间先显示它，保证切换流畅。约定与生成方式：

- 位置：`public/images/albums/<相册>/thumb/<照片名去扩展名>.webp`（宽 640 的 WebP）；
- 生成：推送后由 `Generate Album Thumbnails` workflow 自动补齐缺失的缩略图并提交回本仓库（幂等，已有的不重复生成）；也可以手工提供 `照片名.thumb.webp`；
- `thumb/` 目录和 `*.thumb.webp` 不会被当作照片本身；删除照片时请同步删除对应缩略图。

Live Photo：把与照片同名的视频放进相册的 `thumb/` 目录（如 `thumb/IMG_0001.mov`，支持 `.mp4/.webm/.m4v`），站点会显示 Live 标识并支持悬浮/点击播放。iPhone Live Photo 的 `.mov` 需从原设备导出后提交；**Android 动态照片（`MVIMG_*.jpg` 等带 MotionPhoto 标记的文件）无需手工处理**——workflow 会自动把内嵌视频提取到 `thumb/<照片名>.mp4` 并提交，站点自动配对为 Live Photo。注意：动态视频多为 HEVC 编码，workflow 会用 ffmpeg（ubuntu runner 自带）转码为 H.264 以保证浏览器可播放。
