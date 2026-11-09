# Revision de dependencias: 2026-11-08

Correccion local, sin desplegar ni modificar el dev activo. No cambia codigo de
aplicacion ni package.json. Se mantienen Angular 22.2.3, TypeScript, EPUB, MuPDF,
las preferencias, navegacion y lectores. No hay nuevos overrides ni force.

## Cambios del lockfile

| Dependencia transitiva | Antes | Despues |
| --- | --- | --- |
| body-parser (Karma) | 1.20.8 | 1.20.9 |
| body-parser (Express de desarrollo) | 2.3.0 | 2.4.0 |
| fast-uri | 3.1.8 | 3.1.9 |
| follow-redirects | 1.16.1 | 1.16.3 |
| qs | 6.16.0 | 6.16.2 |
| serialize-javascript | 7.1.2 | 7.1.4 |

Todos son paquetes de desarrollo o construccion y las actualizaciones respetan
los rangos de sus consumidores. Los parches disponibles de Angular se dejan
para una actualizacion separada, no son necesarios para resolver estos avisos.

## Validacion aislada

- Node 24.21.0 / npm 11.16.0; npm ci sin scripts y npm ls --all correctos.
- npm audit completo: 5 paquetes afectados -> 0.
- npm audit --omit=dev: 0 antes y despues.
- 331 pruebas Angular correctas en Chrome Headless.
- 7 pruebas adicionales de PDF y busqueda correctas.
- Compilacion production correcta. Permanecen los avisos previos de presupuesto
  SCSS de audio/PDF y CommonJS de EPUB; no se cambiaron los presupuestos.
- Dev server aislado: HTML y cliente Vite responden 200; proxy vacio, sin
  peticiones productivas; detenido al terminar la comprobacion.

Evidencia local en ../ops/2026-11-08-dependencies/ respecto al repositorio.
La instalacion probada esta en stages/Libretorio-ng. No se sustituyeron los
node_modules antiguos del dev habitual ni los archivos servidos en produccion.
Para una futura publicacion, compilar con npm ci a partir de este lockfile.
