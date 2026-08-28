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

## Diagram DSL

Los bloques Markdown `graph` se compilan a SVG estático durante el build. La DSL describe intención y estructura; el compilador resuelve geometría, layout y routing.

```text
layout: serpentine
columns: 3
viewport: content
skin: handdrawn

observe: OBSERVAR
understand: ENTENDER
learn[terminal]: APRENDER

observe -> understand | contexto
understand -> learn
learn ~> observe | feedback
```

Directivas soportadas:

- `direction: LR | TB`
- `layout: auto | serpentine | fanout | layered-lr | layered-tb`
- `columns: 1..4`, únicamente con `auto` o `serpentine`
- `viewport: artboard | content`
- `skin: clean | handdrawn`

Defaults: `layout: auto`, `viewport: artboard` y `skin: handdrawn`. Los diagramas existentes no necesitan declarar estas opciones.

Tipos de nodo: `default`, `terminal`, `accent`, `muted`. `->` define relaciones estructurales que participan del DAG; `~>` define feedback visual y no altera el ranking estructural.

No se soportan coordenadas manuales, paths arbitrarios, CSS dentro de la DSL ni drag and drop. `groups` queda fuera de esta versión.

## Política de sizing responsive

Las medidas espaciales de UI usan unidades relativas (`rem`, `em`, `%`, `vw`, `vh`) y funciones fluidas como `clamp()`, `min()` y `max()`.

No se permiten unidades CSS absolutas (`px`, `pt`, `pc`, `cm`, `mm`, `in`) en `src/` ni en assets de `public/`. `tests/relative-units.test.ts` aplica esta regla automáticamente en CI.

Las excepciones son valores que no representan layout CSS: coordenadas numéricas del espacio interno `viewBox` de SVG, duraciones de animación (`ms`/`s`) y constantes lógicas sin unidad. Las coordenadas SVG permanecen determinísticas y el escalado responsive se resuelve mediante `viewBox` y CSS relativo.

## Producción

El build genera HTML estático en `dist/` e incluye:

- canonical URLs
- OpenGraph y Twitter metadata
- RSS en `/rss.xml`
- sitemap
- `robots.txt`
- página 404
