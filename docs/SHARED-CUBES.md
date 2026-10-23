# Cubos de referencia compartidos

Estado: implementado (API y base de datos; la interfaz llega en su propio PR). Pedido por el dueño el 23 oct 2026.

```text
Mis cubos → cubo → run propio completado = referencia → enlace → participantes sin cuenta → runs → comparación
```

No es otro producto ni un panel de empresa: es una capacidad de **Mis cubos**. RRHH es el primer uso
(cubo del puesto → enlace a candidatos), pero nada en el modelo es específico de RRHH.

## Arquitectura

```text
app → API choisys (valida, autoriza, guarda) → 127.0.0.1:8765 neo-cube-service (C++) → /evaluate y /compare
```

- La similitud la calcula solo el motor C++ (`POST /compare`, fórmula en `neos-cube/docs/COMPARISON.md`).
  La API la pide, comprueba su forma (0–100, una décima, una entrada por fase) y la guarda. La app solo la muestra.
- Los participantes juegan con la misma sesión y el mismo `/evaluate` que un cubo propio: la API fija la forma
  de la versión publicada y, al completar, guarda la run y pide la comparación.

## Modelo de datos (migración `20261023000000_shared_cubes`, aditiva)

| Tabla | Qué guarda |
|---|---|
| `cube_shares` | Enlace: versión del cubo (`cube_version_id`), run de referencia (`reference_run_id`), `token`, `closed_at` |
| `cube_participants` | Persona sin cuenta: `display_name`, `email` opcional, `token_hash` (SHA-256; el token no se guarda) |
| `cube_data` | Runs. Nuevo `participant_id`; `profile_id` admite NULL. CHECK: exactamente uno de los dos |

- La comparación se guarda en `cube_data.inference_data.comparison` = `{ referenceRunId, similarity, phases }`.
  Los datos en bruto (`output_data.measurements`) quedan separados del derivado.
- Cascadas: borrar la cuenta del dueño borra sus cubos, versiones, enlaces, participantes y sus runs. Borrar una
  run de referencia deja el enlace y los participantes, sin comparación (`SET NULL`). Cerrar un enlace no borra nada.
- Verificación sin servidor: `npm install --no-save @electric-sql/pglite && node apps/api/prisma/verify-shared-cubes-migration.mjs`.

## Versionado

Las versiones (`cube_versions`) son inmutables. Editar un cubo (`POST /cubes/:id/versions`) crea la siguiente.
Un enlace apunta a la versión de su run de referencia; sus participantes, runs y comparaciones siguen en esa
versión aunque el cubo cambie después.

## Endpoints

Dueño (sesión de cuenta, capacidad `cubes.manage.own`; un cubo o enlace ajeno responde 404):

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| POST | `/cubes/:id/versions` | `{ name, phases }` (igual que crear) | `CubeResponse` con la versión nueva |
| POST | `/cubes/:id/shares` | `{ referenceRunId }` | 201 `CubeShareResponse` |
| GET | `/cubes/:id/shares/:shareId` | — | `CubeShareResponse`: participantes ordenados por similitud |
| POST | `/cubes/:id/shares/:shareId/close` | `{}` | `CubeShareResponse` con `open: false` |

`GET /cubes` añade `openShares` y `participants`; `GET /cubes/:id` añade `shares`.

Público (sin cuenta):

| Método | Ruta | Auth | Respuesta |
|---|---|---|---|
| GET | `/c/:token` | — | `{ name, shape, open }` |
| POST | `/c/:token/participants` | — | 201 `{ participantToken }` (`{ displayName, email? }`) |
| POST | `/c/:token/sessions` | `Bearer <participantToken>` | igual que `/sessions` (`{}` como cuerpo) |
| POST | `/c/:token/evaluate` | `Bearer <participantToken>` | igual que `/evaluate` |
| GET | `/c/:token/me` | `Bearer <participantToken>` | `{ displayName, shape, runs }`: solo sus runs |

Un enlace cerrado responde `409 SHARE_CLOSED` a nuevos participantes y nuevas sesiones; `/me` sigue funcionando.

## Ranking

Cada participante se ordena por la similitud de su última run completada (ranking de competición: empate, mismo
puesto). Sin run completada o sin comparación, sin puesto. La UI lo nombra «similitud con el cubo de referencia»:
mide proximidad dentro de la cuadrícula de ese cubo, no a la persona. La decisión sigue siendo humana.

## Seguridad y privacidad

- Tokens: 32 bytes aleatorios en base64url (43 caracteres). El del enlace se guarda para que el dueño pueda
  copiarlo; el del participante, solo como hash. Un token de participante de otro enlace se rechaza (401).
- Lo público nunca devuelve: etiquetas de fases, referencia, similitud, ranking, otros participantes, emails ni
  datos del dueño. Probado en `apps/api/test/shares.test.ts`.
- Datos mínimos: nombre obligatorio; email solo si el participante lo da.
- Límites: 60 peticiones/min por enlace (abrir y unirse) y por participante (jugar); 50 enlaces por versión;
  el panel del dueño muestra hasta 500 participantes y 20 runs por participante.

## Pruebas

`apps/api/test/shares.test.ts`: validación de entrada y ranking (siempre) y el flujo completo por HTTP contra
PostgreSQL real cuando `DATABASE_URL` está definida (crear, versionar, publicar, unirse sin cuenta, completar,
comparar, guardar, ranking, autorización cruzada, cerrar, versión antigua intacta).

## Pendiente

- Derecho de supresión del participante (hoy solo se borra con la cuenta del dueño) y plazo de retención.
- Mostrar al participante su similitud si el dueño lo decide (hoy nunca se le muestra).
