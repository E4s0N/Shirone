export type AlbumLayout = "grid" | "masonry";

export type AlbumPhoto = {
	id: string;
	src: string;
	thumbnail?: string;
	alt: string;
	title?: string;
	description?: string;
	tags: string[];
	date?: string;
	location?: string;
	width?: number;
	height?: number;
	camera?: string;
	lens?: string;
	settings?: string;
	/** Live Photo 配对视频（本地相册为同名 .mov/.mp4/.webm sidecar） */
	liveVideo?: string;
};

export type AlbumGroup = {
	id: string;
	title: string;
	description: string;
	cover: string;
	date: string;
	location: string;
	tags: string[];
	layout: AlbumLayout;
	columns: 2 | 3 | 4;
	hidden: boolean;
	password?: string;
	passwordHint?: string;
	photos: AlbumPhoto[];
};

export type AlbumIndexItem = Omit<AlbumGroup, "photos" | "password"> & {
	photoCount: number;
	protected: boolean;
};

/** 「所有图片」瀑布流条目：AlbumPhoto 附带所属相册信息（仅未加密相册） */
export type WallPhoto = AlbumPhoto & {
	album?: string;
	albumId?: string;
};
