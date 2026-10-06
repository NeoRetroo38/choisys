# Persistencia de choisys

PostgreSQL conserva identidad, perfiles y resultados producidos por el Cubo de
Neo. El motor C++ sigue siendo el único componente que calcula inferencias. La
base de datos y Prisma no contienen fórmulas, pesos, matrices ni lógica del Cubo.

## Estado

La estructura y la capa de servicios están preparadas. Existe una **migración inicial
revisada**, `migrations/20261006000000_initial/migration.sql`, pero **no se ha aplicado a
ninguna base**: aún no hay `DATABASE_URL` ni servidor PostgreSQL identificado. Antes de
aplicarla en una instancia hay que confirmar su política de backup. No usar `db push` para
sustituir este proceso.

La migración contiene el SQL generado por `prisma migrate diff` y, al final, las invariantes
que Prisma no representa: CHECKs de `cube_data`, formato de las claves de `permissions`,
`role_changes` con rol distinto en cada cambio y un trigger que la mantiene **solo de
inserción** (rechaza `DELETE` y cualquier `UPDATE` salvo el que anula los enlaces a perfil al
borrar una cuenta). Se verifica contra un PostgreSQL real en memoria, sin servidor:

```powershell
npm install --no-save @electric-sql/pglite
node apps/api/prisma/verify-migration.mjs
```

`--no-save` evita tocar `package.json` y el lockfile. Cuando exista una instancia, aplicarla con
`npm run db:migrate` (`prisma migrate deploy`) en lugar de `migrate dev`.

## Tablas

El schema contiene estos modelos persistentes:

- `accounts`: identidad, hash de contraseña y estado de la cuenta.
- `account_sessions`: sesiones de login revocables (solo se guarda el hash del token).
- `profiles`: perfil operativo y rol. `account_id` es único.
- `cube_data`: registros `RUN` y `SESSION`, propiedad de un perfil.
- `permissions`: catálogo de capacidades (`role.assign`, `cube_data.read.own`...).
- `role_permissions`: qué permisos tiene cada rol, con filas explícitas.
- `role_changes`: auditoría de asignaciones de rol, solo de inserción.

Los nombres de modelos y campos permanecen en PascalCase/camelCase en TypeScript;
`@@map` y `@map` producen los nombres PostgreSQL `accounts`, `profiles`,
`cube_data` y columnas snake_case.

La autorrelación `run_id` es nula en un `RUN`. En una `SESSION`, `run_id` apunta
al `RUN` propietario. Las restricciones únicas impiden repetir un
`session_index` o `phase_index` dentro del mismo Run. El servicio hereda
`profile_id`, `engine_version` y `scenario_version` del Run al crear Sessions.

El alta normal usa `AccountService.createAccount`, que crea Account y Profile en
una sola operación anidada. PostgreSQL garantiza que un Account no tenga más de
un Profile mediante el unique de `profiles.account_id`; la operación atómica del
servicio garantiza el Profile inicial y siempre le asigna `USER`. Crear un perfil
con otro rol o cambiarlo requiere un actor backend autorizado. El bootstrap del
primer `SUPERDEV` debe ser un procedimiento local separado, auditable y de un solo
uso; nunca un valor aceptado desde el cliente.

## Enums

- `Role`: `USER`, `ADMIN`, `DEV`, `SUPERADMIN`, `SUPERDEV`, en orden ascendente de privilegio.
- `CubeDataType`: `SESSION`, `RUN`.
- `CubeDataStatus`: `CREATED`, `ACTIVE`, `COMPLETED`, `INTERRUPTED`, `FAILED`.

La autorización vive en `src/authorization.ts`. El `AuthActor` debe construirse
con identidad autenticada por backend. Nunca debe poblarse con `profileId` o
`role` recibidos del cliente.

## Roles y permisos

Jerarquía: `USER < ADMIN < DEV < SUPERADMIN < SUPERDEV`. Por ahora solo se definen
capacidades propias para `USER` y `SUPERDEV`; `ADMIN`, `DEV` y `SUPERADMIN` quedan
reservados y tienen exactamente lo que tiene `USER`. La fuente de verdad del
catálogo y de las concesiones está en `src/permissions.ts`; cuando exista la base,
un seed la volcará a `permissions` y `role_permissions`.

