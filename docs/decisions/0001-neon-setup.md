# 0001 — Configurar Neon sobre `wandering-forest-67981823`

Estado: **pendiente de decisión del dueño**

## Para el dueño

Pegaste los pasos para enlazar y desplegar el proyecto Neon `wandering-forest-67981823`. No se ejecutaron:
actúan sobre la rama `production` y hay dudas abiertas. Aprueba o corrige este PR para decidir.

## Pasos recibidos

1. `npm i -g neon@latest && neon login`
2. `neon skills -y` · 3. `neon mcp -y`
4. `neon link --project-id wandering-forest-67981823 --branch production -y`
5. `neon config init` · 6. `neon.ts` con `defineConfig({ auth: true })` · 7. `neon deploy`

## Dudas

1. **Directorio:** ¿en qué repo y worktree se aplica? (propuesta: worktree propio de choisys, no el de Codex).
2. **Paquete:** el CLI oficial se instala normalmente como `neonctl`; no está verificado que `neon@latest` sea el CLI de Neon.
3. **Producción:** `link --branch production` y `deploy` con `auth: true` cambian la base de datos y la autenticación en uso.
   Relacionado con la decisión abierta del proveedor de Postgres (tablero #24).
4. **Login:** `neon login` requiere que el dueño inicie sesión en el navegador.

## Opciones

- **A.** Ejecutar los pasos 1–6 en un worktree y dejar `neon deploy` al dueño.
- **B.** Ejecutarlo todo, incluido el despliegue.
- **C.** No usar Neon; elegir otro proveedor de Postgres.

## Decisión

_(el dueño marca una opción al fusionar o comentar)_
