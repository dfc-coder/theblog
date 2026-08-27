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

En la [primera parte](/posts/agente-portfolio-arquitectura-fallos-decisiones/) el problema era arquitectónico:

> ¿Qué debería decidir el modelo y qué debería decidir el sistema?

Una vez separadas las responsabilidades, apareció un segundo problema.

El agente tenía que funcionar con un modelo suficientemente pequeño como para ejecutarse en el navegador.

Eso significaba que ya no alcanzaba con decir:

> Parece funcionar.

Había que medirlo.

---

## 01. El conocimiento no necesitaba empezar con RAG

La primera intuición para un agente que conoce mi experiencia era usar RAG.

La arquitectura típica habría sido:

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

Pero había una pregunta básica:

> ¿Qué estamos buscando realmente?

La información de un portfolio es relativamente pequeña.

Además es conocida, estructurada y controlada.

No estamos consultando miles de documentos.

Estamos describiendo:

- experiencia;
- proyectos;
- tecnologías;
- formación;
- certificaciones.

Así que terminamos favoreciendo conocimiento explícito.

```text
PROFILE
│
├── experience
├── projects
├── skills
├── education
├── certifications
└── business context
```

Eso eliminó infraestructura que todavía no aportaba valor.

### Menos piezas

No necesitamos embeddings, base vectorial ni pipeline de indexación.

### Más auditabilidad

Podemos saber exactamente qué información está disponible.

### Actualizaciones más simples

Cambiar experiencia o proyectos no implica reconstruir un índice.

RAG sigue siendo útil.

Simplemente no era automáticamente la herramienta correcta para este caso.

---

## 02. Los modelos pequeños cambiaron el problema

El agente debía poder ejecutarse en browser usando WebLLM.

Eso imponía una restricción importante.

No podíamos simplemente resolver cada dificultad aumentando el tamaño del modelo.

Probamos variantes pequeñas, incluyendo modelos alrededor de 0.8B y 2B parámetros.

Ahí apareció algo interesante.

Un modelo grande puede esconder una arquitectura ambigua.

Un modelo pequeño no.

```text
arquitectura ambigua
        +
modelo pequeño
        =
fallo visible
```

Si le pedíamos demasiadas cosas al mismo tiempo, fallaba.

Si el prompt dependía de matices muy finos, fallaba.

Si mezclábamos clasificación, acción y respuesta, fallaba.

Eso terminó siendo útil.

Los modelos pequeños funcionaban como una especie de detector de deuda arquitectónica.

---

## 03. 0.8B contra 2B no era una competencia de inteligencia

La pregunta no era:

> ¿Cuál modelo parece más inteligente?

Era:

> ¿Cuál es el modelo más pequeño que cumple correctamente el contrato del sistema?

Eso cambia bastante la evaluación.

Un modelo de 0.8B puede ser suficiente para una tarea muy acotada.

Pero si le pedimos que:

- interprete intención;
- decida una acción;
- valide parámetros;
- mantenga contexto;
- genere una respuesta perfecta;

probablemente estemos evaluando más la arquitectura que el modelo.

Separar responsabilidades hizo que la comparación fuera mucho más útil.

Ya no medíamos una sensación general de calidad.

Medíamos comportamiento concreto.

---

## 04. Probar conversaciones a mano dejó de alcanzar

Al principio las pruebas eran manuales.

Abrir el portfolio.

Preguntar algo.

Mirar la respuesta.

Repetir.

Eso sirve para desarrollar.

No sirve para demostrar estabilidad.

La evaluación empezó a parecerse más a esto:

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

---

## 05. No todos los errores cuestan lo mismo

Uno de los fallos más importantes era el scheduling incorrecto.

Por ejemplo:

> Tal vez la semana próxima tenga tiempo.

Eso no significa:

```text
CREATE_EVENT
```

Tampoco:

> ¿Podríamos hablar algún día?

La clasificación incorrecta de una pregunta técnica puede producir una mala respuesta.

La clasificación incorrecta de una intención sensible puede producir una acción.

No tienen el mismo costo.

Por eso una métrica importante pasó a ser:

```text
false_scheduling_rate
```

La pregunta dejó de ser:

> ¿Qué accuracy tiene el router?

y pasó a incluir:

> ¿Con qué frecuencia entra a una ruta sensible cuando no debería?

Esa diferencia importa.

Una buena evaluación no mide solamente cuántos errores hay.

También mide **qué errores son aceptables**.

---

## 06. Un PASS tampoco era suficiente

Los LLMs son probabilísticos.

Que un caso funcione una vez no dice demasiado.

