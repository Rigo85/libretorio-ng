# Libretorio

Biblioteca web autohospedada para organizar, leer y escuchar una coleccion de
libros, documentos, comics, manga y audiolibros. El catalogo refleja la estructura
de carpetas del disco: Libretorio permite explorarla sin imponer una nueva
organizacion fisica a los archivos.

**Este es el repositorio principal de presentacion del proyecto y contiene su
interfaz web, Libretorio-ng.** Los servicios se desarrollan en repositorios
separados, pero forman una misma aplicacion.

## Que puedes hacer

- Explorar carpetas y buscar en el catalogo, con busqueda basica y filtros
  avanzados por titulo, autor, ISBN, descripcion, idioma, tipo y carpeta.
- Leer PDF en modo original o lectura, con ajuste de ancho, modo oscuro,
  seleccion de texto, busqueda interna y enlaces internos del documento.
- Leer EPUB en desplazamiento continuo, navegar por su indice y ajustar la
  tipografia, el tamano de letra y el tema; buscar dentro del libro.
- Leer comics y manga desde la cache de paginas preparada por el scanner.
- Escuchar audiolibros con pistas, capitulos cuando el archivo los proporciona,
  velocidad ajustable y una barra de progreso relativa al capitulo activo.
- Retomar lecturas y reproducciones desde una actividad reciente paginada,
  con historial y progreso asociados a la cuenta.
- Escuchar texto seleccionado de PDF o EPUB mediante las voces del navegador,
  con lectura recuperable por fragmentos.
- Administrar cuentas, roles, habilitacion y contrasenas desde la interfaz,
  cuando la gestion de usuarios esta habilitada en el backend.

La interfaz se adapta a escritorio y movil. El acceso al contenido requiere
autenticacion y se conserva **una sola sesion activa por usuario**.

## Repositorios

| Repositorio | Responsabilidad |
| --- | --- |
| **[Libretorio-ng](https://github.com/Rigo85/libretorio-ng)** | Interfaz Angular, navegacion, lectores y reproductor. Este repositorio. |
| [Libretorio](https://github.com/Rigo85/libretorio) | Backend: autenticacion, API HTTP, WebSocket, entrega protegida de archivos, historial y preferencias. Publica tambien la vista compilada. |
| [Libretorio-Scanner](https://github.com/Rigo85/libretorio-scanner) | Recorre la biblioteca, sincroniza el catalogo, extrae metadata y prepara cache, capitulos de audio y conversiones PDF. |
| [Libretorio-Metadata-updater](https://github.com/Rigo85/libretorio-metadata-updater) | Busca metadata bibliografica faltante mediante proveedores externos, con cuotas y control de intentos. |
| [Libretorio-postgresql](https://github.com/Rigo85/libretorio-postgresql) | Compose y SQL de la base de datos. Algunas migraciones especificas del backend viven en su propio repositorio. |

## Como se relacionan

```text
Biblioteca en disco
        |
        v
     Scanner ----------> PostgreSQL + almacenamiento de cache y portadas
                              ^                         |
                              |                         v
                      Metadata-updater              Backend
                                                        |
                                                  HTTPS / WebSocket
                                                        |
                                              Vista en el navegador
```

Redis apoya la coordinacion y las caches de los servicios. PostgreSQL conserva
el catalogo y el estado de usuario. El scanner prepara los archivos derivados;
el backend los consulta y entrega, sin convertir documentos al abrirlos.

Los formatos Office y otros documentos admitidos se preparan como PDF durante
el scan si esa fase esta habilitada. **EPUB no se convierte automaticamente a
PDF**: se usa su lector propio. Las conversiones fallidas no se presentan como
PDFs disponibles.

En produccion se compila esta vista, se incorpora al backend y se despliegan
juntos. No se necesita un servidor de desarrollo Angular en produccion.

## Lectores y persistencia

| Contenido | Implementacion actual |
| --- | --- |
| PDF | MuPDF en WebAssembly y worker, con peticiones por rango y ventanas de renderizado. |
| EPUB | epub.js, con interfaz propia y lectura continua. |
| Audiolibros | Reproductor propio sobre audio HTML; metadata y capitulos extraidos por el scanner con ffprobe. |
| Comics y manga | Visor propio sobre los bloques de cache generados por el scanner. |
| Texto a voz | SpeechSynthesis del navegador, sin servicio de sintesis en el backend. |

El modo lectura y la voz en PDF dependen del texto incluido en el documento.
**El visor no hace OCR**: un PDF compuesto solo por imagenes necesita una capa
de texto previa para esas funciones. Tampoco se promete conservar en modo
lectura la maquetacion exacta de tablas o documentos complejos.

El historial, el progreso de lectura y las preferencias admitidas se guardan por
usuario en el backend; la vista conserva tambien preferencias locales. El marcador
y los fragmentos pendientes de TTS se guardan localmente en IndexedDB: no son
el mismo dato que el progreso del libro ni se sincronizan entre dispositivos.
Las voces disponibles y su comportamiento dependen del navegador y del sistema.

## Desarrollo

Requiere **Node.js 24, desde 24.15.0 y menor que 25**, y npm. La vista utiliza
Angular 22.2 y TypeScript 6; las versiones concretas estan en el lockfile.

```bash
npm ci
npm test -- --watch=false --browsers=ChromeHeadless
npm run build
```

Las pruebas de navegador requieren Chrome/Chromium. La compilacion queda en
`dist/libretorio-ng/browser/`. Para ejecutar una vista funcional se necesita un
backend compatible, una cuenta y la configuracion del proxy; no basta con servir
el HTML. Consultar [desarrollo e integracion](docs/desarrollo.md) antes de usar
`npm start` o `npm run start:readers`.

## Documentacion

- [Desarrollo, conexion al backend y publicacion](docs/desarrollo.md).
- [Notas historicas de lectores, pruebas y despliegues](docs/notas-implementacion-2026-10.md).
- [Backend](https://github.com/Rigo85/libretorio#readme) y [scanner](https://github.com/Rigo85/libretorio-scanner#readme): configuracion y operacion de cada servicio.

Las notas historicas preservan decisiones y resultados de su fecha; no sustituyen
las instrucciones actuales. No se incluyen libros, bases de datos, claves ni
cuentas de acceso en este repositorio.

## Licencias

Libretorio-ng se distribuye bajo la [GNU Affero General Public License v3](LICENSE.txt)
(`AGPL-3.0-only`). El backend y el scanner incluyen tambien AGPL v3 en sus repositorios.
Las dependencias y los recursos de terceros conservan sus respectivas licencias.
