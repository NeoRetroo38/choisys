# choisys — scenarys S.L.

El Cubo de Neo se ejecuta exclusivamente en C++ y en el PC local. Este repositorio
público contiene UI, contratos y bridge. El motor y sus backups viven fuera del
repositorio: no copiarlos a TypeScript, frontend ni cloud.

## Arquitectura

```text
choisys mobile (Expo / React Native)
    │ HTTP: API de producto
    ▼
apps/api (Express: validación, sesiones, orquestación y DTO seguros)
    │ HTTP autenticado, exclusivamente loopback
    ▼
127.0.0.1:8765 / neo-cube-service.exe
    │
    ▼
Cubo de Neo C++ local
```

La respuesta recorre C++ → API → mobile. El móvil nunca llama al puerto 8765 ni
recibe la credencial del servicio. En un iPhone físico, `127.0.0.1` es el iPhone.

- `apps/mobile`: cuadrícula 3×3, selección booleana, fases, navegación sencilla,
  loading, errores y finalización; sin cálculos del motor.
- `apps/api`: valida, crea sesiones efímeras y conecta con C++ mediante un cliente
  dedicado. Filtra respuestas; no reproduce cálculos.
- `packages/shared`: contratos públicos de entrada/salida y códigos de error.
- `packages/core`: workspace neutralizado, sin implementación matemática.
- Backend privado: `C:\Users\Admin\Documents\Scenarys\backend\neo-cube`.

La persistencia PostgreSQL/Prisma está definida en `apps/api/prisma`. El schema tiene
siete tablas: `accounts`, `account_sessions`, `profiles`, `cube_data`, `permissions`,
`role_permissions` y `role_changes`; almacena resultados ya producidos por C++ y no
calcula inferencias. Existe una migración inicial revisada
(`apps/api/prisma/migrations/20261006000000_initial`) que **no se ha aplicado a ninguna
base de datos**: todavía no hay una instancia PostgreSQL identificada.

La API ya tiene autenticación de producto (`/auth/register`, `/auth/login`, `/auth/me` y
`/auth/logout`). Sin `DATABASE_URL` el servicio de cuentas no está disponible; solo para
desarrollo, `CHOISYS_DEV_MEMORY_AUTH=1` usa cuentas en memoria. Los endpoints públicos de
perfil, historial y administración no existen todavía.

Para asignar el primer SUPERDEV (una sola vez, en local, con `DATABASE_URL` en el entorno y
una cuenta ya registrada) y dejarlo registrado en `role_changes`:

```powershell
npm run bootstrap:superdev --workspace apps/api -- <email> --confirm
```

El C++ disponible registra selecciones y progresión de tres fases. No contiene
inferencia o puntuación adicional. El resultado público confirma una fase aceptada
o una sesión completada; no se inventan interpretaciones.

## Preparación reproducible

Entorno comprobado: Windows, Node 20.19.3, npm 10.8.2, MSYS2 g++ 16.2.0.
En una copia nueva, `npm ci` instala las versiones de `package-lock.json`. El motor
privado requiere su backup local por separado. El workspace de `apps/api` incluye
Prisma Client y el CLI de Prisma para la persistencia PostgreSQL preparada.

Desde `C:\Users\Admin\daemon.codex`:

```powershell
npm run build
npm run check
npm test
```

El schema de persistencia se comprueba sin conectar ni migrar una base:

```powershell
$env:DATABASE_URL = '<URL PostgreSQL provisionada fuera de Git>'
npm run db:format
npm run db:validate
npm run db:generate
```

Con el servicio C++ ya iniciado, la prueba opcional usa el cliente real del móvil
y una API temporal en loopback; no imprime la credencial:

```powershell
node --env-file=C:\Users\Admin\daemon.codex.env.local --import tsx scripts/test-local-flow.mts
```

### C++ local

```powershell
& 'C:\Users\Admin\Documents\Scenarys\backend\neo-cube\build.ps1' -Target service
& 'C:\Users\Admin\Documents\Scenarys\backend\neo-cube\run.ps1'
```

El build usa `-std=c++17 -Wall -Wextra -Wpedantic -static` y `-lws2_32`, sin
CMake/Ninja ni GUI. Genera `build\neo-cube-service.exe`. Los targets opcionales
`console` y `gui` reproducen los prototipos locales. El README privado incluye el
comando expandido y los smoke tests.

