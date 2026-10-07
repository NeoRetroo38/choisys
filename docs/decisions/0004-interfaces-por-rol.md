# 0004 — Interfaz distinta para cada tipo de usuario

Estado: **pendiente de decisión del dueño** · Origen: petición del dueño (7 oct): empezar a probar en la red con distintos tipos de usuario, cada uno con su interfaz.

## Para el dueño

Hoy la app no sabe qué tipo de usuario eres, y sin base de datos real solo se pueden crear usuarios USER. Para probar interfaces por tipo hace falta decidir cómo se lo contamos a la app y cómo creamos usuarios de prueba.

## Qué hay hoy (comprobado en el código)

- La API conoce el rol de cada perfil (`USER < ADMIN < DEV < SUPERADMIN < SUPERDEV`), pero `/auth/me` solo devuelve `id` y `displayName`: **el rol no llega a la app**.
- Regla cerrada: solo USER y SUPERDEV tienen capacidades propias; ADMIN, DEV y SUPERADMIN heredan las de USER.
- El modo de desarrollo sin base de datos (cuentas en memoria) **solo crea usuarios USER**. Un SUPERDEV hoy requiere PostgreSQL (`bootstrap:superdev`), es decir, depende de la decisión 0001.
- Los endpoints propios de cada rol (#4 USER, #5 SUPERDEV) aún no existen.

## Interfaz propuesta por tipo

| Tipo | Qué ve |
|---|---|
| USER | Fases, resultado, su cubo, historial, ajustes, exportar y borrar su cuenta |
| SUPERDEV | Lo de USER más un panel técnico: perfiles, roles y auditoría (cuando exista #5) |
| ADMIN, DEV, SUPERADMIN | Igual que USER hasta que el dueño les dé capacidades propias |

## Opciones

- **A. Mostrar el rol a la app** (campo `role` en el perfil público) y que la interfaz decida por nombre de rol. Coste: bajo. Riesgo: la app acaba con reglas de rol duplicadas.
- **B. Mostrar capacidades, no roles** (la API envía qué puede hacer: p. ej. `cube_data.export.own`) y la interfaz se ajusta a eso. Coste: medio. Riesgo: bajo; es lo más limpio y no cambia si cambian los roles. **Recomendada.**
- **C. Esperar a la base de datos real** y no tocar nada antes. Coste: ninguno ahora. Riesgo: no se puede probar nada por rol hasta resolver 0001.

Para cualquiera de las dos primeras, y para probar en la red, se propone además un **sembrado solo de desarrollo**: al arrancar con cuentas en memoria, la API crea una cuenta de prueba por rol con contraseñas generadas al azar, guardadas en un archivo local fuera del repo y nunca impresas.

## Si no decides

Se sigue con funciones 3D de la interfaz que no dependen del rol (PR de profundidad e inercia del cubo) y no se toca el contrato de la API.

## Decisión

_(el dueño marca una opción al fusionar o comentando)_
