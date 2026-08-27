import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { blogSchema } from './content/blog/schema';

const blog = defineCollection({
  loader: glob({
    base: './src/content/blog',
    pattern: '**/*.md'
  }),
  schema: blogSchema
});

export const collections = { blog };
