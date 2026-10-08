# Demo remota por Tailscale

Objetivo: enseñar choisys (bienvenida de Scenarys → inicio de sesión → Run → cubo) desde Safari en el
iPhone o el Mac, **en cualquier sitio**, sin abrir nada a internet.

```text
iPhone / Mac (Safari, con Tailscale activo)
  -> http://<IP-Tailscale-del-PC>:8081   web (Expo) servida por el PC
  -> http://<IP-Tailscale-del-PC>:3000   API (Express) en el PC
  -> 127.0.0.1:8765                      motor C++ (solo dentro del PC)
```

Todo corre en el PC, que está siempre encendido. El Mac y el iPhone solo abren Safari. El tráfico va
cifrado por el túnel de Tailscale; solo tus dispositivos de la red de Tailscale pueden entrar.

## Una vez, en el PC (PowerShell, en el worktree que sirve la LAN)

1. Tailscale abierto y con sesión iniciada (la misma cuenta que en el iPhone y el Mac).
2. Cierra las ventanas de motor, API y web que estén abiertas ahora (están ligadas a la IP de la Wi-Fi).
3. `.\scripts\lan-always.ps1 -Install -Tailscale` (deja la tarea de inicio y el modo guardado).
4. `.\scripts\lan-always.ps1 -Tailscale` (arranca ya, sin reiniciar).
5. Copia la dirección que muestra (`http://100.x.y.z:8081` o `http://desktop-dgjsrgv.<tu-red>.ts.net:8081`).

Para que no se caiga: en Windows, *Energía* → suspensión **Nunca** con el PC enchufado.
Para volver al modo Wi-Fi de casa: `.\scripts\lan-always.ps1 -Install` (sin `-Tailscale`).

## En cada demo

1. En el iPhone o el Mac: Tailscale **activado**.
2. Safari → la dirección del paso 5 (guárdala en Favoritos o en la pantalla de inicio).
3. Si no carga: comprueba en la app de Tailscale que el PC sale *Connected*; si sale *Offline*, el PC está
   apagado o suspendido.

## Qué no hacer

- **No usar Tailscale Funnel** ni abrir puertos en el router: expondría la API a todo internet.
- No enseñar la demo a alguien desde **su** móvil salvo que le compartas el PC desde Tailscale
  (*Share* en la consola de Tailscale); sin eso no puede abrir la dirección.

## Detalles técnicos

- La API solo escucha en una dirección asignada al PC: loopback, IPv4 privada de la LAN o IPv4 de
  Tailscale (`100.64.0.0/10`). Nunca `0.0.0.0` ni IPs públicas (`apps/api/src/config.ts`).
- `-Tailscale` toma la IP con `tailscale ip -4` y acepta como origen tanto la IP como el nombre MagicDNS.
- El modo se guarda en la variable de usuario `CHOISYS_TAILSCALE=1`, que también lee `lan-watch.ps1` al
  reiniciar tras una actualización de `main`. `-Uninstall` la borra.
- No verificado: arranque real en Windows con Tailscale (los scripts se probaron en seco), regla del
  firewall de Windows para Node en el adaptador de Tailscale (si Safari no conecta pero el PC sale
  *Connected*, permite `node.exe` en redes privadas y públicas).
