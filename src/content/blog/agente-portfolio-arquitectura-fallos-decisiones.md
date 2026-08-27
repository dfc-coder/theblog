---
slug: agente-portfolio-arquitectura-fallos-decisiones
title: "El agente detrás de mi portfolio: arquitectura, fallos y decisiones"
description: "Cómo diseñé un representante conversacional para mi portfolio que corre localmente sobre CPU, con un modelo pequeño y límites explícitos entre lenguaje, conocimiento y control."
pubDate: 2026-08-27
tags:
  - ai
  - agents
  - architecture
  - llm
  - local-ai
draft: false
---

Mi portfolio ya podía mostrar proyectos, experiencia y tecnologías. Lo que no podía hacer era responder una pregunta concreta sobre mi trabajo.

Quería agregar un agente que pudiera hacerlo, pero con una restricción importante: **tenía que correr localmente en una laptop, sobre CPU**.

No buscaba el agente más autónomo posible. Buscaba uno que pudiera representar mi experiencia sin convertir cada decisión del sistema en una generación del LLM.

> **La pregunta no era “¿cuánto puede hacer el modelo?”, sino “¿qué cosas vale la pena que haga el modelo?”.**

## 01. La restricción de CPU cambió el diseño

El modelo conversacional actual es un Qwen3.5-2B cuantizado ejecutándose con `llama.cpp`. No usa GPU.

Eso vuelve visibles decisiones que con un modelo grande y remoto son fáciles de esconder detrás de más tokens, más contexto o una llamada adicional.

Por ejemplo, usar el modelo generativo sólo para decidir a qué parte del sistema enviar cada mensaje sería caro y además innecesariamente variable.

El flujo que terminé buscando es bastante más simple:

```graph
title: Flujo principal del agente
direction: TB
visitor[terminal]: VISITOR
router[accent]: SEMANTIC ROUTER
retriever: PROFILE RETRIEVER
assembler: CONTEXT ASSEMBLER
llm[accent]: QWEN3.5-2B
guard: STREAM GUARD
sse[terminal]: SSE
visitor -> router
router -> retriever | business
retriever -> assembler
assembler -> llm
router -> llm | general
llm -> guard
guard -> sse
```

El LLM sigue siendo importante. Pero dejó de ser el lugar donde ocurre todo.

## 02. El router no necesitaba generar texto

Para clasificar una consulta uso un segundo modelo pequeño: `Qwen3-Embedding-0.6B`.

Las descripciones de las rutas se convierten en embeddings al iniciar el servicio y quedan cacheadas. En cada turno sólo hace falta generar el embedding de la consulta y comparar similitud coseno.

```graph
title: Routing semántico con embeddings
direction: TB
routes[muted]: route descriptions
message[terminal]: user message
route_embeddings: route embeddings · cached
query_embedding: query embedding
similarity[accent]: cosine similarity
route[terminal]: route
routes -> route_embeddings
message -> query_embedding
route_embeddings -> similarity
query_embedding -> similarity
similarity -> route
```

Esto separa dos problemas diferentes:

- **entender hacia dónde va una consulta**;
- **redactar una respuesta natural**.

No necesito pagar una generación autoregresiva para resolver el primero.

## 03. El modelo no “sabe” mi portfolio

Otro cambio importante fue sacar el conocimiento profesional del prompt gigante.

El perfil está estructurado en datos controlados: experiencia, proyectos, skills, educación, certificaciones, servicios y otra información profesional.

Ese perfil se divide en documentos pequeños y sus embeddings se calculan una sola vez durante el arranque.

```graph
title: Preparación del conocimiento profesional
direction: TB
profile[terminal]: BUSINESS PROFILE
sections: experience · projects · skills\neducation · certifications · services
documents: small documents
embeddings[accent]: cached embeddings
profile -> sections
sections -> documents
documents -> embeddings
```

Cuando llega una pregunta profesional, el sistema recupera sólo los documentos más relevantes y los incorpora al contexto del modelo.

No hay una vector database ni un pipeline de documentos externo. Para este volumen de conocimiento, un índice en memoria y similitud coseno son suficientes.

> **El modelo no elige qué recordar de mí. El sistema decide qué evidencia recibe.**

## 04. Grounding antes que una respuesta convincente

Un representante profesional tiene un problema distinto a un chatbot genérico: una respuesta plausible pero falsa es peor que una respuesta incompleta.

Por eso el prompt de negocio trata el conocimiento recuperado como la fuente autorizada. Si un dato no está ahí, el agente no debería completarlo por intuición.

Eso aplica especialmente a información como:

- experiencia;
- proyectos;
- clientes;
- resultados;
- credenciales;
- servicios o condiciones comerciales.

Después de la generación, `StreamGuard` agrega una última frontera sobre el texto que sale al usuario y bloquea un conjunto pequeño de afirmaciones que el modelo no debería hacer, como presentarse como si fuera la persona del portfolio o afirmar acciones externas no verificadas.

La idea no es moderar cada palabra. Es proteger invariantes concretos.

## 05. KISS dejó afuera bastante tecnología

Era fácil convertir este proyecto en una colección de piezas “agentic”:

```text
más tools
+ planner
+ vector database
+ reranker adicional
+ ReAct loop
+ LangGraph
+ más agentes
```

Pero el flujo real no lo necesitaba.

Para el problema actual alcanzaba con:

```graph
title: Hot path mínimo
direction: LR
route[terminal]: route
retrieve: retrieve when needed
assemble: assemble context
generate[accent]: generate
guard[terminal]: guard
route -> retrieve
retrieve -> assemble
assemble -> generate
generate -> guard
```

No usar una pieza no significa que sea mala. Significa que todavía no existe un problema que justifique su costo.

## 06. El sistema terminó haciendo más para que el modelo hiciera menos

La parte más útil del proyecto no fue conseguir que un modelo de 2B pareciera uno mucho más grande.

Fue repartir correctamente el trabajo.

| Responsabilidad | Dueño |
|---|---|
| Routing semántico | Embeddings + código |
| Selección de conocimiento | Retriever |
| Construcción de contexto | Código |
| Lenguaje natural | Qwen3.5-2B |
| Fuente de verdad profesional | Perfil estructurado |
| Límites de salida | Prompt + StreamGuard |
| Estado de conversación | Aplicación |

El resultado es una arquitectura menos espectacular que un “agente autónomo”, pero bastante más fácil de entender, medir y corregir.

> **Para que un modelo chico funcione bien, muchas veces el sistema que lo rodea tiene que asumir más responsabilidad, no menos.**

En la [segunda parte](/posts/agente-portfolio-modelos-pequenos-evaluacion/) entro en la otra mitad del problema: por qué terminé ejecutando dos modelos pequeños localmente, qué aprendí comparando tamaños y cómo evaluar un agente así sin conformarse con que “parezca funcionar”.
