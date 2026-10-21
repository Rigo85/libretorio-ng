# Revision de seguridad: 2026-10-21

Revision local de las nueve alertas Dependabot abiertas y del lockfile completo.
No se desplego, no se hizo commit/push ni se cerraron alertas manualmente.

## Correcciones

| Paquete | Antes | Despues | Alertas iniciales |
| --- | --- | --- | --- |
| Angular framework, CLI y builders | 22.2.0 | 22.2.3 | Router #212, #213 |
| @modelcontextprotocol/server | 2.0.0 | 2.3.1 | #215, #219 |
| Vite | 8.3.0 | 8.3.3 | #214, #216, #217 |
| follow-redirects | 1.16.0 | 1.16.1 | #220, #221 |
| launch-editor | 2.14.1 | 2.14.2 | Detectado adicionalmente por npm audit |

Angular CLI 22.2.3 incorpora MCP 2.3.1, pero su builder conserva Vite 8.3.0
fijado. Se agrega un override limitado a `@angular/build -> vite: 8.3.3`.
Reevaluar su retirada cuando el builder incorpore una version corregida.
No se cambio la version mayor de Angular, los lectores ni el codigo funcional.
Se mantuvo el override previo de xmldom para EPUB.js.

Los avisos de Router describen ataques SSR; esta vista es una SPA estatica,
sin SSR configurado. Se parchea igualmente, sin afirmar que esos vectores
estuvieran expuestos en la instalacion actual. CLI/MCP/Vite/launch-editor son
herramientas de desarrollo, no servidores nuevos de Libretorio.

El resolvedor encontro conflicto con los peers exactos de Angular en el lock
anterior. Se recalcularon solo las entradas Angular/devkit/ngtools/schematics
en una copia aislada y npm genero el lock final. No se uso `--force`,
`--legacy-peer-deps`, downgrade ni regeneracion indiscriminada del lockfile.
El diff incluye reubicacion/deduplicacion de transitivos Babel, los transitivos
de MCP y el Rolldown requerido por Vite; no actualiza las bibliotecas lectoras.

## Verificacion

- Node 24.21.0, npm 11.16.0; instalaciones limpias aisladas en `/media/work`.
- `npm ci --ignore-scripts` y `npm ls --all` correctos.
- 303 tests Angular y 7 tests de worker PDF/busqueda correctos.
- Build production correcto; persisten los avisos previos CSS/CommonJS.
- Arranque real de Vite en loopback con proxy vacio: HTML y cliente Vite
  respondieron 200; proceso de prueba cerrado al terminar, sin peticiones a prod.
- `npm audit --omit=dev`: cero vulnerabilidades.
- Auditoria completa: 11 entradas altas, todas derivadas de un unico aviso
  sin parche de braces. No equivalen a once vulnerabilidades independientes.

El dev existente y sus node_modules no se reemplazaron durante estas pruebas.
Para adoptar las nuevas versiones se necesita una instalacion desde este lock
y reconstruir; modificar el lock no actualiza por si solo lo desplegado.
GitHub actualizara las alertas cuando reciba y procese el lockfile corregido.

## Pendiente sin parche

[braces, GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
sigue afectando a 3.0.3, la ultima publicada consultada. Esta en la cadena de
Karma/micromatch. No se acepta volver a versiones antiguas de Angular/Karma
para ocultar la alerta. No exponer el servidor de desarrollo ni procesar
patrones no confiables con estas herramientas. Riesgo residual documentado,
no descartado como falso positivo.

Referencias de correcciones: [Router](https://github.com/advisories/GHSA-57xq-rjx2-v5xh),
[MCP](https://github.com/advisories/GHSA-jm63-cq47-j5jp),
[Vite/launch-editor](https://github.com/advisories/GHSA-587h-7wmj-h5pm),
[follow-redirects](https://github.com/advisories/GHSA-q3jh-wrc6-jgq8).
