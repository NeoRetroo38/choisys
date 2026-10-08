# PC servidor y Mac consola

Este es el reparto operativo aprobado para la demo remota:

```text
Mac (Terminal + Safari)
        │
        │ Tailscale: HTTP 8081 y 3000
        ▼
PC ── choisys web :8081
 └── API :3000 ──► neos-cube 127.0.0.1:8765
```

El PC mantiene el motor, la API y la web. El Mac es una consola humana: verifica
el estado, abre la interfaz y sirve opcionalmente la landing de Scenarys en su
propio loopback. El motor no sale del PC.

## Preparar el PC

Sigue [`DEMO-TAILSCALE.md`](DEMO-TAILSCALE.md). El modo Tailscale debe publicar
solo la API y la web necesarias para la demo. No uses Tailscale Funnel, reenvío
del router ni `0.0.0.0` como atajo.

El servicio C++ conserva estas invariantes:

- escucha exclusivamente en `127.0.0.1:8765`;
- su token permanece en el PC y fuera del repositorio;
- únicamente la API de choisys se comunica con él;
- sus respuestas y registros no contienen credenciales ni estado interno.

## Operar desde el Mac

El lanzador humano vive en el repositorio privado `scenarys`, en
`scripts/mac-pc-console.command`. Comprueba, por orden:

1. Tailscale conectado en el Mac y en el PC.
2. `http://NOMBRE-DEL-PC:3000/health` responde.
3. `http://NOMBRE-DEL-PC:8081` carga choisys.
4. La landing local abre en Safari y sus enlaces apuntan al PC.

El Mac no necesita el token del motor, una copia de la base de datos ni acceso
SSH para usar la demo.

## Recuperación

- Si Tailscale no ve el PC, recupera la conexión antes de tocar los servicios.
- Si responde la web pero no la API, revisa el proceso y el registro de la API
  en el PC sin copiar secretos al Mac.
- Si la API responde pero una evaluación falla, verifica localmente en el PC
  que neos-cube escucha en loopback.
- No levantes otro backend en el Mac para ocultar una avería del PC.

Coordinación: `NeoRetroo38/scenarys#1`, `#43` y
`NeoRetroo38/neos-cube#15`.
