import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import { graphMdastPlugin } from './src/lib/graph/remark.ts';

const site = process.env.SITE_URL ?? 'http://localhost:4321';

const graphMarkdownIntegration = {
  name: 'editorial-graph-markdown',
  hooks: {
    'astro:config:setup': ({ config }) => {
      const processor = config.markdown.processor;

      if (processor.name !== 'satteri') {
        throw new Error('Editorial graphs require Astro\'s Satteri Markdown processor.');
      }

      processor.options.mdastPlugins.push(graphMdastPlugin());
    }
  }
};

export default defineConfig({
  site,
  output: 'static',
  integrations: [graphMarkdownIntegration, sitemap()]
});
