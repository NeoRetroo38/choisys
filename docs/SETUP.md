# Montar choisys en cualquier equipo (Windows, macOS o Linux)

Tres comandos, siempre los mismos. Necesitas `git`, `gh` (con tu sesión iniciada), `node` y un compilador de C++.

```text
node scripts/doctor.mjs   revisa el equipo y dice exactamente qué falta
node scripts/setup.mjs    descarga el motor privado, crea el token local, instala, compila y prueba todo
node scripts/dev.mjs      arranca motor, API y web (con --lan, también desde el móvil en la misma Wi-Fi)
```

## Antes de empezar

| Sistema | Herramientas |
|---|---|
| macOS | `xcode-select --install` y después `brew install git gh node`; `gh auth login` |
| Windows | `winget install Git.Git GitHub.cli OpenJS.NodeJS.LTS MSYS2.MSYS2`; compilador: `pacman -S mingw-w64-x86_64-gcc` en la consola MSYS2 |
| Linux | `sudo apt install git build-essential curl openssl`, `gh` y Node (nvm) |

El motor es un repositorio **privado** (`NeoRetroo38/neos-cube`): `setup.mjs` lo descarga con tu sesión de `gh`.

## Qué hace cada uno

- **`doctor.mjs`**: no cambia nada. Marca ✅, ⚠️ o ❌ con la orden exacta para cada sistema. Nunca imprime secretos.
- **`setup.mjs`**: descarga el motor junto a este repositorio (`../neo-cube`, o la ruta de `--engine` / `NEO_CUBE_DIR`), genera un
  **token nuevo** para este equipo, instala dependencias, compila el motor, pasa sus pruebas y las de choisys. Con `--migrate` aplica
  también la migración y el seed de la base de datos (necesita `DATABASE_URL`).
- **`dev.mjs`**: arranca todo. `--check` arranca, comprueba que los tres responden y se apaga (útil como prueba). `--no-engine` y
  `--no-web` omiten una parte.

## Secretos: dónde viven y qué no se copia

Un único archivo local, **fuera del repositorio**: `~/.choisys.env.local` (macOS/Linux) o `daemon.codex.env.local` en tu carpeta de usuario
(Windows); se cambia con `CHOISYS_ENV_FILE`. Contiene:

```text
CHOISYS_LOCAL_API_TOKEN=...   lo genera setup.mjs
DATABASE_URL=postgresql://... lo añades tú (por ejemplo, desde Neon); opcional en desarrollo
```

**No copies el token de un equipo a otro: cada equipo genera el suyo.** Tampoco se copian `node_modules`, `build/`, copias de seguridad
ni registros. Sin `DATABASE_URL`, las cuentas son **en memoria** (solo desarrollo; se pierden al reiniciar la API).

## Verificación

Probado en Windows (todo el recorrido: `setup`, `dev --check`). **Sin verificar en macOS y Linux**: la lógica es la misma y hay pruebas de
las funciones comunes, pero la primera ejecución real en esos sistemas está pendiente.
