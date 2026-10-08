# 0005 — Dominio y dónde corre cada parte

Estado: **opción B elegida por el dueño (8 oct)**; pasos pendientes de ejecutar · Dominio: `neowebdevsolutions.com` (Hostinger, activo hasta 3 feb 2027, autorrenovación activada)

## Para el dueño

Elegiste B: web estática gratis y un servidor pequeño (VPS) para la API y el motor. Este documento deja los registros DNS listos para pegar en Hostinger cuando exista cada pieza. Hasta entonces no se cambia nada del DNS.

## Reparto

| Pieza | Dónde | Dirección |
|---|---|---|
| Web de la app (export estático, #11) | Servicio de web estática gratis (p. ej. Cloudflare Pages) | `app.neowebdevsolutions.com` |
| API (Express, #9) y motor C++ | VPS pequeño con Linux, juntos; el motor solo en `127.0.0.1` | `api.neowebdevsolutions.com` |
| Base de datos | Neon (ya conectada y migrada) | no se expone |
| Raíz del dominio | Landing de ejemplo, cuando se apruebe | `neowebdevsolutions.com` |

## Registros DNS (se rellenan cuando exista cada pieza)

| Tipo | Nombre | Valor |
|---|---|---|
| CNAME | `app` | el dominio que dé el servicio de web estática (lo indica su panel) |
| A | `api` | la IP pública del VPS |

## Seguridad mínima del VPS

- HTTPS automático con un proxy inverso (Caddy o similar); la API nunca en HTTP puro.
- Cortafuegos: solo 22 (SSH con clave, sin contraseña), 80 y 443. El motor en `127.0.0.1:8765`, sin puerto abierto.
- `DATABASE_URL`, el token del motor y los orígenes permitidos (`API_ALLOWED_ORIGINS=https://app.neowebdevsolutions.com`) como variables del servidor; nunca en el repo.
- Rotar la contraseña de Neon, que se pegó en un chat.

## Qué falta antes de poder activarlo

1. Export web de Expo (issue #11) y despliegue de la API con Dockerfile, TLS y healthcheck (issue #9), ambos de Codex.
2. Elegir y contratar el VPS (coste y proveedor por decidir; comprobar precios actuales antes).
3. Compilar el motor para Linux en el VPS (el binario de Windows no sirve) y probarlo.
4. Revisar el modelo de amenazas de neos-cube antes de abrir nada a internet.

## Si no decides más

No se toca el DNS ni se contrata nada; el entorno sigue solo en la red de casa.

## Decisión

Opción B (web estática + VPS pequeño). Falta elegir proveedor del VPS y dar el visto bueno a cada paso.