Supongamos:

```text
USER
Me interesa tu experiencia con AWS.
```

Ejecutamos la prueba.

Funciona.

Bien.

Pero necesitamos algo más cercano a:

```text
caso crítico

run 1 → PASS
run 2 → PASS
run 3 → PASS
run 4 → PASS
run 5 → PASS
```

No sólo:

```text
run 1 → PASS
```

Ahí aparece la idea de `pass^k`.

Para rutas críticas, la repetibilidad importa tanto como el resultado individual.

Un agente que funciona cuatro veces y falla la quinta todavía tiene un problema si esa quinta ejecución puede disparar una acción incorrecta.

---

## 07. Evaluar el agente como sistema

La evaluación terminó separándose en varias dimensiones.

### Routing

¿Eligió la ruta correcta?

### Formato

¿Produjo JSON válido cuando debía hacerlo?

### Safety

¿Intentó ejecutar algo cuando no correspondía?

### Idioma

¿Respondió en el idioma de la conversación?

### Latencia

¿El modelo sigue siendo usable dentro del browser?

### Consistencia

¿Mantiene el comportamiento cuando repetimos el mismo caso?

Conceptualmente:

```text
                 ┌──────────────┐
input ─────────→ │    AGENT     │
                 └──────┬───────┘
                        │
        ┌───────────────┼────────────────┐
        │               │                │
        ▼               ▼                ▼
     ROUTING          SAFETY         RESPONSE
        │               │                │
        ▼               ▼                ▼
   accuracy         false rate       quality
```

Ese cambio fue importante.

Dejamos de evaluar únicamente la respuesta final.

Empezamos a evaluar el comportamiento interno que la producía.

---

## 08. El modelo pequeño terminó siendo una ventaja

Al principio la restricción de ejecutar un modelo pequeño parecía sólo una limitación.

Después dejó de serlo.

Obligó a hacer explícitas cosas que un modelo más grande podía resolver de forma implícita.

Si una tarea requería demasiada interpretación, teníamos que simplificarla.

Si un contrato era ambiguo, teníamos que definirlo mejor.

Si una ruta dependía demasiado del prompt, teníamos que revisar el diseño.

Eso llevó a una conclusión que no esperaba al empezar:

> **Un modelo pequeño puede mejorar la arquitectura porque deja de ocultar sus defectos.**

No porque sea más capaz.

Sino porque obliga al sistema a ser más claro.

---

## 09. Qué mediría antes de cambiar de modelo

Cuando un modelo falla, cambiarlo es tentador.

Pero antes conviene separar tres posibilidades:

```text
¿falla el modelo?
        │
        ├── sí → probar otro modelo
        │
        └── no
             │
             ▼
¿falla el prompt?
        │
        ├── sí → simplificar contrato
        │
        └── no
             │
             ▼
¿falla la arquitectura?
```

Un modelo más grande puede mejorar el resultado.

Pero también puede esconder que el sistema le está pidiendo demasiado.

Por eso la evaluación tiene que existir antes de tomar la decisión.

Sin métricas, cambiar de modelo se convierte en prueba y error.

---

## 10. Lo que me quedó del proyecto

Después de trabajar con esta restricción, algunas ideas quedaron bastante claras.

### RAG no es obligatorio

Si el conocimiento es pequeño y estructurado, una representación explícita puede ser mejor.

### Los modelos pequeños no deberían hacer todo

Cuanto más pequeña la capacidad, más importante es reducir responsabilidades.

### Una conversación bonita no es una métrica

Necesitamos observar rutas, formatos, errores sensibles, latencia y repetibilidad.

### No todos los fallos tienen el mismo costo

Un false positive en scheduling importa mucho más que una respuesta ligeramente menos elegante.

### La estabilidad también es una feature

Que algo funcione una vez no alcanza.

En sistemas probabilísticos, la repetibilidad forma parte del comportamiento esperado.

---

## 11. El resultado

El objetivo del proyecto nunca fue demostrar que un modelo pequeño podía hacer todo.

Era exactamente lo contrario.

Quería descubrir **qué era lo mínimo que el modelo tenía que hacer bien** para que el resto del sistema pudiera mantener control y previsibilidad.

La arquitectura resolvió una parte.

La evaluación resolvió la otra.

Y juntas cambiaron la pregunta inicial.

Ya no era:

> ¿Qué tan inteligente puede ser este agente?

Sino:

> **¿Qué tan confiable puede ser este sistema usando la menor cantidad de inteligencia necesaria?**

Esa terminó siendo una pregunta mucho más útil.
