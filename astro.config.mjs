import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import { remarkGraph } from './src/lib/graph/remark.ts';

const site = process.env.SITE_URL ?? 'http://localhost:4321';

export default defineConfig({
  site,
  output: 'static',
  integrations: [sitemap()],
  markdown: {
    remarkPlugins: [remarkGraph]
  }
});
