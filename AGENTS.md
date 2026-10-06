# choisys — guía para agentes (Codex, Claude y cualquier otro)

choisys (siempre en minúsculas) es el producto de scenarys S.L. Este repositorio es **público**:
contiene UI, contratos y el puente hacia el motor. El motor (Cubo de Neo) es **privado**, está
en C++ y vive fuera de este repo. Lee también `README.md` y `apps/mobile/AGENTS.md` (reglas de Expo).

## Arquitectura (no se reconstruye)

```text
apps/mobile (Expo / React Native)
  -> apps/api (Express: validación, auth, sesiones, DTO seguros)
  -> 127.0.0.1:8765 neo-cube-service.exe (C++ local, autenticado)
  -> Cubo de Neo (C++)
```

El móvil nunca llama al puerto 8765 ni recibe la credencial del servicio.

## Reglas cerradas (no se reabren sin que el dueño lo pida)

1. **El motor y la inferencia viven solo en C++.** Ninguna fórmula, matriz, peso ni cálculo del Cubo en
   TypeScript, frontend, API, base de datos ni en este repo.
2. **No se implementa inferencia.** No existe especificación matemática aprobada; no inventes ninguna.
3. **`packages/shared` solo contiene contratos y tipos.** `packages/core` está neutralizado: no le añadas lógica.
4. **El único dato geométrico público** es `measurements: [{ phase, row, column }]` (base 1, tres entradas,
   solo al completar la fase 3). La app solo lo **dibuja**; no calcula coordenadas derivadas, centroides,
   conteos, pesos ni interpretaciones. Convertir `phase/row/column` en posiciones SVG (`CubeView`) está
   aprobado: es representación gráfica.
5. **Modelo de ejecución:** 3 fases; un Run = un intento completo; cuadrícula 3×3 por fase (cubo 3×3×3).
6. **El dominio no usa valores negativos como centinelas.** Los estados ausentes son explícitos.
7. **Roles:** `USER < ADMIN < DEV < SUPERADMIN < SUPERDEV`. Solo USER y SUPERDEV tienen capacidades propias
   por ahora; el resto hereda las de USER. Catálogo en `apps/api/src/permissions.ts`.

## UI (ya fijada)

- Interacción: blanco y negro, tipografía ligera. Un toque por fase elige y envía; **no hay botón Confirmar**.
- Círculos con animación pop/expansión; **la selección no rellena de blanco**. Transiciones con fade.
- Vista del cubo: fondo negro; cubo exterior (12 aristas) y rejilla de decisiones separados, solo aristas;
  ejes verde neón `#39ff14`; último Run en blanco brillante; Runs anteriores en rojo `#ff2a2a` al 45 %.
- No crees otro sistema de diseño. Pregunta antes de cambiar la paleta.

## Seguridad y privacidad

- No versiones secretos. El token del servicio local está en `C:\Users\Admin\daemon.codex.env.local`, fuera
  del repo. No lo imprimas, no lo copies y no lo pongas en `EXPO_PUBLIC_*`, bundles, logs ni documentación.
- No copies código, binarios ni archivos del motor privado a este repo.
- Antes de proponer un push: `npm run check:public` y revisa `git diff` en busca de secretos o lógica del Cubo.

## Git (importante)

- **Autoría:** los commits son solo del dueño. **No añadas** `Co-Authored-By`, firmas de IA ni enlaces de
  herramientas en mensajes de commit o descripciones de PR.
- **Ramas:** trabaja en tu propia rama (`codex/<tema>` o `claude/<tema>`); `main` solo cambia por una
  aprobación explícita del dueño. Otro agente puede estar trabajando a la vez: commits pequeños y no edites
  archivos ajenos sin necesidad.
- **Nunca** `push --force`, reescribir historia de `origin` ni hacer `push` sin permiso.
- Mensajes de commit en inglés, formato `tipo(ámbito): resumen`.

## Comandos

```powershell
npm ci                 # instalar (Node >= 20.19.4 recomendado)
npm run check          # check:public + typecheck de api, core y mobile
npm test               # tests de api y mobile
npm run test:local     # E2E real; requiere el servicio C++ en marcha
npm run mobile         # Expo (usa EXPO_PUBLIC_API_URL)
```

Desarrollo local sin PostgreSQL: arranca la API con `CHOISYS_DEV_MEMORY_AUTH=1` (cuentas en memoria, se
pierden al reiniciar; solo desarrollo). Detalles de arranque, puertos y variables en `README.md`.

## Definición de terminado

`npm run check` y `npm test` en verde, `npm run check:public` correcto, sin secretos en el diff, y si tocaste
la UI, comprobada en el navegador o en dispositivo. Informa de lo que **no** pudiste verificar.

## Fuera de alcance por ahora

PostgreSQL real y migraciones (no hay instancia identificada), inferencia, integración Wibaruim (sin
especificación) y despliegue en producción.

## Coordinación entre agentes (Git)

Varios agentes pueden trabajar a la vez. Git es el canal de coordinación:

- **Un directorio por agente.** Cada agente usa su propio `git worktree` (por ejemplo `daemon.codex` para
  Codex y `daemon.codex-claude` para Claude). **Nunca cambies de rama ni ejecutes `npm ci`/`npm install` en un
  directorio que usa otro agente**: reescribir `node_modules` tumba el Metro que esté corriendo.
- **Una rama por tema**, con prefijo del agente: `codex/<tema>`, `claude/<tema>`. Crea la rama desde `main`
  actualizado (`git fetch --all --prune`).
- **Antes de empezar:** `git fetch --all --prune`, `git log --all --oneline -20` y `gh pr list` para ver qué hace
  el otro agente y no duplicar trabajo.
- **Commits pequeños y push frecuente de tu rama** (nunca de `main`), para que el otro agente vea tu progreso.
- **Todo cambio entra por Pull Request.** Describe resumen, verificación, riesgo y reversión. Añade una sección
  `Handoff` si queda trabajo a medias, con lo que falta y lo que no pudiste verificar.
- **Revisión cruzada:** el otro agente revisa el diff del PR antes de que el dueño lo fusione. Nadie fusiona su
  propio PR sin el visto bueno del dueño.
- **Archivos propensos a conflicto:** `package.json`, `package-lock.json`, `AGENTS.md` y `README.md`. Anuncia en
  el PR si los tocas y evita cambiar dependencias a la vez que otro agente.
- **Si hay conflicto:** haz `rebase` de tu rama sobre `main`; no resuelvas a ciegas los cambios del otro agente
  y pregunta al dueño si el conflicto afecta a decisiones de producto.