El launcher usa `CHOISYS_LOCAL_API_TOKEN` del entorno o del archivo externo
`C:\Users\Admin\daemon.codex.env.local`. Ese archivo ya está provisionado en este
equipo con permisos restringidos. Nunca copiarlo a Git ni al móvil. En otro PC,
provisionar un secreto aleatorio local de al menos 32 caracteres antes de iniciar
ambos procesos. El servicio falla si faltan credenciales válidas o logging.

### API de producto

En otra terminal, después del build:

```powershell
Set-Location 'C:\Users\Admin\daemon.codex'
& '.\apps\api\run.ps1'
```

Escucha `127.0.0.1:3000` por defecto. `npm run api` inicia desarrollo con recarga y
requiere que la credencial ya esté en el entorno. El cliente C++ tiene destino
fijo de loopback, no acepta URLs del usuario y no sigue redirecciones.

### Expo en iPhone físico

PC e iPhone deben estar en la misma red privada de desarrollo. Elegir la IPv4
privada de la interfaz del PC conectada a esa red. En la terminal de la API,
establecer `API_HOST` a esa IPv4 antes de ejecutar `apps\api\run.ps1`. No usar
`0.0.0.0`, publicar puertos en el router ni cambiar el binding del C++.

En otra terminal:

```powershell
Set-Location 'C:\Users\Admin\daemon.codex'
$env:EXPO_PUBLIC_API_URL = 'http://<IPv4-privada-del-PC>:3000'
npm run mobile -- --lan
```

Atajo para ver la web desde Safari en el iPhone (misma red privada, HTTP sin cifrar):
`.\scripts\dev-lan.ps1` arranca C++, API y Expo web y muestra la URL; `-DryRun` solo la muestra.

Abrir el QR en Expo Go compatible con SDK 57. Reiniciar Metro al cambiar la URL.
La red y el firewall existentes deben permitir API y Metro desde el iPhone; los
scripts no abren reglas de firewall. En el mismo PC se puede configurar
`http://127.0.0.1:3000`.

React Native nativo no necesita CORS. Para un cliente web, autorizar únicamente
los orígenes exactos necesarios en `API_ALLOWED_ORIGINS`, separados por comas,
nunca `*`. Esta tarea no habilita Expo web ni instala sus dependencias.

## Variables de entorno (sin valores reales)

- `CHOISYS_LOCAL_API_TOKEN`: secreto servidor a servidor; nunca `EXPO_PUBLIC_*`.
- `CHOISYS_ENV_FILE`: ruta opcional al archivo de credenciales del bridge.
- `API_HOST`: loopback por defecto; IPv4 privada del PC para desarrollo LAN.
- `PORT`: puerto de la API de producto, por defecto 3000.
- `API_ALLOWED_ORIGINS`: orígenes web autorizados explícitamente.
- `NEO_CUBE_TIMEOUT_MS`: timeout del bridge, por defecto 2000 ms.
- `EXPO_PUBLIC_API_URL`: URL de la API de producto para el móvil.
- `CHOISYS_LOCAL_LOG_DIR`: directorio local opcional de logs C++.
- `DATABASE_URL`: conexión PostgreSQL usada únicamente por `apps/api` y Prisma;
  debe provisionarse fuera de Git.

Logs C++ por defecto:
`C:\Users\Admin\Documents\Scenarys\logs\neo-cube\service.log`. Solo timestamp,
endpoint permitido, estado HTTP, latencia y código de error. No cuerpos, IDs de
sesión, selecciones, credenciales ni estados internos.

## Endpoints y contratos

API de producto:

- `GET /health`: identifica `choisys-api`; no confirma por sí mismo disponibilidad
  del C++ ni sustituye una evaluación de extremo a extremo.
- `POST /sessions`: `{ "scenarioId": "choice-grid" }`; devuelve
  `{ "ok": true, "session": { "sessionId": "<UUID>", "scenarioId": "choice-grid", "phase": 1 } }`.
- `POST /evaluate`: recibe el siguiente contrato y devuelve un DTO filtrado.

```json
{
  "scenarioId": "choice-grid",
  "sessionId": "<UUID-devuelto-por-sessions>",
  "phase": 1,
  "decisions": [{ "position": 1, "selected": true, "value": 1 }]
}
```

