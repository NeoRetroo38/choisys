# Roles, capacidades y contrato para la interfaz

La interfaz **muestra u oculta**; la API **decide siempre** (sesión, capacidad, propiedad, rol del objetivo, operación).

## Roles y nombre de producto

| Interno (base de datos, API) | Se muestra como | Hoy tiene |
| --- | --- | --- |
| `USER` | usuario | capacidades `*.own` |
| `ADMIN`, `DEV`, `SUPERADMIN` | admin, dev, superadmin | reservados: **exactamente** las de `USER` |
| `SUPERDEV` | **sudev** | `USER` + operar el sistema |

`SUDEV` es solo el nombre de producto de `SUPERDEV`. El valor interno no se renombra ni migra; la interfaz hace el mapping `SUPERDEV → "sudev"`. `SUPERADMIN` se conserva en el esquema.

## Flujo

```text
interfaz → capacidades públicas → API → autorización central → Prisma / Neon
```

Fuente única de capacidades: `apps/api/src/permissions.ts`. Ayudantes: `hasCapability` y `requireCapability` en `apps/api/src/authorization.ts`; las rutas piden **una capacidad con nombre**, no comparan roles.

## Endpoints (todos con `Authorization: Bearer <token del login>`)

| Endpoint | Capacidad | Quién |
| --- | --- | --- |
| `GET /me` → `{ profile, capabilities, roleRequest }` | sesión válida | todos |
| `GET /me/runs`, `GET /me/export` | `cube_data.read.own` / `export.own` | todos (solo lo propio) |
| `POST /me/profile {displayName}` | `profile.update.own` | todos |
| `POST /me/delete {password}` | `account.delete.own` | todos |
| `GET /admin/profiles` | `profile.read.any` | sudev |
| `POST /admin/profiles/:id/role {role, reason?}` | `role.assign` | sudev, solo a roles por debajo del suyo |
| `POST /admin/profiles/:id/disable {disabled}` | `account.disable` | sudev, solo sobre roles por debajo |
| `GET /admin/role-changes` | `role_changes.read` | sudev |
| `GET /admin/role-requests?status=PENDING` | `role_requests.read` | sudev, feature activa |
| `POST /admin/role-requests/:id/decision {approve, reason?}` | `role.assign` | sudev, feature activa; objetivo inferior |

Rename y borrado son `POST` porque la política CORS solo admite GET y POST.

## Errores (`{ ok:false, error:{ code, message } }`)

`AUTH_REQUIRED` 401 (sin sesión, caducada, revocada o cuenta desactivada) · `FORBIDDEN` 403 (falta capacidad, o el objetivo no está por debajo) · `NOT_FOUND` 404 · `SESSION_CONFLICT` 409 (mismo rol, o cambio concurrente) · `INVALID_REQUEST` 400 · `AUTH_RATE_LIMITED` 429.

Solicitudes: `ALREADY_DECIDED` 409 (cualquier segunda decisión) · `ROLE_REQUESTS_UNAVAILABLE` 503 (feature apagada, almacén no compatible o esquema pendiente). Sin feature, las rutas nuevas no están montadas y responden 404.

## Reglas que garantiza el servidor

- El rol se lee de la base en **cada petición**: un cambio de rol o una desactivación valen en la siguiente.
- Nadie se cambia ni se desactiva a sí mismo; nadie toca a un igual ni a un superior; nadie asigna un rol igual o superior al suyo.
- Cambio de rol + fila de auditoría (`role_changes`, solo anexar) en una transacción.
- Ninguna respuesta incluye hashes, tokens ni campos técnicos.

## Solicitud durante el registro

`POST /auth/register` acepta `requestedRole?: 'ADMIN'|'DEV'|'SUPERADMIN'|'SUPERDEV'` además de email, contraseña y nombre. La cuenta **siempre nace USER**. Cuenta, perfil USER, primer login y solicitud PENDING se crean en una sola escritura atómica; una solicitud no concede capacidades.

