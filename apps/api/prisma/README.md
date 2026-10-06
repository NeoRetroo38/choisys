# Persistencia de choisys

PostgreSQL conserva identidad, perfiles y resultados producidos por el Cubo de
Neo. El motor C++ sigue siendo el único componente que calcula inferencias. La
base de datos y Prisma no contienen fórmulas, pesos, matrices ni lógica del Cubo.

## Estado

La estructura y la capa de servicios están preparadas, pero todavía no se ha
aplicado ninguna migración. Durante su creación no existían `DATABASE_URL`,
servidor PostgreSQL identificado, schema anterior ni migraciones que respaldar.
La primera migración debe generarse y revisarse cuando se conozca la instancia y
su política de backup. No usar `db push` para sustituir ese proceso.

## Tablas

El schema contiene exactamente tres modelos persistentes:

- `accounts`: identidad, hash de contraseña y estado de la cuenta.
- `profiles`: perfil operativo y rol. `account_id` es único.
- `cube_data`: registros `RUN` y `SESSION`, propiedad de un perfil.

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

- `Role`: `USER`, `ADMIN`, `DEV`, `SUPERDEV`.
- `CubeDataType`: `SESSION`, `RUN`.
- `CubeDataStatus`: `CREATED`, `ACTIVE`, `COMPLETED`, `INTERRUPTED`, `FAILED`.

La autorización vive en `src/authorization.ts`. El `AuthActor` debe construirse
con identidad autenticada por backend. Nunca debe poblarse con `profileId` o
`role` recibidos del cliente.

## Preparación y comprobación

Desde la raíz del repositorio:

```powershell
$env:DATABASE_URL = '<URL PostgreSQL provisionada fuera de Git>'
npm run db:format
npm run db:validate
npm run db:generate
```

Cuando exista una base de desarrollo identificada y respaldada:

```powershell
npm exec --workspace apps/api prisma migrate dev -- --schema prisma/schema.prisma --name initial_accounts_profiles_cube_data
```

Antes de aplicar la migración hay que revisar el SQL generado y añadir checks de
PostgreSQL para reforzar los invariantes que Prisma no representa en el schema:

- `session_index IS NULL OR session_index >= 0`;
- `phase_index IS NULL OR phase_index >= 0`;
- un `RUN` tiene `run_id`, `session_index` y `phase_index` nulos;
- una `SESSION` tiene esos tres campos definidos y `run_id <> id`.

La capa de servicio ya valida los índices y construye las relaciones correctas.
Los checks de base de datos quedan pendientes de la primera migración revisada.

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
