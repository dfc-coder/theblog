---
slug: agente-portfolio-modelos-pequenos-evaluacion
title: "El agente detrás de mi portfolio II: modelos pequeños, conocimiento y evaluación"
description: "Cómo evalué modelos pequeños, descarté complejidad innecesaria y medí si el agente de mi portfolio era realmente estable."
pubDate: 2026-08-27
tags:
  - ai
  - agents
  - evaluation
  - llm
  - webllm
draft: false
---

En la [primera parte](/posts/agente-portfolio-arquitectura-fallos-decisiones/) el problema era arquitectónico: **qué debía decidir el modelo y qué debía decidir el sistema**.

Después apareció otra pregunta.

El agente tenía que funcionar con un modelo pequeño, dentro del navegador. ¿Cómo saber si realmente era confiable?

> **“Parece funcionar” dejó de ser una forma aceptable de evaluar el sistema.**

## 01. El conocimiento no necesitaba RAG

La primera intuición era bastante estándar:

```text
CV
  ↓
chunks
  ↓
embeddings
  ↓
vector database
  ↓
retrieval
  ↓
LLM
```

Pero el conocimiento del portfolio era pequeño, estructurado y controlado.

No estábamos buscando respuestas entre miles de documentos. Estábamos describiendo experiencia, proyectos y habilidades.

Así que preferimos algo más explícito:

```text
PROFILE
│
├── experience
├── projects
├── skills
├── education
└── certifications
```

El resultado: menos infraestructura, actualización más simple y mejor auditabilidad.

RAG seguía siendo una opción. Simplemente **no resolvía un problema que todavía tuviéramos**.

## 02. Los modelos pequeños expusieron la arquitectura

El agente debía ejecutarse con WebLLM, así que probamos modelos pequeños, incluyendo variantes alrededor de 0.8B y 2B parámetros.

Ahí apareció un patrón:

```text
arquitectura ambigua
        +
modelo pequeño
        =
fallo visible
```

Si el prompt dependía de matices muy finos, fallaba.

Si mezclábamos clasificación, acción y respuesta, fallaba.

Si le pedíamos demasiadas responsabilidades al mismo tiempo, fallaba.

Eso terminó siendo útil. El modelo pequeño dejó de ocultar decisiones arquitectónicas débiles.

La comparación 0.8B vs. 2B dejó entonces de ser “cuál parece más inteligente”. La pregunta correcta era:

> **¿Cuál es el modelo más pequeño que cumple el contrato del sistema?**

## 03. De conversaciones manuales a evaluación

Al principio probábamos como cualquiera:

```text
abrir portfolio
      ↓
preguntar algo
      ↓
mirar respuesta
```

Sirve para desarrollar. No sirve para medir estabilidad.

La evaluación pasó a cubrir decenas de conversaciones y varias dimensiones:

```text
50–100 conversaciones
          │
          ▼
        ROUTER
          │
          ▼
 ┌──────────────────────┐
 │ intención correcta   │
 │ JSON válido          │
 │ false scheduling     │
 │ idioma correcto      │
 │ latencia             │
 │ consistencia         │
 └──────────────────────┘
```

El router dejó de ser “algo que parece funcionar” y pasó a ser un componente medible.

## 04. No todos los errores cuestan lo mismo

Una clasificación incorrecta en una pregunta técnica produce una mala respuesta.

Una clasificación incorrecta en scheduling puede producir una acción.

No tienen el mismo costo.

Por ejemplo:

> Tal vez la semana próxima tenga tiempo.

no debería convertirse en:

```text
CREATE_EVENT
```

Por eso una métrica importante fue `false_scheduling_rate`.

No bastaba con preguntar cuántos aciertos tenía el router. También necesitábamos saber **qué tipo de error estaba cometiendo**.

## 05. Un PASS no era suficiente

Los LLMs son probabilísticos.

Un caso que funciona una vez no demuestra estabilidad.

```text
caso crítico

run 1 → PASS
run 2 → PASS
run 3 → PASS
run 4 → PASS
run 5 → PASS
```

Esa repetibilidad, cercana a la idea de `pass^k`, era especialmente importante para rutas sensibles.

Un agente que acierta cuatro veces y falla la quinta todavía tiene un problema si ese fallo puede producir una acción incorrecta.

La estabilidad pasó a ser una feature observable.

## 06. Qué terminó importando

La restricción de usar un modelo pequeño terminó mejorando el proyecto.

Nos obligó a separar tres preguntas:

```text
¿falla el modelo?
      ↓
¿falla el contrato?
      ↓
¿falla la arquitectura?
```

Cambiar por un modelo más grande puede mejorar la salida. También puede esconder que el sistema le está pidiendo demasiado.

Por eso me quedaron cinco reglas:

- RAG no es obligatorio;
- un modelo pequeño no debería hacer todo;
- una conversación bonita no es una métrica;
- no todos los errores tienen el mismo costo;
- la repetibilidad forma parte de la confiabilidad.

> **El objetivo nunca fue construir el agente más inteligente. Fue construir el sistema más confiable usando la menor cantidad de inteligencia necesaria.**