`GET /me` incorpora `roleRequest: {id, requestedRole, status, createdAt, decidedAt} | null`. Solo muestra la solicitud del perfil autenticado; fechas ISO, `decidedAt: null` mientras está pendiente. Hay como máximo una solicitud por perfil en este flujo de alta, sin endpoint de reenvío.

La lista responde `{ok:true, requests:[{id, profile:{id,displayName,role}, requestedRole, status, createdAt}]}`: como máximo 500, más recientes primero. El filtro opcional acepta solo PENDING, APPROVED o REJECTED; sin filtro lista todos. No incluye email, motivo, identidad del decisor ni credenciales.

La decisión responde `{ok:true, roleRequest:{id,requestedRole,status,createdAt,decidedAt}}`. El servidor comprueba la capacidad, vuelve a leer y bloquea al actor/objetivo y la solicitud dentro de la transacción. Aprobar cambia el rol y anexa `role_changes` con `reason` (texto opcional de hasta 240 caracteres, sin controles); rechazar no cambia el rol. Decisión, rol y auditoría se confirman juntos, o se deshacen juntos. Las peticiones concurrentes producen una sola decisión y las demás 409 ALREADY_DECIDED.

No se permiten decisiones propias ni sobre un igual/superior. **SUPERDEV puede solicitarse, pero no aprobarse**: el rol solicitado debe estar por debajo del actor. Un SUPERDEV sí puede rechazar esa solicitud de un USER. Conceder SUPERDEV requiere una decisión explícita del dueño; no se amplía la jerarquía silenciosamente. ADMIN, DEV y SUPERADMIN aprobados siguen teniendo exactamente las capacidades de USER.

## Activación sin romper un servidor anterior

Por defecto está desactivado. `CHOISYS_ROLE_REQUESTS=1` (solo servidor, nunca EXPO_PUBLIC) activa el flujo sobre Prisma/PostgreSQL o, para desarrollo, junto a `CHOISYS_DEV_MEMORY_AUTH=1`. En memoria las cuentas, solicitudes y auditoría desaparecen al reiniciar; se expone /me para este flujo, no historial/exportación persistentes.

Prisma requiere revisar/aplicar **por una operación aparte autorizada** `20261008000000_role_requests` y actualizar el catálogo mediante `db:seed` antes de activar. Este cambio no aplica ninguna migración ni modifica roles/cuentas reales. `check:neon` verifica también el nuevo esquema/catálogo y marcará pendiente una base que aún conserve solo la migración inicial.

Con feature apagada no se consultan las tablas nuevas. En PostgreSQL /me devuelve roleRequest:null, sin capability role_requests.read. Enviar requestedRole devuelve 503 **antes de crear la cuenta**; no se ignora ni se pierde una solicitud. El almacén CHOISYS_DEV_AUTH_FILE no soporta solicitudes: conserva el login anterior y rechaza ese alta solicitada de la misma forma, incluso con el flag activado. Mantener el flag de la interfaz apagado en ese modo.

Al borrar una cuenta se borra su solicitud; el registro append-only de cambios de rol se conserva con enlaces anulados. Al borrar al decisor de otra solicitud, solo se anula su enlace: el estado, fecha y motivo terminales no se pueden editar.

## Para la interfaz

1. Tras el login, llamar a `GET /me` y guardar `profile` y `capabilities`.
2. Mostrar una pantalla solo si la capacidad está en `capabilities`; mostrar `SUPERDEV` como "sudev".
3. Tratar `403` como "sin permiso" y `401` como "volver a iniciar sesión".
4. Cambio respecto a #53: `permissions` pasa a llamarse `capabilities`.
5. La interfaz no decide permisos; su flag de solicitudes debe coordinarse con CHOISYS_ROLE_REQUESTS del servidor. Un 503 no es un registro completado y no debe guardar una sesión inexistente.
