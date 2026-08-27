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

Mi portfolio podía mostrar proyectos, experiencia y tecnologías. Pero seguía siendo una página estática.

Quería que alguien pudiera preguntar por mi trabajo y obtener una respuesta útil. El primer diseño parecía obvio:

```text
usuario
   ↓
portfolio
   ↓
LLM
   ↓
respuesta
```

Funcionó como demo. El problema apareció cuando el agente dejó de ser sólo un chat y pasó a **hablar en mi nombre**.

Ahí una respuesta creativa ya no siempre es una buena respuesta.

> **La pregunta dejó de ser “¿cómo genero mejores respuestas?” y pasó a ser “¿qué decisiones debería poder tomar el modelo?”.**

## 01. El modelo estaba haciendo demasiado

La primera versión acumulaba responsabilidades en un mismo lugar:

- entender la intención;
- elegir información;
- decidir si correspondía una acción;
- responder;
- mantener contexto;
- respetar restricciones.

Con un modelo grande, parte de esa complejidad queda escondida. Con uno pequeño, aparece enseguida.

Y apareció.

Una conversación podía funcionar cinco veces y cambiar de ruta en la sexta. Una frase sobre disponibilidad podía terminar interpretada como una intención de calendario.

```text
USER
La semana que viene podríamos hablar.

≠

CREATE_EVENT
```

Ese fallo dejó una regla bastante clara:

> **Una respuesta puede ser probabilística. Una regla de seguridad no debería serlo.**

## 02. Separar intención, acción y lenguaje

La solución no fue agregar otro agente. Fue sacar responsabilidades del modelo.

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

**Router** clasifica la interacción. No redacta ni ejecuta.

**Responder** se ocupa del lenguaje natural: explicar, resumir y mantener el idioma de la conversación.

**Scheduler** concentra la lógica de calendario y sólo actúa cuando la intención y los datos son suficientes.

**StreamGuard** controla lo que finalmente se expone al usuario.

La arquitectura empezó a mejorar cuando cada componente pudo describirse en una frase.

## 03. El modelo interpreta; el sistema decide

Hay problemas para los que un LLM es excelente:

> Estoy buscando a alguien que haya trabajado con sistemas distribuidos y AI.

Eso requiere interpretar lenguaje ambiguo.

Pero otras decisiones no necesitan creatividad:

```text
¿la fecha es válida?
¿hay datos suficientes?
¿esta acción requiere confirmación?
¿el estado permite continuar?
```

La división terminó siendo esta:

| Problema | Responsable |
|---|---|
| Interpretar lenguaje | LLM |
| Clasificar intención | Router |
| Generar una explicación | LLM |
| Validar parámetros | Código |
| Aplicar reglas de calendario | Código |
| Ejecutar una acción | Tool / servicio |
| Controlar salida | Guard |

**El modelo puede trabajar con ambigüedad. El sistema conserva la autoridad sobre las reglas.**

## 04. KISS se volvió una restricción

Cada fallo invitaba a agregar algo: más memoria, más tools, planificación, RAG, otro agente, un grafo.

Empezamos a usar una pregunta más útil:

> **¿Qué problema concreto resuelve esta nueva capa?**

Si no podíamos responderla claramente, no la agregábamos.

Por eso tampoco usamos LangGraph en esta etapa. El flujo real todavía podía explicarse así:

```text
route
  ↓
execute
  ↓
respond
```

Un grafo tendría sentido con branching complejo, múltiples tools encadenadas, reintentos o estados persistentes. Todavía no teníamos ese problema.

La arquitectura futura no debía convertirse en complejidad presente.

## 05. La arquitectura empezó a parecer software normal

Después de varias iteraciones, el agente dejó de parecer una entidad que “hace todo” y pasó a parecer una aplicación con límites claros.

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

Pero **ya no era el sistema completo**. Era un componente dentro del sistema.

## 06. Los fallos terminaron diseñando el agente

Las conversaciones correctas demostraban que el agente podía funcionar. Las incorrectas mostraban dónde estaba mal diseñada la arquitectura.

Cada fallo obligaba a decidir:

- ¿se corrige con contexto?;
- ¿con una regla?;
- ¿separando responsabilidades?;
- ¿o estamos usando un LLM donde no hace falta uno?

Ese proceso redujo comportamiento implícito y aumentó decisiones explícitas.

> **Construir un agente confiable consistió menos en darle más autonomía al modelo y más en decidir qué responsabilidades no debía tener.**

En la [segunda parte](/posts/agente-portfolio-modelos-pequenos-evaluacion/) el foco cambia: una vez que la arquitectura parece razonable, **¿cómo comprobamos que realmente funciona?**
