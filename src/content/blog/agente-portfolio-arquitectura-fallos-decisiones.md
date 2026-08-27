---
slug: agente-portfolio-arquitectura-fallos-decisiones
title: "El agente detrás de mi portfolio: arquitectura, fallos y decisiones"
description: "Cómo evolucionó el agente de mi portfolio desde un chatbot simple hasta una arquitectura pequeña, explícita y controlable."
pubDate: 2026-08-27
tags:
  - ai
  - agents
  - architecture
  - llm
draft: false
---

Mi portfolio podía mostrar proyectos, experiencia y tecnologías.

Pero seguía siendo una página estática.

Quería que alguien pudiera entrar y preguntar cosas como:

> ¿Qué experiencia tenés desarrollando aplicaciones con LLMs?

o:

> ¿Cuál de tus proyectos se parece más a un sistema de producción?

La primera idea parecía bastante sencilla:

```text
usuario
   ↓
portfolio
   ↓
LLM
   ↓
respuesta
```

Y para una demo, funcionaba.

El problema apareció cuando dejé de pensar en el agente como una interfaz de chat y empecé a pensar en él como algo que **habla en mi nombre**.

Ahí la tolerancia al error cambia.

Una respuesta creativa puede ser interesante.

Una respuesta creativa sobre mi experiencia profesional, no.

Y una interpretación incorrecta que termina disparando una acción es todavía peor.

Ese fue el punto de partida real del proyecto.

---

## 01. El problema no era generar texto

Hacer que un modelo responda preguntas es fácil.

Hacer que responda de forma consistente, sin inventar información y sin tomar decisiones que no le corresponden, es otro problema.

La primera versión era esencialmente:

```text
pregunta
   ↓
prompt
   ↓
modelo
   ↓
respuesta
```

Pero el modelo empezaba a acumular demasiadas responsabilidades:

- entender la intención;
- decidir qué información usar;
- decidir si correspondía una acción;
- responder;
- mantener contexto;
- respetar restricciones;
- no inventar.

Con modelos grandes, este tipo de arquitectura puede parecer razonable porque el modelo compensa muchos defectos.

Con modelos pequeños, las costuras aparecen enseguida.

Y eso fue exactamente lo que pasó.

---

## 02. Funcionaba... hasta que dejaba de funcionar

Las primeras pruebas eran engañosas.

Había conversaciones que funcionaban perfectamente:

```text
USER
¿Qué experiencia tenés con RAG?

AGENT
He trabajado con sistemas RAG orientados a aplicaciones...
```

Pero pequeñas variaciones podían cambiar el comportamiento.

```text
USER
Contame algo de tu experiencia.

USER
¿Y con RAG?

AGENT
...
```

La respuesta podía seguir siendo buena, pero la ruta interna ya no siempre era la misma.

Peor todavía: una frase relacionada con disponibilidad podía interpretarse como intención de calendario.

Por ejemplo:

> La semana que viene podríamos hablar.

Eso no significa:

```text
CREATE_EVENT
```

El problema no era solamente que el modelo se equivocara.

El problema era que estábamos usando probabilidad para resolver decisiones que necesitaban ser mucho más estables.

Ahí apareció una regla que terminó guiando buena parte del diseño:

> **Una respuesta puede ser probabilística. Una regla de seguridad no debería serlo.**

---

## 03. Separar intención, acción y lenguaje

La siguiente evolución fue sacar responsabilidades del modelo.

La arquitectura empezó a tomar una forma más explícita:

```text
                         USER
                          │
                          ▼
                    ┌──────────┐
                    │  ROUTER  │
                    └────┬─────┘
                         │
            ┌────────────┼────────────┐
            │            │            │
            ▼            ▼            ▼
        RESPONDER     SCHEDULER      SAFETY
            │            │
            └──────┬─────┘
                   ▼
              STREAM GUARD
                   │
                   ▼
                RESPONSE
```

Cada componente pasó a tener una responsabilidad mucho más limitada.

### Router

El router responde una pregunta:

> ¿Qué tipo de interacción es esta?

No genera la respuesta final.

No toca calendario.

No administra memoria.

Clasifica.

Nada más.

### Responder

El responder se concentra en lenguaje natural.

Ahí sí queremos flexibilidad.

Puede resumir, explicar, adaptar el tono y responder en español o inglés.

Pero no debería decidir por sí solo que una conversación necesita una acción sensible.

### Scheduler

Las operaciones relacionadas con calendario quedaron aisladas.

La interpretación puede involucrar un modelo.

La ejecución, no.

Antes de hacer algo, el sistema debe validar que la intención esté clara y que los parámetros sean suficientes.

### StreamGuard

