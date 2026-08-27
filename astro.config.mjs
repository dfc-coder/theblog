import { satteri } from '@astrojs/markdown-satteri';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import { graphMdastPlugin } from './src/lib/graph/remark.ts';

const site = process.env.SITE_URL ?? 'http://localhost:4321';

export default defineConfig({
  site,
  output: 'static',
  integrations: [sitemap()],
  markdown: {
    processor: satteri({
      mdastPlugins: [graphMdastPlugin()]
    })
  }
});
