import { z } from 'astro/zod';

export const blogSchema = z.object({
  slug: z.string().optional(),
  title: z.string(),
  description: z.string(),
  pubDate: z.coerce.date(),
  tags: z.array(z.string()).default([]),
  draft: z.boolean().default(false)
});

export type BlogFrontmatter = z.infer<typeof blogSchema>;
