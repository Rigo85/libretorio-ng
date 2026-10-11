# Revision de dependencias: 2026-10-11

Validacion con Node 24.21.0 y npm 11.16.0, sin desplegar en produccion.

## Cambios

- `shell-quote`: 1.10.0 -> 1.12.0. Incluye la correccion de
  [GHSA-pqg4-j6r4-53mv](https://github.com/advisories/GHSA-pqg4-j6r4-53mv).
- `source-map-js`: 1.2.1 -> 1.2.2.
- Se conservan Angular, los lectores, las dependencias directas y los overrides.
  No se utilizo `npm audit fix --force`.

## Verificacion

- Instalacion limpia con `npm ci --ignore-scripts`; `npm ls --all` sin errores.
- Build de produccion correcto; 266 tests Angular y 7 tests de worker PDF/busqueda.
- Persisten advertencias de presupuestos CSS, CommonJS de EPUB y, en tests,
  recreacion de colecciones (NG0956). No se cambio ese comportamiento.
- `npm audit --omit=dev`: **0 vulnerabilidades**.
- Auditoria completa: **11 altas, 0 criticas**, frente a 13 alertas anteriores.
  El total incluye dependientes afectados, no 11 vulnerabilidades independientes.

## Pendiente

Queda [braces, GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm),
sin version corregida publicada en la fecha de esta revision, en herramientas de
desarrollo/pruebas. No se incluye como dependencia de produccion de Angular.
No procesar patrones no confiables con esas herramientas ni publicar el dev server.

Revisar una futura correccion compatible en la cadena de Karma/micromatch.
No se aceptan los downgrades que propone automaticamente npm para eludir la alerta.
Una auditoria de produccion en cero no sustituye la revision de codigo, del bundle
publicado ni de las bibliotecas del sistema operativo.

La instalacion tambien avisa de paquetes deprecados, incluidos `crypto-js` y
`string-similarity`, ademas de transitivos de las herramientas. Queda pendiente
evaluar sus sustituciones por separado; no equivale a una nueva vulnerabilidad
confirmada ni justifica cambiar lectores o APIs dentro de este parche.
