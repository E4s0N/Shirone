import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

// YAML treats a blank value (for example `image:`) as null. Optional text
// fields should accept that form and expose a stable empty string to callers.
const optionalText = () =>
	z.preprocess((value) => (value == null ? undefined : value), z.string().optional()).default("");

const optionalTextArray = () =>
	z.preprocess(
		(value) => (value == null ? undefined : Array.isArray(value) ? value.filter((item) => item != null && item !== "") : value),
		z.array(z.string()).optional(),
	).default([]);

const postsCollection = defineCollection({
	loader: glob({ base: "./src/content/posts", pattern: "**/*.{md,mdx}" }),
	schema: z.object({
		title: z.string(),
		published: z.date(),
		publishedAt: z.date().optional(),
		updated: z.date().optional(),
		updatedAt: z.date().optional(),
		pinned: z.boolean().optional().default(false),
		draft: z.boolean().optional().default(false),
		comment: z.boolean().optional().default(true),
		description: optionalText(),
		image: optionalText(),
		tags: optionalTextArray(),
		category: optionalText(),
		lang: optionalText(),

		/* Post Encryption */
		encrypted: z.boolean().optional().default(false),
		password: z
			.union([z.string(), z.number()])
			.transform((v) => String(v))
			.optional(),
		passwordHint: optionalText(),
		hideHomeContent: z.boolean().optional().default(true),

		/* Post alias & custom permalink */
		alias: z.string().optional(),
		permalink: z.string().optional(),

		/* For internal use */
		prevUrl: z.string().optional(),
		nextUrl: z.string().optional(),
		prevTitle: z.string().default(""),
		prevSlug: z.string().default(""),
		nextTitle: z.string().default(""),
		nextSlug: z.string().default(""),
	}),
});

const specCollection = defineCollection({
	loader: glob({ base: "./src/content/spec", pattern: "**/*.{md,mdx}" }),
	schema: z.object({}),
});

const momentsCollection = defineCollection({
	loader: glob({ base: "./src/content/moments", pattern: "**/*.md" }),
	schema: z.object({
		published: z.date(),
		pinned: z.boolean().optional().default(false),
		location: z.string().optional().default(""),
		/** 心情（Iconify 图标名，如 material-symbols:sentiment-excited-outline-rounded） */
		mood: z.string().optional().default(""),
		tags: optionalTextArray(),
		images: z
			.array(
				z.object({
					src: z.string(),
					alt: z.string().optional().default(""),
				}),
			)
			.optional()
			.default([]),
		draft: z.boolean().optional().default(false),
	}),
});

export const collections = {
	posts: postsCollection,
	spec: specCollection,
	moments: momentsCollection,
} as const;
