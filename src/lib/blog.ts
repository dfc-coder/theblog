import type { CollectionEntry } from 'astro:content';

export type BlogPost = CollectionEntry<'blog'>;

export const isPublishedPost = (post: BlogPost) => !post.data.draft;

export const resolvePostSlug = (post: BlogPost) => post.data.slug ?? post.id;

export const getPostPath = (post: BlogPost) => `/posts/${resolvePostSlug(post)}/`;

export const sortPostsByDate = (posts: BlogPost[]) =>
  [...posts].sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime());

export const getPublishedPosts = (posts: BlogPost[]) => sortPostsByDate(posts.filter(isPublishedPost));
