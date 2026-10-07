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
   **Otro dato público aprobado por el dueño (7 oct):** `phaseTransitions` (`fromPhase`, `toPhase`, `durationMs`),
   el tiempo entre fases medido por la API. Es observación, no cálculo del Cubo. Si algún día alimenta la
   inferencia, debe enviarse al motor C++ y no calcularse en TypeScript. Un reintento de una fase ya aceptada
   debe devolver la misma respuesta y no añadir tiempos.
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

## Comunicación con el dueño (solo GitHub)

El dueño solo lee **GitHub** (app del iPhone). **Nada se le pide ni se le cuenta por otro canal.** En un chat se
responde, como mucho, con una frase que remita a GitHub. Está pensado para leer poco y rápido:

- **Dónde:** una decisión es una issue con las etiquetas `decisión` y `esperando-dueño`; el resumen de un cambio
  va en `## Para el dueño` del PR; los avisos de estado, en un comentario de la issue o del PR.
- **Una pregunta por comentario**, con título numerado en negrita (`**1. ¿Qué Postgres?**`), tu recomendación,
  las opciones con coste, tiempo y riesgo en una línea, y **qué pasa si no decide**. Plantilla:
  `.github/ISSUE_TEMPLATE/decision.md`.
- **Se responde con una reacción**, no escribiendo: 👍 la recomendada · 🚀 la alternativa · 🎉 una tercera ·
  👎 no · 👀 explícamelo antes de decidir.
- **Firma tus comentarios** con `[Claude]`, `[Codex]` o `[Agente <nombre>]` al principio. Todos actuamos con la
  cuenta del dueño; la firma permite distinguir sus respuestas de las nuestras.
- **Brevedad:** lo importante primero, como mucho 8 líneas, sin jerga y sin pegar código ni registros.
- **Estados con etiquetas:** `esperando-dueño`, `listo-para-fusionar` y `bloquea-lanzamiento`. Asigna al dueño
  lo que le toca, para que salga en *Asignadas* de su app.
- **Cómo leer su respuesta:** `node scripts/watch-owner.mjs --repo OWNER/REPO --issue N` (una línea por reacción
  o comentario nuevo) o `--summary` (cada pregunta con su respuesta).
- **Acciones en el PC:** agrúpalas en una sola issue "En el PC (cuando puedas)"; no las pidas por otro canal.
- **Límite real:** GitHub no avisa al dueño de lo que hacemos con su cuenta (ni por asignación ni por mención).
  Hasta que exista una Action que comente como bot, tiene que abrir *Asignadas*: mantén las etiquetas al día.

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
- **Si hay conflicto:** integra `main` en tu rama (`git merge origin/main`; el rebase solo si tu rama aún no está
  subida, porque no se hace `push --force`). No resuelvas a ciegas los cambios del otro agente y pregunta al
  dueño si el conflicto afecta a decisiones de producto.

### Sincronizar con main (obligatorio)

**Antes de cada implementación, y otra vez antes de abrir el PR**, integra `main` en tu rama:

```powershell
node scripts/sync-main.mjs            # integra main, cuenta qué PRs te faltan y se detiene si hay conflicto
node scripts/sync-main.mjs --dry-run  # solo informa
```

Se detiene sin tocar nada si tienes cambios sin commitear o si hay conflictos. Nunca fuerces el push.

### Cuando el dueño fusiona un PR

No esperes a que te lo digan: el dueño fusiona en GitHub y los agentes siguen trabajando.

- **Claude:** vigila `main` con `node scripts/watch-main.mjs` (una línea por PR fusionado). Al verla,
  ejecuta `node scripts/sync-main.mjs` y reanuda; si tu tarea dependía de ese PR, continúa sin pedir permiso.
- **Codex:** ejecuta `node scripts/sync-main.mjs` al empezar cada tarea y antes de abrir el PR. Si el dueño
  tiene `watch-main.mjs` en una terminal, verá cuándo avisarte.
- **Dependencias entre PRs:** si tu PR depende de otro aún sin fusionar, dilo en la primera línea del PR
  (`Depende de #N`) y parte de esa rama; cuando se fusione, sincroniza con `main`.

### Resumen para el dueño (cada PR)

El dueño tiene poco tiempo y lee poco. **Todo PR empieza** con una sección corta, en español y sin jerga:

```markdown
## Para el dueño
Qué cambia, en una frase.
Qué decides tú (o "nada").
```

Y debe incluir `No verificado: …` si algo no se pudo comprobar. `node scripts/merge-digest.mjs` convierte las
últimas fusiones en una lista corta (qué es, tamaño, qué falta por verificar) a partir de esas secciones.
