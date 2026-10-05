# @choisys/core

Workspace reservado sin motor ni cálculos. No importar aquí lógica del Cubo de Neo.
Los contratos públicos pertenecen a `@scenarys/shared`; la ejecución corresponde
al servicio C++ privado y local, a través de `apps/api`.

## Clasificación de la implementación anterior

- `types.ts`: posición y selección eran contratos públicos reutilizables; se
  sustituyen por los DTO mínimos de `packages/shared`. Los tipos de estado interno
  se retiraron porque no forman parte de la API pública.
- `position.ts`: conversión de coordenadas de presentación; no la consume ninguna
  aplicación y se retiró junto con el modelo anterior.
- `line.ts`, `phase.ts`, `dimension.ts`, `vector.ts`, `projection.ts`, `weights.ts`,
  `comparison.ts`, `cube.ts`, `cube-comparison.ts`: lógica matemática o exposición
  de estados internos; retirada del árbol actual.
- `index.ts`: neutralizado; no exporta una implementación alternativa.

Antes de retirar los archivos se guardó un snapshot local fuera del repositorio.
No se migraron cálculos a la UI ni al bridge. Los commits anteriores siguen en el
historial; esta retirada no elimina copias publicadas ni reescribe Git.
