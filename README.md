# Notas de Ingeniería

Blog técnico estático construido con Astro 7.2, Content Collections y Markdown.

## Requisitos

- Node.js 22 (`>=22.12.0 <23`)
- pnpm 10.33.2

## Scripts

- `pnpm dev` — entorno local
- `pnpm test` — tests unitarios
- `pnpm check` — diagnóstico y type checking de Astro
- `pnpm build` — build estático de producción
- `pnpm verify` — test + check + build
- `pnpm preview` — preview del build

## Configuración

El dominio público se configura con `SITE_URL`:

```bash
SITE_URL=https://tu-dominio.com pnpm build
```

Si `SITE_URL` no está definido, el desarrollo local usa `http://localhost:4321`.

## Contenido

Los posts viven en `src/content/blog/*.md` y se validan con el schema de `src/content/blog/schema.ts`.

## Producción

El build genera HTML estático en `dist/` e incluye:

- canonical URLs
- OpenGraph y Twitter metadata
- RSS en `/rss.xml`
- sitemap
- `robots.txt`
- página 404
