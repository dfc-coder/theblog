import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { getPostPath, getPublishedPosts } from '../lib/blog';
import { SITE } from '../lib/site';

export async function GET(context: APIContext) {
  const posts = getPublishedPosts(await getCollection('blog'));

  return rss({
    title: SITE.name,
    description: SITE.description,
    site: context.site ?? context.url.origin,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: getPostPath(post),
      categories: post.data.tags
    })),
    customData: '<language>es-AR</language>'
  });
}
