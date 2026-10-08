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
| `GET /me` → `{ profile, capabilities }` | sesión válida | todos |
| `GET /me/runs`, `GET /me/export` | `cube_data.read.own` / `export.own` | todos (solo lo propio) |
| `POST /me/profile {displayName}` | `profile.update.own` | todos |
| `POST /me/delete {password}` | `account.delete.own` | todos |
| `GET /admin/profiles` | `profile.read.any` | sudev |
| `POST /admin/profiles/:id/role {role, reason?}` | `role.assign` | sudev, solo a roles por debajo del suyo |
| `POST /admin/profiles/:id/disable {disabled}` | `account.disable` | sudev, solo sobre roles por debajo |
| `GET /admin/role-changes` | `role_changes.read` | sudev |

Rename y borrado son `POST` porque la política CORS solo admite GET y POST.

## Errores (`{ ok:false, error:{ code, message } }`)

`AUTH_REQUIRED` 401 (sin sesión, caducada, revocada o cuenta desactivada) · `FORBIDDEN` 403 (falta capacidad, o el objetivo no está por debajo) · `NOT_FOUND` 404 · `SESSION_CONFLICT` 409 (mismo rol, o cambio concurrente) · `INVALID_REQUEST` 400 · `AUTH_RATE_LIMITED` 429.

## Reglas que garantiza el servidor

- El rol se lee de la base en **cada petición**: un cambio de rol o una desactivación valen en la siguiente.
- Nadie se cambia ni se desactiva a sí mismo; nadie toca a un igual ni a un superior; nadie asigna un rol igual o superior al suyo.
- Cambio de rol + fila de auditoría (`role_changes`, solo anexar) en una transacción.
- Ninguna respuesta incluye hashes, tokens ni campos técnicos.

## Para la interfaz

1. Tras el login, llamar a `GET /me` y guardar `profile` y `capabilities`.
2. Mostrar una pantalla solo si la capacidad está en `capabilities`; mostrar `SUPERDEV` como "sudev".
3. Tratar `403` como "sin permiso" y `401` como "volver a iniciar sesión".
4. Cambio respecto a #53: `permissions` pasa a llamarse `capabilities`.
