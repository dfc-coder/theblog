import { describe, expect, it } from 'vitest';
import { blogSchema } from '../src/content/blog/schema';
import { getPostPath, getPublishedPosts, resolvePostSlug, type BlogPost } from '../src/lib/blog';

const createPost = (overrides: Partial<BlogPost> = {}) => {
  const { data: dataOverrides, ...rest } = overrides;

  return {
    collection: 'blog',
    id: 'test-post',
    data: {
      slug: undefined,
      title: 'Post de prueba',
      description: 'Descripción de prueba',
      pubDate: new Date('2026-04-28'),
      tags: [],
      draft: false,
      ...(dataOverrides ?? {})
    },
    ...rest
  } as BlogPost;
};

describe('blog schema', () => {
  it('accepts valid frontmatter and applies defaults', () => {
    const parsed = blogSchema.parse({
      title: 'Bienvenido',
      description: 'Primer post',
      pubDate: '2026-04-28'
    });

    expect(parsed.tags).toEqual([]);
    expect(parsed.draft).toBe(false);
    expect(parsed.pubDate).toBeInstanceOf(Date);
  });

  it('rejects frontmatter without required fields', () => {
    expect(() =>
      blogSchema.parse({
        description: 'Sin título',
        pubDate: '2026-04-28'
      })
    ).toThrow();
  });
});

describe('blog helpers', () => {
  it('filters drafts and sorts posts by date descending', () => {
    const posts = [
      createPost({
        id: 'older-post',
        data: { pubDate: new Date('2026-01-01') }
      }),
      createPost({
        id: 'draft-post',
        data: { pubDate: new Date('2026-04-01'), draft: true }
      }),
      createPost({
        id: 'newer-post',
        data: { pubDate: new Date('2026-04-28') }
      })
    ];

    const visiblePosts = getPublishedPosts(posts);

    expect(visiblePosts.map((post) => resolvePostSlug(post))).toEqual(['newer-post', 'older-post']);
  });

  it('resolves the configured slug and builds the canonical path', () => {
    const post = createPost({
      id: 'custom-post',
      data: { slug: 'my-slug' }
    });

    expect(resolvePostSlug(post)).toBe('my-slug');
    expect(getPostPath(post)).toBe('/posts/my-slug/');
  });
});