| Permiso | USER | SUPERDEV |
|---|---|---|
| `profile.read.own`, `profile.update.own` | sí | sí |
| `cube_data.read.own`, `cube_data.create.own`, `cube_data.export.own` | sí | sí |
| `account.delete.own` | sí | sí |
| `profile.read.any`, `cube_data.read.any` | no | sí |
| `cube_data.read.technical` | no | sí |
| `account.disable`, `role.assign`, `role_changes.read`, `system.manage` | no | sí |

`role_changes` registra quién cambió qué rol y cuándo. Un actor nulo marca el
bootstrap local del primer `SUPERDEV`. Los enlaces a perfiles pasan a `NULL` si el
perfil se borra, de modo que el historial sobrevive al borrado de la cuenta.

Este modelo no cambia la autorización en ejecución: `src/authorization.ts` sigue
decidiendo por rango. `SUPERADMIN` solo puede leer y gestionar roles inferiores.

## Preparación y comprobación

Desde la raíz del repositorio:

```powershell
$env:DATABASE_URL = '<URL PostgreSQL provisionada fuera de Git>'
npm run db:format
npm run db:validate
npm run db:generate
```

Cuando exista una base de desarrollo identificada y respaldada, aplicar la migración
inicial con `npm run db:migrate`. Los cambios posteriores del schema se generan con
`prisma migrate dev --create-only` y se revisan igual que esta.

Invariantes que la migración inicial ya refuerza en PostgreSQL:

- `session_index` y `phase_index` nunca son negativos;
- un `RUN` tiene `run_id`, `session_index` y `phase_index` nulos;
- una `SESSION` tiene esos tres campos definidos y `run_id <> id`;
- las claves de `permissions` tienen formato `area.accion`;
- cada fila de `role_changes` cambia realmente el rol, y la tabla es solo de inserción.

Pendientes:

- decidir si debe existir un único `SUPERDEV`. Se deja **fuera de la migración** a propósito:
  sería un índice único parcial (`CREATE UNIQUE INDEX ON profiles (role) WHERE role = 'SUPERDEV'`)
  y Prisma, al no representarlo en el schema, lo borraría en la siguiente migración. Hoy lo
  garantiza `bootstrapSuperdev` en la aplicación;
- el seed que carga `src/permissions.ts` en `permissions` y `role_permissions`;
- revocar `UPDATE`/`DELETE` sobre `role_changes` al rol de la aplicación como defensa adicional
  al trigger, cuando exista ese rol.

## Ejemplo conceptual

Run persistido:

```json
{
  "id": "10000000-0000-4000-8000-000000000001",
  "profileId": "20000000-0000-4000-8000-000000000001",
  "type": "RUN",
  "runId": null,
  "sessionIndex": null,
  "phaseIndex": null,
  "status": "COMPLETED",
  "inputData": { "scenarioId": "choice-grid" },
  "outputData": { "status": "completed" },
  "inferenceData": { "result": "resultado seguro producido por C++" },
  "metadata": { "platform": "ios", "durationMs": 1200 },
  "engineVersion": "0.1.0",
  "scenarioVersion": "choice-grid-v1"
}
```

Sessions asociadas:

```json
[
  { "id": "30000000-0000-4000-8000-000000000001", "type": "SESSION", "runId": "10000000-0000-4000-8000-000000000001", "sessionIndex": 1, "phaseIndex": 1 },
  { "id": "30000000-0000-4000-8000-000000000002", "type": "SESSION", "runId": "10000000-0000-4000-8000-000000000001", "sessionIndex": 2, "phaseIndex": 2 },
  { "id": "30000000-0000-4000-8000-000000000003", "type": "SESSION", "runId": "10000000-0000-4000-8000-000000000001", "sessionIndex": 3, "phaseIndex": 3 }
]
```

El ejemplo describe relaciones y no define el formato canónico de la inferencia.
Ese DTO debe aprobarse desde el contrato C++ antes de persistir datos reales.

Para consultar todo lo perteneciente a un perfil desde backend:

```ts
const records = await cubeDataService.getCubeDataByProfile(actor, profileId);
```

El helper comprueba el ámbito del actor antes de ejecutar la consulta. Para una
vista jerárquica puede usarse `getRunsByProfile` y después `getSessionsByRun`.