Fases 1 a 3 y posiciones 1 a 9 sin duplicados. Exactamente una decisión seleccionada
con valor 1; las no seleccionadas son opcionales, con valor 0. Se rechazan
propiedades ajenas al contrato.

Al completar la fase 3, `result` incluye además `measurements`: las tres selecciones
que el motor C++ ya almacena, 1-based y en orden de fase:
`[{ "phase": 1, "row": 1, "column": 3 }, ...]`. Es el único dato geométrico público.
La app solo lo dibuja (`CubeView`, `react-native-svg`) y conserva en el dispositivo los
últimos 5 intentos (un intento = un Run completo) para superponerlos con transparencia;
no calcula coordenadas, centroides, pesos ni inferencia. Las fases 1 y 2 no lo incluyen.

Resultado: `{ "ok": true, "result": { "sessionId": "<UUID>", "phase": 1,
"status": "phase-complete", "nextPhase": 2, "phaseTransitions": [] } }`. Desde la
fase 2, `phaseTransitions` acumula el tiempo observable en milisegundos desde que se
completa una fase hasta que se envía la siguiente, por ejemplo
`{ "fromPhase": 1, "toPhase": 2, "durationMs": 1250 }`. Al terminar, `status` es
`completed` y `nextPhase` es `null`. No incluye datos internos del motor.

C++ privado: `GET /health` y `POST /evaluate`, ambos con
`Authorization: Bearer <secreto-local>`. Health devuelve
`{ "ok": true, "service": "neo-cube", "version": "0.1.0" }`.

El bridge transforma indisponibilidad en 503, timeout en 504 y respuesta inválida
o fallo de credencial local en 502. Validación y conflictos usan errores
controlados. Los códigos públicos están en `packages/shared`.

Los reintentos conservan sesión, fase y selección. Una selección ya aceptada
devuelve la misma respuesta; modificarla produce conflicto. La UI conserva el
envío pendiente tras un fallo. Tras reinicio o expiración puede requerirse sesión
nueva. Ambos procesos mantienen sesiones acotadas en memoria, sin persistencia.

## Seguridad, alcance y pendientes

- El UUID de sesión es una capacidad efímera de desarrollo. La autenticación de
  producto existe, pero no hay cuotas por usuario. Usar LAN solo en una red de
  desarrollo confiable. Transporte cifrado y cuotas pendientes antes de un
  despliegue multiusuario.
- C++ solo admite IPv4 loopback, token local, requests acotadas y deadlines.
  Procesa conexiones secuencialmente. Rotación de logs pendiente para uso prolongado.
- `.gitignore` y `npm run check:public` revisan el árbol actual y patrones conocidos
  de credenciales. La revisión humana sigue siendo necesaria antes de publicar.
- La implementación provisional de `packages/core` **ya estaba en commits del
  remoto público**. Se retiró del árbol actual tras backup; permanece en el
  historial y posibles copias. No se reescribió Git. Resolver esa exposición
  histórica requiere una decisión explícita y no garantiza borrar copias externas.
- La fuente original, backup del C++, snapshot anterior del repositorio y los
  artefactos compilados sensibles anteriores permanecen fuera del repositorio.
- La prueba física y revisión visual final en iPhone requieren el dispositivo;
  un typecheck o un bundle no las sustituyen.
- React Native 0.86.3 declara Node 20.19.4 o posterior. Este equipo usa 20.19.3:
  los tests y el typecheck pasan, pero hay que actualizar Node y repetir la
  exportación iOS. `expo lint` tampoco se ejecutó porque ESLint/configuración no
  están instalados y la CLI intentaría añadirlos automáticamente.

## Extensión del ecosistema

Mapa previsto: scenarys ecosystem → choisys / neo-cube backend / scenarys services /
wibaruim. Los consumidores futuros accederán solo a DTO públicos mediante un
adaptador de `apps/api`; el motor seguirá local.

Antes de conectar productor y consumidor, documentar protocolo, autenticación,
payload, frecuencia, permisos, sensibilidad, persistencia, logging, timeout y
fallback. Actualmente mobile produce entradas para la API; el bridge consume
confirmaciones del C++, a demanda, por HTTP local autenticado, sin persistencia de
entradas. En indisponibilidad devuelve un error recuperable.

No se encontró proyecto/configuración Wibaruim identificado en este repositorio.
**Integración Wibaruim pendiente de especificación.** No se asumen tecnología,
puertos, API, autenticación ni ubicación local/remota.
