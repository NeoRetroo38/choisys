# URLs privadas, CORS y diagnóstico de Neon

La API y el motor corren en el mismo servidor. El motor permanece en
`127.0.0.1:8765`; solo la API conoce su credencial. Neon se usa exclusivamente desde
la API mediante `DATABASE_URL`, nunca desde el bundle web.

## Proxy HTTPS privado existente

`scripts/dev.mjs` y `scripts/dev-lan.ps1` distinguen las direcciones locales de los
orígenes que abre Safari. Para un proxy ya configurado, define antes de arrancar:

```text
EXPO_PUBLIC_API_URL=https://api.example.test
CHOISYS_WEB_ORIGIN=https://app.example.test
API_ALLOWED_ORIGINS=https://app.example.test
```

Son ejemplos, no destinos desplegados. Se admiten puertos HTTPS explícitos. Las
URLs deben ser orígenes exactos, sin barra final, rutas, credenciales, query,
fragmentos ni comodines. El cliente no sigue redirecciones: configura directamente
el destino HTTPS que sirve la API. Una web HTTPS no puede apuntar a una API HTTP.

En macOS/Linux: `node scripts/dev.mjs --host 127.0.0.1`. En Windows:
`.\scripts\dev-lan.ps1 -Address 127.0.0.1` (o `-DryRun` para comprobar la configuración).
En macOS/Linux, `node scripts/dev.mjs --dry-run` valida URLs y CORS sin cargar
secretos ni arrancar servicios.
El proxy privado debe reenviar a API `127.0.0.1:3000` y web `127.0.0.1:8081`.
Estos comandos no crean DNS, certificados, reglas del firewall ni Tailscale Serve.

El launcher conserva los orígenes explícitos de `API_ALLOWED_ORIGINS` y añade el
origen de la web configurada. Con `CHOISYS_WEB_ORIGIN` explícito no añade aliases HTTP.
Sin él, conserva los valores HTTP locales/LAN. Una dirección Tailscale descubre el
nombre completo MagicDNS y el nombre corto de ese mismo equipo, incluso si se pasa
la dirección con `-Address` o `--host`.

El cambio de origen web cambia también el ámbito de `sessionStorage` de Safari:
deberás iniciar sesión en la URL nueva. Las cuentas PostgreSQL permanecen en Neon;
no se copian desde los almacenes de desarrollo. No hay Neon Auth ni OAuth en este
flujo: choisys autentica con su propia API y Prisma. Actualmente no confirma la
propiedad del correo mediante un mensaje de verificación.

## Diagnóstico sin cambios de cuentas

```text
npm run check:neon
```

Requiere dependencias y Prisma Client generado. Lee la variable `DATABASE_URL`
del entorno o del archivo externo de credenciales: `~/.choisys.env.local` en
macOS/Linux, `daemon.codex.env.local` en la carpeta de usuario de Windows, o
`CHOISYS_ENV_FILE` si está configurado. La API arrancada directamente necesita esa
variable en su entorno; el diagnóstico no la instala en otro proceso.

PostgreSQL impone `READ ONLY` antes de las consultas. Se comprueban una lectura
inocua, las siete tablas, las migraciones aplicadas frente al SQL del checkout
(incluidos finales LF/CRLF) y el catálogo/grants exactos de `permissions.ts`.
La salida solo contiene indicadores y un código seguro, nunca conexión, host,
correo, hash ni token. Un indicador negativo devuelve código de salida 1.

No hace seed, migración, registro, login ni renovación de sesiones. Por ello no
certifica un flujo completo de registro/login en Safari ni persistencia tras
reiniciar la API. `GET /health` tampoco certifica Neon. `neon.test.ts` es una prueba
diferente que escribe y borra cuentas temporales y conserva auditorías: no debe
ejecutarse como diagnóstico de solo lectura.

Verificación automatizada: `npm run test:runtime` y las pruebas API de
`databaseDiagnostics.test.ts`. Windows/PowerShell, proxy HTTPS y Safari físico
requieren comprobarse en el servidor/dispositivo correspondiente.
