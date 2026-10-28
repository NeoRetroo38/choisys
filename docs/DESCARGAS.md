# Descargas de choisys (Android y Windows)

choisys se distribuye gratis desde **GitHub Releases** de este repositorio. Cada versión publica los
instaladores y `SHA256SUMS.txt` con su huella.

## Límite actual

La app usa `EXPO_PUBLIC_API_URL` (variable del repositorio). Hoy apunta a la API de la red Tailscale de
Scenarys, así que **solo funciona en los dispositivos de esa red**. Cuando exista una API pública basta con
cambiar la variable y publicar otra versión.

## Android

- Workflow `Release`, job `android`: `expo prebuild` (CNG; `android/` no se versiona) y `gradlew assembleRelease`.
- Paquete `com.scenarys.choisys`. `versionCode` = número de ejecución del workflow, para que cada APK se
  instale encima del anterior.
- Firma con la clave de los secretos `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
  `ANDROID_KEY_ALIAS` y `ANDROID_KEY_PASSWORD`. Los crea `firmar-android.command` en el Mac (una vez); la
  clave queda en `~/.scenarys-secrets/` y su contraseña en el Llavero. **Sin esa clave no se puede actualizar
  la app**: guarda una copia.
- En los PR se compila sin firmar (solo para comprobar que construye); no se publica nada.

## Publicar una versión

`publicar-version-choisys.command 0.1.0` en el Mac, o *Actions → Release → Run workflow* desde el móvil.
Crea la etiqueta `v0.1.0` y la release con los archivos.
