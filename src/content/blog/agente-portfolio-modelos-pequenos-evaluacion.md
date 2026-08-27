---
slug: agente-portfolio-modelos-pequenos-evaluacion
title: "El agente detrás de mi portfolio II: modelos pequeños, conocimiento y evaluación"
description: "Qué aprendí ejecutando el agente localmente sobre CPU, separando generación de embeddings y midiendo estabilidad en lugar de confiar en demos aisladas."
pubDate: 2026-08-27
tags:
  - ai
  - agents
  - evaluation
  - llm
  - local-ai
draft: false
---

En la [primera parte](/posts/agente-portfolio-arquitectura-fallos-decisiones/) expliqué la decisión principal: **el modelo no tenía que ser el sistema completo**.

Pero quedaba otra restricción bastante concreta.

Todo tenía que correr en mi laptop, sobre CPU.

Eso convirtió la elección del modelo, el retrieval y la evaluación en parte de la arquitectura, no en detalles de infraestructura.

> **Un modelo pequeño no tiene que ganar un benchmark abstracto. Tiene que cumplir el contrato de tu sistema en el hardware donde realmente va a correr.**

## 01. Dos modelos pequeños, dos trabajos distintos

El runtime actual usa dos servicios `llama.cpp` residentes:

```text
LAPTOP / CPU
│
├── Qwen3.5-2B Q6
│      └── generación conversacional
│
└── Qwen3-Embedding-0.6B Q8
       ├── routing semántico
       └── retrieval del perfil
```

Ambos están configurados con `n_gpu_layers=0`.

El Qwen3.5-2B tiene un contexto de 8192 tokens. El modelo de embeddings usa un contexto más pequeño y no genera respuestas: produce las representaciones que necesita el router y el retriever.

Esta separación importa porque **no toda decisión necesita un modelo generativo**.

Usar el mismo LLM para interpretar, clasificar, recuperar y responder habría aumentado latencia y variabilidad justo en el entorno donde menos margen tenía.

## 02. 0.8B era atractivo. No alcanzaba con ser más rápido

Durante el desarrollo probé variantes pequeñas alrededor de 0.8B y 2B parámetros.

La tentación con CPU es obvia:

```text
menos parámetros
      ↓
menos costo
      ↓
menos latencia
```

Pero esa ecuación está incompleta.

Un modelo que responde rápido pero rompe con demasiada frecuencia el contrato del agente no es una optimización.

Las pruebas con 0.8B mostraron que bajar tamaño podía dejar demasiado trabajo semántico sobre un modelo con poco margen. El 2B tampoco resolvía mágicamente la arquitectura, pero ofrecía más capacidad para la parte que sí quería dejar en generación.

Por eso el modelo actual quedó fijado en `Qwen3.5-2B` cuantizado, mientras routing y retrieval se desplazaron al modelo de embeddings y a código simple.

> **La optimización no fue “usar el modelo más chico”. Fue reducir cuánto necesitaba hacer el modelo generativo.**

## 03. El conocimiento sí usa retrieval, pero no necesita una plataforma RAG

La versión anterior de esta historia decía que el portfolio “no necesitaba RAG”. Era demasiado simplista.

Sí necesito recuperar conocimiento relevante. Lo que no necesito es toda la infraestructura que normalmente asociamos a un stack RAG grande.

El conocimiento ya existe como un perfil estructurado y controlado.

```text
PROFILE
   │
   ▼
small documents
   │
   ▼
embeddings at startup
   │
   ▼
cache in memory
```

Por consulta:

```text
question
   │
   ▼
query embedding
   │
   ▼
cosine similarity
   │
   ▼
top relevant documents
   │
   ▼
Qwen3.5-2B
```

Los vectores de los documentos se calculan una sola vez y se reutilizan durante la vida del proceso. El contexto tiene límites explícitos de cantidad de documentos y caracteres.

No hay una base vectorial externa, ingestión de PDFs ni un reranker adicional en el hot path.

Es retrieval aumentado, pero deliberadamente pequeño.

## 04. Una conversación que sale bien no demuestra nada

Al principio el ciclo de prueba era inevitablemente manual:

```text
preguntar
   ↓
leer respuesta
   ↓
“parece bien”
```

Eso sirve mientras estás construyendo. Después deja de ser suficiente.

La evaluación fue creciendo hacia un corpus de casos que obliga a mirar dimensiones separadas:

```text
┌─────────────────────────┐
│ routing correcto        │
│ conocimiento relevante  │
│ afirmaciones soportadas │
│ idioma correcto         │
│ latencia                │
│ consistencia            │
└─────────────────────────┘
```

La diferencia es importante.

Una respuesta puede estar perfectamente escrita y aun así fallar porque recuperó el documento equivocado o porque afirmó algo que no estaba respaldado por el perfil.

## 05. Los fallos tienen dueño

Una de las cosas más útiles de separar la arquitectura fue poder dejar de culpar automáticamente al modelo.

Ahora un fallo se puede descomponer:

| Síntoma | Pregunta |
|---|---|
| Fue por el camino equivocado | ¿falló routing? |
| Recibió información irrelevante | ¿falló retrieval? |
| Inventó un dato | ¿falló grounding o generación? |
| Respondió bien pero lento | ¿el presupuesto de CPU es razonable? |
| Sólo falla algunas veces | ¿hay suficiente repetibilidad? |

Eso cambia cómo se corrige el sistema.

Subir de 2B a un modelo mucho más grande puede mejorar una demo. También puede esconder un router mal planteado, contexto innecesario o conocimiento mal seleccionado.

## 06. Evaluar en el hardware real también es parte del diseño

Cuando todo corre sobre CPU, la latencia deja de ser una cifra secundaria.

Cada componente que agrego tiene que justificar su lugar en el hot path.

Por eso hoy prefiero:

- embeddings cacheados para datos estáticos;
- similitud coseno local;
- pocos documentos relevantes;
- un contexto acotado;
- generación sólo donde aporta lenguaje;
- guardrails específicos en lugar de otra capa generativa.

Y para los casos críticos, una ejecución correcta una sola vez tampoco alcanza. La repetibilidad sigue siendo una propiedad que hay que observar.

El objetivo final no es demostrar que 2B parámetros son suficientes para cualquier agente.

Es algo bastante más concreto:

> **Construir un sistema útil, auditable y suficientemente confiable que pueda correr en una laptop sin GPU.**

La restricción de hardware terminó siendo positiva. Me obligó a hacer explícito qué parte del problema necesita realmente inteligencia generativa y qué parte funciona mejor como software normal.