Antes de entregar la respuesta al usuario existe una última capa de control.

Conceptualmente:

```text
modelo genera
      ↓
sistema valida
      ↓
usuario recibe
```

El prompt dejó de ser la única línea de defensa.

---

## 04. El modelo puede interpretar; el sistema debe decidir

Un LLM es muy bueno trabajando con ambigüedad.

Por ejemplo:

> Estoy buscando a alguien que haya trabajado con sistemas distribuidos y AI.

Eso requiere interpretación.

No queremos resolverlo con veinte `if`.

Pero hay preguntas que funcionan mejor como código:

```text
¿la fecha es válida?
¿el horario existe?
¿hay información suficiente?
¿esta acción requiere confirmación?
¿el estado permite continuar?
```

La división terminó siendo aproximadamente esta:

| Problema | Responsable |
|---|---|
| Interpretar lenguaje natural | LLM |
| Clasificar intención | Router |
| Generar explicación | LLM |
| Validar parámetros | Código |
| Aplicar reglas de calendario | Código |
| Ejecutar una acción | Tool / servicio |
| Controlar salida | Guard |
| Mantener conocimiento profesional | Datos estructurados |

Parece un cambio pequeño.

En la práctica fue uno de los más importantes.

---

## 05. KISS dejó de ser una preferencia

Durante el desarrollo aparecieron muchas oportunidades para agregar cosas:

- más agentes;
- más memoria;
- planificación;
- grafos;
- RAG;
- evaluadores internos;
- más tools;
- más estados.

La pregunta empezó a ser:

> **¿Qué problema concreto resuelve esta capa?**

Si no había una respuesta clara, probablemente esa capa no tenía que existir.

Eso cambió la dirección del proyecto.

En lugar de preguntar:

> ¿Qué más podemos agregar?

empezamos a preguntar:

> ¿Qué podemos sacar sin perder comportamiento?

La arquitectura terminó siendo más pequeña y, sobre todo, más fácil de entender.

---

## 06. ¿Por qué no LangGraph?

LangGraph parecía una opción natural.

Había routing, estado y diferentes caminos de ejecución.

Pero el flujo real seguía siendo bastante corto:

```text
route
  ↓
execute
  ↓
respond
```

Introducir un grafo habría agregado otra abstracción para representar algo que todavía podíamos explicar mirando unos pocos componentes.

No era una crítica a LangGraph.

Era una cuestión de proporcionalidad.

Un framework de workflows empieza a tener mucho más sentido cuando aparecen:

- branching complejo;
- varias tools encadenadas;
- reintentos;
- estados persistentes;
- human-in-the-loop;
- workflows largos.

Nuestro problema todavía no estaba ahí.

La regla fue simple:

> **Si podemos entender el flujo completo mirando unos pocos archivos, no necesitamos construir una plataforma alrededor del agente.**

Eso puede cambiar más adelante.

La arquitectura no intenta impedirlo.

Simplemente evita pagar ese costo antes de necesitarlo.

---

## 07. La arquitectura final se empezó a parecer a software normal

Después de varias iteraciones, el sistema dejó de parecer un “agente inteligente” y empezó a parecer más una aplicación bien separada.

Eso era una buena señal.

```text
                           USER
                            │
                            ▼
                     ┌────────────┐
                     │   ROUTER   │
                     └──────┬─────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
              ▼             ▼             ▼
         CONVERSATION    SCHEDULING     SAFETY
              │             │
              ▼             ▼
          RESPONDER      SCHEDULER
              │             │
              └──────┬──────┘
                     │
                     ▼
                STREAM GUARD
                     │
                     ▼
                  RESPONSE
```

El LLM seguía siendo importante.

Pero ya no era el sistema completo.

Era un componente dentro del sistema.

---

## 08. Lo más útil fueron los fallos

Las conversaciones correctas demostraban que el agente podía funcionar.

Las incorrectas mostraban dónde estaba mal diseñada la arquitectura.

Cada fallo obligaba a hacer una pregunta:

> ¿Esto se corrige con un prompt?

> ¿Con mejor contexto?

> ¿Con una regla?

> ¿Separando responsabilidades?

> ¿O estamos usando un LLM para resolver algo que no necesita un LLM?

Ese proceso fue reduciendo comportamiento implícito y aumentando decisiones explícitas.

Y esa probablemente fue la lección principal de esta primera etapa:

**Construir un agente confiable consistió menos en darle más autonomía al modelo y más en decidir qué responsabilidades no debía tener.**

En la [segunda parte](/posts/agente-portfolio-modelos-pequenos-evaluacion/) voy a entrar en el otro problema: una vez que la arquitectura parece razonable, **¿cómo comprobamos que realmente funciona?**
