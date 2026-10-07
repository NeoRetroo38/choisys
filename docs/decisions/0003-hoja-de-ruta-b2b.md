# 0003 — Hoja de ruta B2B "De código a venta" (5 fases)

Estado: **pendiente de decisión del dueño** · Origen: documento aportado por el doble grado de Farmacia y ADE (imagen, 7 oct)

## Para el dueño

Una hoja de ruta propone 5 fases hasta vender evaluaciones a empresas. Varias chocan con las reglas cerradas.
No se implementa nada hasta que decidas. Tampoco coincide con el esquema de 0002.

## Cruce con las reglas cerradas

| Fase | Estado |
|---|---|
| 1. Compilar el núcleo C++ a Wasm o API ligera; base mínima con ID de candidato y decisiones | API ligera y esquema Prisma ya existen. **Wasm choca:** entrega el motor privado al cliente |
| 2. 7–10 fases con narrativa corporativa | Choca: el modelo cerrado es 3 fases, cubo 3×3×3 |
| 3. Web ultraligera móvil primero, 3 botones de opción | Web ligera = #11. Choca con la UI fijada (cuadrícula, sin Confirmar) |
| 4. Procesar el Cubo; panel o PDF con autonomía, riesgo y cooperación | Choca: inferencia sin especificación (neos-cube #8); solo en C++ |
| 5. Stripe Payment Links y códigos de acceso | Fuera de alcance: falta entidad "empresa", textos legales (#13); la cuenta de pago es del dueño |

## Notas

- Un ID de candidato es dato personal (RGPD): pseudonimizar y definir retención antes de guardarlo.
- Los dos documentos (0002 y 0003) usan números distintos de fases (10 situaciones frente a 7–10 fases).

## Opciones

- **A. Mantener el modelo actual** y archivar la hoja de ruta.
- **B. Adoptarla**, empezando por la fase que elijas; las que chocan requieren decisión expresa sobre reglas cerradas.
- **C. Aprovechar solo lo compatible** (web ligera #11, informe sin inferencia) y aplazar Wasm, 7–10 fases y Stripe.

## Decisión

_(el dueño marca una opción al fusionar o comentar)_
