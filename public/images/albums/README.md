# Albums

Create one directory per album under `public/images/albums/<id>/`.

Each directory needs an `info.json` file. Local albums use `cover.webp` or `cover.jpg` and automatically scan the remaining image files; keep the cover file out of the numbered photo sequence. If a basename has both a WebP and another image extension, the WebP file is selected. Filenames such as `sunset_beach.webp` expose `beach` as a photo tag.

Live Photos pair a still image with a short video sidecar of the same basename (case-insensitive). The video lives in the album's `thumb/` folder next to the display thumbnails — `thumb/IMG_0001.mov` (`.mp4`, `.webm`, and `.m4v` are also accepted); a same-named video in the album root is still picked up for compatibility. The viewer and galleries show a Live badge and play the video on hover or tap; a sidecar without a matching image is ignored.

Android Motion Photos (`MVIMG_*.jpg` and similar files carrying `GCamera:MotionPhoto` / `MicroVideo` XMP markers) do not need a hand-made sidecar: the embedded video is automatically extracted to `thumb/<basename>.mp4` by the dev server on startup and by the content repository's media-generation workflow, then paired as the Live Photo video. Most phones record these videos in HEVC, which shows a black picture without hardware HEVC decoding, so they are transcoded to H.264 with ffmpeg — the CI runner ships ffmpeg, and for local development install it (for example `winget install ffmpeg`); without ffmpeg the extraction is skipped with a warning rather than producing an unplayable file. iPhone Live Photos must be exported with their paired `.mov` and committed into `thumb/` alongside the still image — that video cannot be synthesized.

For large photos you can provide a display thumbnail sidecar named `<basename>.thumb.webp` (for example `IMG_0001.thumb.webp`): the photo wall and the image viewer show it as the instant placeholder while the full-resolution file loads, so switching stays smooth even on multi-megabyte originals. It is never treated as a photo itself.

Thumbnails are usually generated for you instead of being hand-made: the dev server creates missing `thumb/<basename>.webp` files (640px-wide WebP, inside a `thumb/` folder per album) on startup, and in the dual-repository setup the content repository's `Generate Album Thumbnails` workflow generates and commits the same files after every push. Both paths are idempotent — photos that already have `thumb/<name>.webp` (or a hand-made `<name>.thumb.webp`) are never regenerated.

For predictable local ordering and readable generated metadata, use zero-padded numeric names such as `01.webp`, `02.webp`, and `03.webp`. The scanner sorts names with numeric-aware `localeCompare`; the full file name becomes the generated photo `alt` (hover captions and the image-viewer sidebar header display it), segments after the first `_` become tags, and the file name forms the public image URL. Avoid hashes or mixed prefixes unless they are intentional. When renaming an existing album, preserve the scanner order and run the album regression test afterward.

```json
{
  "title": "Local album",
  "description": "Album description",
  "date": "2025-08-01",
  "location": "Tokyo",
  "tags": ["travel"],
  "layout": "masonry",
  "columns": 3,
  "hidden": false
}
```

For remote media, set `mode` to `external` and provide `cover` plus a `photos` array. Each photo requires `src`; `thumbnail`, `alt`, `title`, `description`, `tags`, `width`, `height`, `camera`, `lens`, `settings`, and `liveVideo` are optional. Prefer supplying `width` and `height`: the gallery uses them to preserve the source aspect ratio and to order masonry photos by orientation. If omitted, dimensions are measured after the image loads.

`hidden: true` removes an album from `/albums/` but keeps its static detail route. A `password` creates a protected album. The build emits only an encrypted photo manifest to the protected page; the browser decrypts it after a successful password entry. The password itself is never sent to the browser. This is a static-site access gate, not server-side authorization. Remote URLs remain directly controlled by their host, and local files under `public/` remain directly addressable if their URL is known.

Protected albums use the same `layout` and `columns` contract as regular albums. Set `layout` to `masonry` when the album should use the left-to-right masonry gallery; unlocking must not require a separate layout configuration.

The included examples demonstrate local, external, hidden, and protected modes. The sample images are copied from the research fixture for development and are not claimed as generally redistributable media.

After changing an album's `info.json` or image files, run `npx.cmd playwright test tests/site/albums.spec.ts` from the project root.
