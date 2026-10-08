# Nota operativa para Daemon, Neo y Claude

Estado validado en el PC `desktop-dgjsrgv` el 8 de octubre de 2026.

## Topología que debe conservarse

```text
Safari o Brave
  -> scenarys HTTPS :443
  -> choisys web HTTPS :9444
  -> choisys API HTTPS :8443
  -> Neon PostgreSQL
  -> neo-cube 127.0.0.1:8765
```

Tailscale Serve termina HTTPS y reenvía únicamente a servicios locales. La web
de choisys se construye con
`EXPO_PUBLIC_API_URL=https://desktop-dgjsrgv.tail7bc3b5.ts.net:8443`. La API debe
arrancar con
`API_ALLOWED_ORIGINS=https://desktop-dgjsrgv.tail7bc3b5.ts.net:9444`.

Neon solo se usa desde la API mediante `DATABASE_URL` en el archivo externo de
entorno. La landing y el bundle web no deben contener el host, usuario,
contraseña ni URL de Neon. El navegador tampoco accede directamente al Cubo.

## Comprobación para Safari

1. Conectar Mac o iPhone al mismo tailnet.
2. Abrir la landing y entrar en choisys mediante su enlace.
3. Crear una cuenta de prueba y confirmar respuesta 201.
4. Cerrar y abrir sesión; confirmar respuesta 200.
5. Completar las tres fases y confirmar el resultado del Cubo.

El cliente usa `fetch`, JSON, HTTPS y almacenamiento de token; no depende de
cookies de terceros. Una prueba desde Windows no sustituye la validación física
final en Safari de Mac y Safari de iPhone.

## Diagnóstico rápido

- `403 ORIGIN_NOT_ALLOWED`: revisar el origen exacto `:9444`; no autorizar `*`.
- `PERSISTENCE_UNAVAILABLE`: comprobar Neon desde Prisma en el PC sin imprimir
  `DATABASE_URL`.
- `ACCOUNT_EXISTS`: usar inicio de sesión; no borrar la cuenta para repetir el
  registro.
- `NEO_CUBE_*`: diagnosticar desde la API; nunca publicar el puerto 8765.

## Responsables

- **Daemon:** arrancar API con Neon real, conservar CORS exacto y vigilar health.
- **Neo:** validar el flujo completo en Safari y comunicar el mensaje visible si
  falla un correo concreto.
- **Claude:** mantener estas invariantes en scripts, documentación y cambios web;
  no introducir acceso directo del cliente a Neon o neo-cube.

