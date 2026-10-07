# 0002 — Visión B2B de selección de talento (esquema de 9 pasos)

Estado: **pendiente de decisión del dueño** · Origen: esquema aportado por el ingeniero aeroespacial (imagen, 7 oct)

## Para el dueño

Un esquema presenta Choisys como herramienta para que las empresas comparen candidatos: situaciones, perfil,
porcentaje de similitud, ranking y botones Avanza/Descartar. No se implementa nada hasta que decidas.

## Qué propone

Assessment de 10 situaciones con tiempo limitado → perfil en radar de 6 dimensiones (Autonomía, Análisis, Riesgo,
Resultados, Personas, Adaptabilidad) → la empresa define un "Cubo de Neo objetivo" → similitud en % → ranking →
Avanza o Descarta.

## Cruce con las reglas cerradas

| Parte | Estado |
|---|---|
| Fases con cuadrícula 3×3, cronómetro, Run que forma un Cubo | Encaja |
| Radar, puntuaciones y % de similitud | Choca: es inferencia; no hay especificación matemática aprobada (neos-cube #8) y solo puede vivir en C++ |
| Cubo objetivo del puesto y comparación | Choca: otra forma de inferencia |
| Colores, tarjetas, botón "Siguiente", opciones con texto | Choca con la UI fijada (blanco y negro, sin Confirmar, cuadrícula) |
| Ranking y porcentajes | Dato público nuevo; hoy solo son públicos `measurements` y `phaseTransitions` |
| Avanza / Descarta | Decisión automatizada sobre personas: RGPD (art. 22) y reglamento de IA (selección de personal = alto riesgo); depende de #13 |

## Opciones

- **A. Mantener el modelo actual** y archivar este esquema como inspiración.
- **B. Adoptar la visión B2B** como producto objetivo: requiere reabrir reglas cerradas, aprobar la especificación (#8)
  y revisión legal antes de mostrar ranking o descarte.
- **C. Adoptar solo parte** (p. ej. informe sin ranking ni descarte automático). Indica cuál.

## Decisión

_(el dueño marca una opción al fusionar o comentar)_
