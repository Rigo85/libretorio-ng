# Archivo de notas de la vista: octubre de 2026

Este documento conserva el contenido del README anterior al 11 de octubre de
2026. Es un registro historico de pruebas, decisiones y despliegues, no una guia
de instalacion ni una descripcion del estado actual. Las restricciones "solo
local" y los motores mencionados corresponden a la fecha de cada apartado.

Las rutas `../ops`, `../local-*` y otras referencias al workspace se escribieron
desde la raiz del repositorio original. Esos recursos externos no forman parte
de este repositorio; no interpretar esas rutas desde `docs/`. Las cuentas citadas
son de laboratorios aislados, no credenciales de una instalacion de Libretorio.

Para la presentacion vigente, volver al [README](../README.md).

---

# LibretorioNg

## Voz sobre seleccion en dev (2026-10-05)

PDF y EPUB comparten un panel SpeechSynthesis, sin cambiar rutas ni motores de
lectura. Solo lee la seleccion capturada al abrirlo: no guarda texto ni lo envia
al backend. Cerrar el panel conserva la lectura; detener, cambiar documento,
desmontar el visor o invalidar la sesion la cancela. Una nueva lectura detiene
el audio previo mediante el servicio existente.

El idioma se elige explicitamente, nunca a partir del navegador. Las voces se
filtran por idioma y por nombre/variante, tolerando acentos y es_US/es-US. Se
recuerdan idioma, voz y velocidad en este navegador; una voz ausente no se
sustituye silenciosamente. Las voces remotas requieren habilitacion explicita
por instancia y pueden enviar el texto al proveedor. `localService` es una
declaracion del navegador, no una auditoria del proveedor de voz.

Reproduccion y parada preceden a los ajustes plegables; durante la lectura hay
pausa/reanudacion directa en la barra. Diagnostico separado y sin texto del libro.
Dialogo nativo con Escape/foco modal, controles de 44px y panel inferior en movil.
Los filtros no cambian la voz hasta seleccionarla explicitamente.
El acceso TTS usa `record_voice_over` de Material Icons (persona hablando),
ya incluido localmente; no usa volumen ni una burbuja de mensajes. En EPUB,
indice a la izquierda, progreso centrado y TTS/ajustes de lectura juntos a la
derecha, reservando espacio para pausa/reanudacion durante la reproduccion.

Tras la prueba movil, la cabecera y reproduccion/parada/velocidad quedan fuera
del cuerpo desplazable del dialogo, sin offsets sticky que dependan de la altura
del titulo. La voz elegida no pliega automaticamente sus ajustes. Se mantienen
Escape, foco modal, cierre explicito y consentimiento para voces remotas.

Antes de fragmentar, TTS reemplaza saltos simples por espacios, compacta blancos
y conserva separaciones explicitas de parrafo y puntuacion. Elimina guiones
blandos, incluidos los que parten una palabra en dos lineas; no adivina si un
guion impreso es ortografico o de maquetacion. No modifica el texto del documento,
la seleccion ni el portapapeles. Un PDF sin separacion explicita de parrafos no
permite reconstruirlos con certeza desde esta cadena; no se inventan pausas.
Se mantiene el limite de fragmentos del ensayo movil: pueden seguir existiendo
pausas propias del motor al cambiar de fragmento, independientes de los saltos.

El motor envia un fragmento a la vez. Fuera de Android distingue pausa nativa
solicitada de confirmada. En Android, identificado por el user-agent, cancelar
conserva el fragmento solo para la pausa; reanudar crea una locucion nueva.
Se invalida la locucion anterior antes de cancelarla para ignorar eventos tardios
o sincronos. Sin posiciones fiables por palabra se repite el fragmento actual
(hasta 320 caracteres), nunca se estima una posicion ni se salta texto. Detener,
cambiar documento o cerrar sesion siguen descartando el texto pendiente.
Esta adaptacion responde a que [Chromium Android](https://raw.githubusercontent.com/chromium/chromium/main/content/browser/speech/tts_android.cc)
detiene la locucion en Pause() y tiene Resume() vacio. Los diagnosticos incluyen
`paused-fragment-retained` y `restart-fragment`, sin texto del libro.
Solo eventos de avance (boundary creciente o end tras start) notifican actividad;
start, errores, timers y pausas no renuevan por si mismos. No se garantiza audio
audible ni ejecucion en segundo plano por recibir esos eventos. Quedan pruebas
reales Android, bloqueo de pantalla y lectura prolongada para el uso habitual.

Verificacion anterior: 134 pruebas Angular correctas, incluidas ventanas de 320x640,
390x844 y 1440x900 con CSS real en iframes de Chrome Headless; compilacion
correcta con los avisos CSS/CommonJS anteriores. En Chrome de dev se comprobo
la captura de una seleccion real del PDF El Capitan Blood. Ese navegador no
ofrece voces locales; no se habilitaron voces remotas ni se transmitio el texto.
Las pruebas de avance usan un motor simulado, no certifican audio audible.

La cabecera del modal vuelve a mostrar `file | title` (getTitle existente), no
el nombre de la URL ni el UUID de una conversion. El PDF deja de repetirlo en su
barra; los controles se alinean a la derecha. Titulo de una linea con elipsis y
boton de cierre sin encogerse, sin cambios en las rutas ni en getTitle.
La revision de pausa Android y titulo incluye pruebas de cancelacion sincrona,
eventos tardios, pausas repetidas, watchdog, ausencia de actividad artificial,
politica nativa desktop, boton exterior con el panel cerrado y cabecera a 320,
390 y 1440 px: 146/146 pruebas correctas y build de produccion correcto con los
avisos CSS/CommonJS anteriores (sin desplegar). Pendiente repetir el
sonido real y pausa/reanudacion en Honor/Chrome tras recargar dev.

Revision del equipo Ubuntu (2026-10-05): Speech Dispatcher, libspeechd2,
speech-dispatcher-espeak-ng y espeak-ng-data ya instalados; `spd-say -L` enumera
Spanish (Spain), entre otras voces. Eso no demuestra que Chrome las exponga.
El [codigo Linux de Chromium](https://raw.githubusercontent.com/chromium/chromium/main/content/browser/speech/tts_linux.cc)
requiere `--enable-speech-dispatcher`. Probar tras salir completamente de Chrome;
no se ha modificado el lanzador ni instalado paquetes. Chromium mantiene esta
conexion optativa por posibles problemas de estabilidad. Pendiente comprobar
enumeracion en el navegador y sonido real tras habilitarla manualmente.

Referencias: [dialogo modal WAI-ARIA](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/),
[tamano de controles WCAG](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html),
[voces locales](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisVoice/localService),
[limites de boundary](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance/boundary_event),
[paneles inferiores Material](https://m1.material.io/components/bottom-sheets.html).

## Salto del indice EPUB (2026-10-04)

Corregido en dev el doble ajuste de scroll: el gestor continuo de EPUB.js
compensa la altura de las secciones insertadas antes del destino, mientras
el navegador tambien intentaba conservar su anclaje. En el evento `attached`
se establece `overflow-anchor: none` solo en `.epub-container` de este visor,
antes del primer `display()`. Sin cambios de flujo, rutas, destroy ni PDF/audio.

Reproduccion aislada con el EPUB local "La edad de oro de la ciencia ficcion I",
las mismas dependencias, fuentes y temas, sin autenticarse contra produccion:
Introduccion, El hombre que evoluciono y El satelite Jameson. A 390 px,
desactivar el anclaje dejo los tres destinos a 0 px del inicio del contenedor;
reactivarlo reprodujo desplazamientos de 2630, 21053 y 29821 px. Es una
comparacion en Chrome de escritorio a ancho movil, no una prueba en Android.
Referencia complementaria: https://github.com/futurepress/epub.js/issues/1416.
Suite Angular: 86/86. Build correcto con los avisos CSS/CommonJS previos.
Dev requiere recargar la pagina para recibir el cambio (live-reload desactivado).

## Visor PDF MuPDF en dev (2026-10-04)

Seleccion de texto incorporada posteriormente en ambos modos: capa DOM de
palabras con coordenadas obtenidas del texto estructurado de MuPDF. En Lectura
se extraen de la pagina reorganizada; en Original se ajustan al ancho, zoom y
rotacion. No usa HTML del libro como markup, ni hace OCR nuevo. Los PDFs
escaneados con texto incorporado permiten seleccionar esa capa.

Seleccion/copia nativas; el evento copy se limita a rangos contenidos en este
visor y conserva saltos de linea y orden de pagina. La virtualizacion retiene
las paginas seleccionadas y no reconstruye sus nodos al cambiar de banda.
Cambiar modo/tipografia/tamano o cerrar el documento limpia su seleccion, sin
tocar selecciones externas. `selectedText` alimenta el panel TTS descrito arriba;
seleccionar texto por si solo no inicia voz ni transmite o persiste la seleccion.

Corregido el salto al siguiente parrafo al seleccionar hacia los margenes:
las filas DOM ahora ocupan su posicion real y las palabras horizontales conservan
flujo inline dentro de cada fila. Antes, las palabras absolutas y sus finales de
linea tenian geometria incoherente para el hit-testing nativo del navegador.
Reproducido antes y despues en Chrome, con arrastre en ambos sentidos y entre
parrafos. La nueva prueba automatizada verifica margenes, espacios y texto copiado.

Pruebas: 94 Angular y 3 del motor, incluyendo seleccion nativa por palabra con
CSS real, copia parcial/multipagina, retencion durante scroll, zoom/rotacion y
paginas sin texto. Verificacion visual en Chrome con Holocausto 2084 y su capa
OCR preexistente; la correccion de margenes requiere repetir la comprobacion de
pulsacion prolongada y tiradores en Android real. Build correcto; CSS del visor
PDF: 6.06 kB, aviso sobre el presupuesto de 5 kB, sin ampliar el limite.
La precision en Original depende tambien de las coordenadas del OCR original;
el orden de lectura en PDFs de varias columnas requiere mas muestras.

Se sustituye exclusivamente el componente PDF por MuPDF 1.28.1, trasladando
el comportamiento aprobado en `local-readers`: Original por defecto en escritorio,
Lectura por defecto en pantallas de hasta 600 px o tactiles de hasta 500 px de alto,
con cambio manual entre ambos sin reiniciarse al redimensionar,
scroll continuo, tipografia, tamano, margenes, interlineado, oscuro, indice
cuando el PDF contiene marcadores y ajuste al ancho en escritorio. La descarga
del original sigue disponible. No se modifica EPUB, audio, navegacion ni backend.

- Se conserva el contrato `[pdfSrc]`: cadena vacia cierra y libera el worker;
  cambiar la URL descarta respuestas del documento anterior. Altura limitada
  al cuerpo del modal existente; no se cambia su controlador ni sus rutas.
- URLs del mismo origen, solo `/books/` y `/cache/`. Se mantienen cookies y
  autorizacion del servidor. Rangos de 1 MiB, sin fallback a descarga completa
  cuando el servidor no devuelve 206. Los errores 401/403/404 se muestran.
- Reflujo XHTML por pagina dentro de MuPDF, no HTML del PDF insertado en DOM.
  Cache LRU de tres paginas extraidas, ocho bloques de red, lienzos por ventana
  visible y bandas de hasta aproximadamente 8 MP. No es un limite de memoria
  total de WASM. Conserva pagina y proporcion vertical, no palabra exacta.
- Preferencias en `libretorio:pdf:preferences:v1`, sin reutilizar claves del lab
  ni de otros lectores. Importa el modo nocturno anterior sin borrar su clave.
- Pruebas Angular: 85 aprobadas. Motor real: dos casos con PDF generado,
  marcadores, rangos, reflujo, texto, bandas no vacias, LRU y errores HTTP.
  Chrome dev: Quijote (1259 paginas) y Capitan Blood (279 paginas), ambos
  modos, letra/ancho, sin desbordamiento horizontal ni barra sobre el texto;
  cero lienzos despues de cerrar el modal. Verificacion visual adicional a
  390 x 844 mediante iframe temporal retirado al terminar, sin errores del
  visor en consola. No sustituye una prueba prolongada en Android real.
- Build aprobado; avisos CSS PDF 5.19 kB / audio previo y CommonJS EPUB.
  No se subieron presupuestos ni se actualizaron otras dependencias.
- MuPDF se carga como worker/assets locales, con su LICENSE incluido en
  `/assets/mupdf/`. No se publica ni despliega ningun cambio en produccion.

Limites heredados del lab, pendientes de siguientes iteraciones: busqueda global,
enlaces/anotaciones/formularios y PDFs con
contrasena. El texto extraido de la pagina puede consultarse en Diagnostico.
Original conserva el aspecto del documento, pero no es un fallback PDF.js.
La fidelidad del reflujo en tablas, columnas y formulas y el uso prolongado en
movil requieren mas muestras; no se garantiza equivalencia con el visor anterior.

Prueba del motor (Node 24, desde este repo):
`node --experimental-vm-modules --test --test-isolation=none tests/pdf-worker.test.mjs`.
Las pruebas Angular se ejecutan con `ng test --watch=false` y Chrome configurado.

## Sesion durante lectura y audio (2026-10-04)

Backend de sesion desplegado el 2026-10-04 a las 23:54 Lima, con autorizacion.
La vista nueva sigue solo en dev: el proxy de 8447 apunta a produccion y ya
dispone de `/api/session/activity`. Recargar dev si el servicio habia detenido
los intentos tras recibir un 404. No se publico la vista nueva ni se cambio el
destino del proxy, la configuracion de assets o la navegacion del catalogo.

- Audio renueva mientras su tiempo avanza, no por un temporizador ni por Play
  sin reproduccion. Pausa, fin, espera sin avance y cierre no generan actividad.
- PDF/EPUB y el resto de la interfaz autenticada renuevan con interaccion
  real visible. Politica confirmada por el usuario: un libro abierto sin
  interaccion no mantiene indefinidamente la sesion de una hora.
- Un servicio compartido limita los intentos a uno por minuto por pestana y
  diez segundos por peticion. La renovacion usa POST autenticado con CSRF.
  Los listeners se registran fuera de Angular; no interceptan ni cancelan
  eventos. No cuentan relayout, scroll programatico, mousemove ni visibilidad
  por si sola. EPUB registra y retira listeners tambien dentro de sus iframes.
- El monitor consulta `/api/me?passive=1`, sin renovar cookie, actividad ni
  expiracion PG. No consulta en login y acota peticiones bloqueadas. El backend
  conserva `/api/me` sin marca para la vista productiva anterior durante la
  transicion; esa compatibilidad sigue renovando la sesion de la vista vieja.
- HTTP y WebSocket consultan la actividad persistida. Reconectar el socket
  no reinicia una hora ya vencida. Se conserva usuario activo y sesion unica.
- Un 401 hace limpieza local, sin POST logout automatico que pudiera usar una
  cookie nueva de otra pestana. Logout explicito invalida solo su SID en users
  antes de destruir la sesion: una escritura tardia no recupera autorizacion.
- Las peticiones de archivos guardan actividad antes del streaming, para no
  sobrescribir actividad mas reciente al terminar una descarga larga. No se
  promete cortar bytes ya autorizados/enviados ni borrar contenido descargado.
- 503/red/timeout no se tratan como logout. Se avisa y se reintenta con nueva
  actividad; si la sesion realmente vence durante el corte, no se resucita.

Prueba de integracion repetible con el backend compilado real, PG y Redis
aislados: `../ops/2026-10-04-sessions/integration.cjs`. Verifica probes pasivos,
compatibilidad antigua, CSRF, renovacion cookie/PG, 75 intervalos simulados,
revocacion por segundo login, logout con escritura tardia y actividad vencida.
No crea migraciones ni modifica usuarios/catalogo productivos.

Resultado final: 104/104 pruebas Angular y 130/130 backend; compilacion Angular,
TypeScript backend y lint de los modulos backend de sesion correctos. Integracion
aislada repetida con exito tras el ajuste de compatibilidad. Persisten los avisos
previos de CSS PDF/audio y dependencias CommonJS; no se ampliaron presupuestos.

Pendiente durante el uso, por acuerdo del usuario: audio real durante
mas de 75 minutos; Honor/Chrome en segundo plano y pantalla bloqueada; cortes
de red y varias pestanas. Un SO que suspenda JavaScript/red puede impedir la
renovacion: no se garantiza una sesion eterna ni funcionamiento offline.
TTS integrado posteriormente en dev: comunica eventos de avance, no solo
que el motor se encuentra en estado speaking; ver el apartado de voz.

Referencia contrastada: [express-session, rolling/save/touch](https://expressjs.com/en/resources/middleware/session/).
El backend usa rolling=false y disableTouch en connect-pg-simple: las
peticiones pasivas no alargan la expiracion del store. La actividad aceptada
modifica lastActivity y guarda explicitamente la sesion.

Despliegue acotado: siete modulos de sesion preparados sobre una copia del
backend realmente productivo, compilada y validada con 62 pruebas e integracion
PG/Redis aislada. No se desplegaron otros cambios pendientes del repositorio.
Reiniciado solo PM2 libretorio (id 1), Node 24.21.0; PID posterior 516957.
Otros procesos conservaron sus PID; 122 archivos protegidos y los bundles
JS/CSS/index.html productivos conservaron sus hashes. Sin migraciones.

Prueba por `https://libretorio.rji-services.org` con cuenta temporal eliminada
al terminar: audio/interaccion 204, anonimo 401, sin CSRF 403, probe pasivo sin
renovar cookie/PG, probe antiguo compatible, WebSocket, segundo login y logout.
Sin errores nuevos en el log del backend al finalizar. No equivale a una hora
de escucha ni a validar suspension real del movil.

Respaldo remoto restringido:
`/media/RIGO7/Libretorio-conf/ops/2026-10-04-backend-sessions/release-vlI4Qt/`.
Contiene `backend-before.tar.gz` (extraido y verificado por hashes) y
`books-store.dump` (25,248,726 bytes, inventario pg_restore verificado; no se hizo
restauracion completa de prueba). No se respaldaron/restauraron otras DBs.
Evidencia local: `../ops/2026-10-04-sessions/deploy-lrnDUt/activation.json`.
La reversa restaura solo los modulos del manifiesto y elimina el controlador
sessionActivity nuevo antes de reiniciar libretorio. No restaurar toda la DB
para revertir codigo: no hubo cambio de esquema.

## Integracion de lectores (2026-10-03)

Rama `feat/lectores-integracion`, trabajo local sin despliegue. Se mantienen
los cambios anteriores de Angular 22/dependencias y seguridad.

Con Node 24, `npm run start:readers` inicia HTTPS en loopback, puerto 8447,
usando los certificados locales existentes en `../local-b0-b1/tls/`.
No cambia `proxy.conf.json` ni la configuracion del build productivo.
`LIBRETORIO_DEV_BACKEND` permite cambiar el destino HTTPS del proxy;
por defecto es `https://libretorio.rji-services.org`.

Este modo NO aisla la base: el login usa cuentas y sesiones productivas,
y mantiene la sesion unica. Bloquea escrituras HTTP salvo login/logout y
`POST /api/session/activity` (renovacion de la sesion de audio),
pero el protocolo WebSocket sigue siendo el productivo: NO editar metadata.
Las lecturas generan la auditoria habitual del backend.

Integrado: reproductor propio del lab, capitulos desplegables, transporte
unico, paneles de velocidad/volumen/opciones, preferencias locales y
diagnostico opt-in acotado. Sin Video.js; MuPDF se incorpora solo para PDF en
la actualizacion del 2026-10-04 descrita arriba. La fuente local Material
Icons `filled.css` es necesaria; existe una prueba de render del glifo.
El cierre destruye el audio y conserva la posicion; las preferencias y
posiciones siguen siendo locales, no historial PostgreSQL por usuario.

El flujo `Abrir PDF` comprueba disponibilidad al mostrar la ficha y al abrir;
EPUB no ofrece conversion y los PDFs originales conservan su lector.
Requiere desplegar conjuntamente el cambio de backend que devuelve
`data.requestId` en `convert_to_pdf`, preparado en la rama homonima del
backend. Con el backend anterior se deshabilita y explica la incompatibilidad:
no se acepta una respuesta sin identidad ni se inicia conversion alguna.

### Cierre local del bloque de audio

Actualizacion 2026-10-03 18:02 Lima: se desplego SOLO la lectura de metadata
preparada de audio y el requestId de sus respuestas en el backend. Se conservo
el contrato anterior para la vista productiva. No se desplegaron sesion,
auditoria, disponibilidad de PDF ni cambios de la vista. Respaldo y evidencia:
`../ops/2026-10-03-audio/deploy-6JhVaL/activation.json`.

Implementado en ambas ramas; salvo el bloque de audio indicado arriba,
los cambios siguientes NO estan desplegados:

- Backend lee siempre `audio_metadata`, verifica identidad del archivo y no
  usa extraccion como fallback. Metadata ausente/obsoleta/fallida no inventa
  capitulos; un archivo identificado como no-audio se excluye.
- Las respuestas de audio incluyen `requestId`, tambien las vacias y errores.
  La vista ignora respuestas tardias; solo conserva compatibilidad con
  respuestas no vacias del backend antiguo cuya ruta coincide.
- Durante avance real de audio, una peticion por minuto como maximo renueva
  la sesion mediante HTTP con CSRF. Pausa/cierre no generan renovaciones del
  reproductor, y una peticion bloqueada vence a los 10 segundos.
- WebSocket consulta la actividad persistida por HTTP, sin ignorar la
  caducidad en PG, usuario deshabilitado o sustitucion de la sesion.
- `401`, logout y revocacion detienen audio; una interrupcion transitoria de
  red/`503` no se interpreta como logout. Un servidor sin el nuevo endpoint
  muestra una advertencia, no simula soporte.
- Auditoria conserva `archive.id` en `changes.archiveId`, evitando intentar
  insertar enteros en la columna UUID `entity_id`. Los UUID se conservan.

Validacion: 59 pruebas Angular y 119 backend; build Angular, TypeScript y
lint de los modulos backend modificados correctos. Integracion con backend
compilado real, PG y Redis locales: 49 capitulos M4A, auditoria, CSRF, Range,
renovacion de cookie/DB, revocacion por segundo login y logout. El reloj de
75 minutos se simulo; NO equivale a escuchar 75 minutos en un movil.
Revision visual a 1080 y 390 px: iconos, panel de velocidad y textos sin
desbordes. Persisten advertencias de build por CSS del reproductor (7.27 kB
frente a umbral de aviso de 5 kB) y dependencias CommonJS de EPUB.js.

La vista de 8447 sigue apuntando a produccion. Alli ya esta desplegada la
lectura de metadata de audio, pero NO el endpoint de renovacion de sesion,
su coordinacion WS ni el contrato nuevo de PDF. No considerar esas funciones
validadas en 8447. La integracion aislada reproducible esta en
`../ops/2026-10-03-audio/integration.cjs`; no modifica originales ni produccion.

Pendiente para produccion: escucha real prolongada, Honor Magic 8 Lite con
pantalla bloqueada/segundo plano, cortes de red y varias pestanas, muestras
M4B reales y perfiles de memoria. El monitor de autenticacion preexistente
sigue consultando `/api/me` cada 5 minutos; no se cambio la politica general
de inactividad de una pestana abierta.

Siguiente bloque: mejorar EPUB.js y ngx/PDF.js actuales, sin MuPDF ni
conversion EPUB. Revisar ciclo de carga/cierre y errores, modo oscuro,
preferencias locales, tipografia EPUB y espacio util movil. Historial y
preferencias en PG por usuario siguen siendo una entrega posterior.

### Barra por capitulo (2026-10-03, solo vista local)

- La barra y los tiempos usan el capitulo actual cuando tiene inicio/fin
  validos. Sin capitulos o entre ellos, usan la pista completa.
- La lista muestra duracion de cada capitulo, no su desplazamiento; el total
  del archivo permanece en la fila de pista. No se estiman finales ausentes.
- El arrastre congela la escala y solo busca al soltar. Teclado: flechas de
  un segundo, PageUp/PageDown de diez, Home/End dentro del intervalo; Escape
  cancela. La posicion persistida y los saltos de diez segundos son absolutos.
- Pruebas automatizadas con audio/almacenamiento simulados cubren limites,
  huecos, cancelacion, teclado, eventos tactiles y recuperacion de posicion.
  Chrome con metadata real: Sombras de identidad, 34 capitulos; el tercero
  muestra 37:59. Teclado verificado y posicion previa restaurada exactamente.
  Pendiente validar el arrastre en Honor Magic 8 Lite real.
- Sin cambios de navegacion, backend, scanner ni despliegue productivo.
- Validacion final de este bloque: 72 pruebas Angular correctas y build de
  produccion correcto. Persisten avisos CommonJS de EPUB.js y presupuesto
  CSS del reproductor (7.34 kB frente al umbral de aviso de 5 kB).

### PDF: espacio de lectura y modo nocturno (2026-10-03)

Solo vista de desarrollo, sin despliegue ni cambio de motor:

- PDF.js/ngx actual, zoom inicial page-width tambien en movil y showBorders
  desactivado desde el montaje. No se recorta contenido ni el margen que
  pertenece al documento; el zoom que el usuario elige se conserva al
  alternar el modo nocturno.
- Altura del visor limitada al cuerpo del modal. Cabecera compacta y
  100dvh aplicados exclusivamente al modal PDF; los otros lectores no
  reciben esos estilos.
- Luna/sol en la barra: filtro CSS reversible sobre paginas y miniaturas,
  no sobre controles. Preferencia local `libretorio:pdf:night:v1`, apagada
  inicialmente y tolerante a almacenamiento bloqueado. No es configuracion
  por usuario en PostgreSQL.
- El filtro tambien invierte luminosidad de imagenes: no preserva fidelidad
  fotografica. No cambia el archivo descargado ni su resolucion. No se usan
  opciones globales forcePageColors ni se recarga el PDF para cambiar tema.
- Barra con componentes nativos de la biblioteca; busqueda, paginas, zoom,
  miniaturas y descarga conservados. Doble pagina en el menu Herramientas.
- disableRange=false, disableStream=true y disableAutoFetch=true explicitos.
  Esto permite solicitar rangos pero NO garantiza una cantidad determinada
  de bytes antes de la primera pagina: depende del PDF y del servidor.
- rangeChunkSize=1048576 (1 MiB), en lugar del predeterminado de 64 KiB.
  Reduce peticiones pequenas al endpoint publico. PDF.js descarga en una
  sola respuesta archivos de hasta dos bloques (2 MiB con este ajuste);
  los mayores siguen usando rangos si el servidor los admite. No es un
  limite total de memoria ni un maximo por respuesta: agrupa rangos contiguos.

Validacion: 15 pruebas de PDF/ficha y regresion seleccionada de 66 pruebas
(incluye esas 15, audio, sesion, servicios e interceptores), todas correctas.
Build de produccion correcto con los avisos anteriores. Chrome de escritorio:
PDF real de 197 paginas, salto de pagina por teclado, zoom, filtros, menu de
doble pagina y geometria del modal. El cuerpo y visor terminan en el mismo
borde inferior, sin scroll exterior adicional. Capturas de portada y texto.

Pendientes: Honor real/rotacion, toolbar a anchos pequenos, diagramas y otros
PDFs escaneados; medir peticiones/bytes hasta primera pagina y saltos lejanos
con archivos grandes a traves del acceso publico. Las respuestas 206 previas
de tres archivos en el backend aislado no sustituyen esa medicion.

Documentacion de API contrastada con la version instalada:
https://pdfviewer.net/extended-pdf-viewer/attributes

### Apertura PDF: medicion del 2026-10-03 (Lima)

Chrome de escritorio, vista en https://localhost:8447, proxy al dominio
productivo libretorio.rji-services.org. Pestaña propia, recarga desde raiz
entre muestras; sin alterar navegacion, almacenamiento ni archivos originales.
Tiempos desde asignacion de src hasta primer pageRendered. Son muestras
individuales, no percentiles ni garantias para otras redes o moviles.

| Muestra | Bloque | Primera pagina | Respuestas del PDF hasta apertura |
| --- | --- | --- | --- |
| Capitan Blood, 1.349.434 bytes, 279 paginas | 64 KiB, barra nueva | 15,643 s | 21 respuestas 206 |
| Mismo PDF | 64 KiB, barra nativa (control) | 14,651 s | 21 respuestas 206 |
| Mismo PDF | 256 KiB | 7,633 s | 6 respuestas 206 |
| Mismo PDF | 1 MiB | 2,580 s | 1 respuesta 200 |
| Quijote, 5.882.710 bytes, 1259 paginas | 1 MiB | 8,697 s | 6 respuestas 206 |
| Nelson, 1.763.767.632 bytes, 4604 paginas | 1 MiB | 9,703 s | 3 respuestas 206 completas y otra en curso |

Nelson: las tres respuestas completas previas al primer render suman
2.159.952 bytes (2,06 MiB); despues la carga inicial se estabilizo en siete
respuestas, 6.354.256 bytes (6,06 MiB). No se descargo el archivo completo.
Salto a pagina 1000 comprobado visualmente: otra respuesta 206 de 2 MiB.

Capitan Blood pasa qpdf --check en produccion. Su /Pages contiene los 279
/Kids directamente. El getPageDict de PDF.js 6.2.1099 precarga diccionarios
del nivel superior y initDocument comprueba primera/ultima pagina: desactivar
autoFetch no suprime lecturas necesarias para esa estructura. Con bloques
de 64 KiB las respuestas suman todo el archivo antes de abrir. Esto no
significa que renderice las 279 paginas primero. En esa muestra se detectaron
164 ms de tareas largas del hilo principal; dominaba la espera de datos.
En Nelson si hubo una tarea de 1467 ms: no generalizar el diagnostico de CPU.

La barra nativa reproduce la demora; las banderas disableStream/disableRange
explicitadas recientemente coincidian con los valores ya predeterminados
de la version instalada. No se ha demostrado una regresion causada por
la barra o el modo nocturno. Queda separar la latencia del proxy local,
el acceso publico y el backend si se busca reducir mas la espera restante.

Se conservaron barra, tema y lectura por rangos; se retiro la instrumentacion
temporal tras medir. Sin despliegue ni cambios del backend o Nginx.
Validacion final del ajuste: 15/15 pruebas PDF/ficha y compilacion de
produccion correctas; persisten los avisos previos de CSS de audio y
dependencias CommonJS de EPUB. La prueba movil fisica sigue pendiente.
Referencia del recorrido de paginas contrastada con el codigo instalado:
https://github.com/mozilla/pdf.js/blob/master/src/core/catalog.js

## TTS EPUB recuperable en dev (2026-10-06)

Se integra el motor probado en `../local-speech/recovery` SOLO para EPUB.
Su fuente canonica pasa a `src/app/core/recoverable-speech/`; el lab sirve
esos mismos modulos y conserva sus pruebas. No se modifican el visor PDF,
su TTS anterior, navegacion del catalogo, indice EPUB, modo continuo o la
politica existente sobre `destroy()`. Sin dependencias ni backend nuevos.

- Seleccion por CFI de EPUB.js, seccion, archive.id y ruta publica; sin
  `selection.toString()` completo ni un array de todas las frases.
- Marcador separado por usuario autenticado y libro en IndexedDB
  `libretorio-epub-speech-v1`. Se valida `/api/me?passive=1` antes de
  continuar; restaurar o abrir el libro no reproduce automaticamente.
- Antes de hablar se guarda la frase pendiente; solo un fin nativo valido
  confirma su avance. Pausar/ocultar cancela la locucion y continuar repite
  la frase pendiente, no el capitulo. Errores recuperables reintentan la
  misma frase (hasta tres intentos); no saltan texto. Reiniciar o sustituir
  una lectura existente requiere confirmacion. Hay exclusion entre pestanas.
- Maximo dos bloques de 8192 unidades UTF-16, una ventana normalizada con
  mapa de offsets y una locucion de hasta 480 caracteres. Se conservan la
  limpieza de saltos de linea, guiones partidos y limites Unicode del lab.
- Antes de usar un marcador, HEAD comprueba validadores HTTP y un SHA-256
  incremental verifica el texto seleccionado. Para EPUB en carpeta se
  consulta la seccion XHTML, no solo el OPF. Los headers NO son un hash.
  Un archivo cambiado bloquea la lectura conservando el marcador anterior.
- La verificacion inicial recorre la seleccion, por bloques y cediendo al
  hilo de UI; no la segmenta ni la retiene completa. Al reabrir/continuar se
  vuelve a validar. Esto NO limita la memoria del ZIP/DOM que carga EPUB.js,
  ni cambia su generacion previa de posiciones. Una seleccion abarca una
  seccion/iframe; no se promete seleccionar varias secciones de una vez.
- La renovacion de sesion usa el endpoint existente y solo recibe progreso
  de voz valido (boundary creciente o fin), no inicio, pausa ni errores.
- Buscar `espa`, `Spanish` o `es-US` filtra idioma y voz sin depender del
  idioma del navegador. Las voces remotas requieren consentimiento explicito.

Diagnostico: export desde el menu TTS, ultimos 200 eventos, acumulados de
latencia y buffers, hasta 120 muestras de estado/heap orientativo. Guardado
cada 30 segundos activos y al pausar, ultimas cinco ejecuciones en
`libretorio-epub-speech-diagnostics-v1`. No exporta texto, titulo, CFI, ruta
ni usuario; no envia telemetria al servidor. El JSON incluye hasta cuatro
ejecuciones anteriores. Un cierre abrupto puede perder el ultimo intervalo
del diagnostico, no altera los checkpoints previos a la locucion.

La persistencia es local al navegador y origen: localhost y la IP LAN son
almacenamientos diferentes. No implementa aun historial PG ni sincronizacion
entre dispositivos. EPUB sigue requiriendo que el libro este disponible.

Verificacion: 95 pruebas Angular de adaptador, controles, sesiones, EPUB,
PDF y ficha; 30 pruebas del motor y 6 de metricas; build de produccion
correcto con avisos CSS/CommonJS anteriores. `tests/epub-speech-browser.cjs`
usa Chrome aislado, API/WS sinteticos y un EPUB de prueba a 320/390/1440 px.
No inicia sesion real ni contamina el perfil del usuario. Evidencia en
`../local-speech/reports/epub-dev/`. La prueba audible prolongada y la
validacion de esta integracion en el Honor quedan para uso real; no bloquean
este paso y no se sustituyen por la sintesis simulada de las pruebas.
La prueba de navegador confirma avance a la segunda frase, pausa/recarga,
recuperacion del cursor 33 y su frase pendiente, guardado periodico real a
30 segundos y diagnostico recuperado en los tres anchos. Los errores HTTP
del diagnostico se reducen a codigos (por ejemplo `http-503`), sin URL.

Acceso dev existente: `https://localhost:8447` o en la LAN
`https://192.168.0.49:8447`. Requiere recarga manual (live reload desactivado).
El proxy sigue apuntando a produccion; no hubo despliegue.

## TTS PDF recuperable en dev (2026-10-06)

Paso posterior a la integracion EPUB anterior: PDF comparte ahora el motor,
controlador y menu recuperables. `RecoverableSpeechService` y
`RecoverableSpeechComponent` son las implementaciones comunes; los exports
EPUB y su selector se conservan por compatibilidad. Los marcadores EPUB
existentes mantienen su namespace. No se cambia el backend, produccion,
la navegacion del catalogo, ni los modos Original/Lectura del PDF.

- PDF guarda un descriptor con archive.id, ruta, validadores HTTP, paginas,
  offsets UTF-16 y SHA-256 del texto seleccionable de cada pagina. No guarda
  una copia completa de la seleccion ni todas sus frases. Los metadatos
  crecen con el numero de paginas seleccionadas, no con su texto completo.
- El descriptor conserva la maquetacion usada para seleccionar. Cambiar
  modo, ancho o fuente del visor no cambia el texto pendiente ni obliga a
  volver visualmente al modo anterior para escucharlo.
- Se reutiliza el worker MuPDF existente, con mensajes de texto separados
  del render y respuestas de hasta 8192 unidades UTF-16. Maximo dos bloques
  de fuente en el motor, una ventana normalizada y una frase pendiente.
  El worker conserva adicionalmente el texto canonico de una pagina.
- No se extrae todo el PDF para comenzar. Se verifican las paginas de la
  frase pendiente al continuar y las siguientes conforme se necesitan.
  Un error de validacion detiene la lectura conservando el marcador; no
  omite la pagina. Los validadores HTTP y la huella del texto seleccionado
  son controles distintos, no una verificacion byte a byte de todo el PDF.
- MuPDF aun analiza/extrae una pagina completa y conserva sus caches de
  render/reflow. El limite de bloques TTS NO es una cota de memoria del
  archivo, WASM o DOM. Los bloques HTTP de 1 MiB y sus caches no cambian.
- La seleccion debe abarcar paginas contiguas con capa de texto disponible
  en la ventana renderizada. No se inventa texto para paginas sin texto ni
  se promete seleccionar un capitulo entero fuera de esa ventana. Copiar
  texto sigue conservando el comportamiento previo del visor.
- Marcador y diagnosticos: `libretorio-pdf-speech-v1` y
  `libretorio-pdf-speech-diagnostics-v1`, con las mismas confirmaciones,
  exclusion entre pestanas y politica de errores que EPUB. Restaurar no
  reproduce automaticamente. Sigue siendo persistencia local por origen;
  no se implementa historial PG ni sincronizacion entre dispositivos.

Pruebas de navegador: `tests/pdf-speech-browser.cjs` usa Chrome aislado,
API/WS simulados, PDF sintetico y worker MuPDF real a 320/390/1440 px.
Comprueba pausa, cambio de modo, recarga sin autoplay, recuperacion del
cursor 15 y final 1519/1519 entre dos paginas; tambien comprueba canvas
no vacio, panel sin desbordamiento y peticiones de texto acotadas solo a
las paginas seleccionadas. Evidencia: `../local-speech/reports/pdf-dev/`.
La regresion EPUB conserva cursor 33, frase pendiente y diagnosticos en
esos mismos anchos. Estas pruebas simulan eventos de voz: no sustituyen
la escucha real ni una prueba prolongada en el movil.

Verificacion final: 109 pruebas Angular, 30 del motor, 6 de metricas y
4 del worker MuPDF real correctas. Build de produccion correcto; persisten
los avisos previos de presupuesto CSS de audio/PDF y CommonJS de EPUB.
No se instalaron dependencias nuevas ni se desplego el resultado.

El diagnostico EPUB aportado por el usuario el 2026-10-06 termina en
510/510, con tres frases confirmadas y reanudaciones de las pendientes.
Los tres `stale-error: interrupted` siguen a pausas y no avanzan el cursor.
Esto valida esa prueba corta, no permite concluir estabilidad de memoria
en sesiones largas. Los contadores activos a cero al terminar no borran
los maximos acumulados de rendimiento.

## Gestion de usuarios en laboratorio, 2026-10-07

- Ruta nueva `/usuarios`, protegida para administrador y disponible solo si
  `/api/me` anuncia `userManagementEnabled`. `/cuenta` cambia el password propio.
  No se modificaron las rutas de Biblioteca, lectores o modales del historial.
- Lista de hasta 20 cuentas, consulta por correo y estado; cada pagina reemplaza
  la anterior. Edicion, alta, activar/desactivar, usuario/admin, restablecer
  password y revocar sesion. No se ofrece borrar: historia y auditoria se conservan.
- Reautenticacion para cada cambio; confirmacion de password nuevo, conflictos
  explicitos y limpieza de campos secretos al terminar/cancelar. Cuenta propia
  revocada vuelve al login. Ultimo admin protegido por el backend, no por botones.
- Iconos Bootstrap del proyecto y controles de 44 px. La cabecera agrupa en
  Cuenta el cambio de password, Gestionar usuarios (solo admin) y Cerrar sesion.
  Inicio/Biblioteca conservan sus textos incluso a 320 px; Cuenta usa solo
  icono con nombre accesible en movil. Cerrar sesion no depende de la capacidad
  administrativa ni de que la consulta de permisos de la cabecera tenga exito.

Prueba manual aislada: https://localhost:8449/usuarios o
https://192.168.0.49:8449/usuarios desde la misma LAN.
Usuario `admin@users.test`, password exclusivamente local
`prueba123` (simplificado el 2026-10-09). `reader@users.test` conserva
`Libretorio-Users-Lab-2026!`.
`../ops/2026-10-07-users/seed.cjs` crea estas cuentas solo si no existen;
no restablece cambios realizados durante pruebas manuales.

8449 usa backend/PG aislados y su propia cookie `history.lab.sid`. Las pruebas
automaticas usan cuentas aleatorias desechables, no estas cuentas manuales ni
el perfil personal. 8447 sigue conectado a produccion: el proxy bloquea las
escrituras administrativas y no se habilito la funcionalidad en ese backend.

Validacion: 28 tests Angular de usuarios/cabecera/login/sesion/navegacion;
prueba browser completa de alta, filtros, deshabilitar con historia conservada,
reactivar, reset y password propio; capturas 1440, 900 vertical, 390 y 320 px.
Se comprobo scroll hasta Confirmar en el movil y ausencia de overflow horizontal.
Regresion de 13 escenarios de rutas/modales/lectores sin errores JS.
Resultados y capturas: `../ops/2026-10-07-users/`.

Build production local correcto con los avisos preexistentes de CSS PDF/audio y
CommonJS EPUB. No se instalaron dependencias ni se publico la vista. Esta revision
no sustituye el uso real prolongado de audio/TTS ni la prueba fisica en Honor.

### Revision del menu Cuenta, 2026-10-07

Desplegable sin dependencia nueva, con enlaces/botones nativos, aria-expanded,
Escape y retorno de foco, cierre por clic exterior, salida de foco y navegacion.
Sin cambios en rutas ni en el funcionamiento del arbol, historial o lectores.
Confirmar/Cancelar tienen iconos coherentes manteniendo la jerarquia visual.
Las etiquetas distinguen Cuenta habilitada/deshabilitada y Ultimo inicio de
sesion. No hay indicador online: habilitacion y login no acreditan presencia.

35 pruebas Angular y 13 escenarios de regresion de rutas/modales/lectores
correctos. Build production correcto con los avisos anteriores. Capturas y
prueba integral de cuentas en `../ops/2026-10-07-users/`; cuentas aleatorias
retiradas al terminar, sin usar el perfil ni las cuentas manuales del usuario.
Solo cambios locales de vista y pruebas; sin despliegue ni cambios de backend/DB.

## Busqueda del catalogo y de documentos, 2026-10-08

Implementacion local en 8449 con backend/PG aislados. `/buscar` conserva filtros,
orden y cursor en la URL; escribir no modifica carpetas ni envia busquedas WS.
Enter confirma la consulta. Campos avanzados: titulo, autor, ISBN, descripcion,
idioma/tipo registrados y carpeta con/sin descendientes. Paginacion por cursor,
50 fichas como maximo, sin acumular paginas. Consulta HTTP anterior cancelada,
respuestas antiguas descartadas y errores separados de ausencia de resultados.
Detalles/lectores se abren con `archivo`/`vista` conservando la busqueda.

PDF y EPUB tienen lupa junto a Indice. Resultados progresivos por lotes de hasta
50, con siguiente tramo, cancelacion, reintento y resaltado de la coincidencia.
La barra de coincidencias ocupa su propia fila, sin tapar texto ni desplazar
las opciones de TTS/lectura. El resaltado EPUB usa annotations de epub.js, uno
solo, sin envolver nodos ni cambiar CFI. PDF usa el worker MuPDF ya existente.
Enlaces internos PDF clicables en Original y menu de destinos en Lectura;
retorno acotado a 20 posiciones. No se habilitan URLs externas/acciones del PDF.

Texto de busqueda literal, no regex del usuario; maximo 128 caracteres en los
documentos. Ventanas de 32.768 caracteres; una pagina/seccion en vuelo, sin
indice del libro completo ni resultados ilimitados. El parser nativo todavia
necesita una pagina PDF o un DOM EPUB completo: no prometer RAM constante ante
archivos patologicos. Una busqueda amplia puede transferir el documento entero.

Pruebas: 250 Angular completas (43 dirigidas), 7 motor/texto, browser en 1440/390/320 px sin
errores JS. Comparacion SQL read-only en el catalogo real de 71.187 archives,
sin desplegar la API alli. Evidencia y recursos medidos en
`../ops/2026-10-08-search/`; detalles en la seccion 13 de la adenda general.
No publicar solo esta vista contra un backend sin `/api/catalogue/search`.

## Revision responsive local, 2026-10-08

En 8449: arbol movil superpuesto sin comprimir el contenido, cierre mediante
fondo/Escape y exclusion mutua con Cuenta; catalogo con rejilla segun espacio
disponible; detalles con titulos largos ajustados; formularios/login con
controles accesibles en poca altura. Sin cambios de rutas, seleccion del
arbol, motores de lectura/TTS ni algoritmo de lotes del catalogo.

252 tests Angular y build production correctos. Matriz de 80 capturas en
siete viewports, mas 29 de menus/movil, sin errores JS ni desbordamientos
en los escenarios comprobados. Prueba de scroll con 97 filas temporales:
avance, regreso y ultimo lote de siete estable, incluido 1080x1920, con
buffer de 160 px conservado. Evidencia: `../ops/2026-10-08-responsive/`;
usar `after-fixed/`, `after-menus-verified/` y `scroll.json`, no las pasadas
fallidas iniciales. Detalles y limites en seccion 14 de la adenda general.

Conserva avisos CSS/CommonJS y NG0956 en tests; no se atribuye este ultimo
a un componente sin reproducir su origen. Falta validacion fisica del movil
y uso prolongado. Busqueda funcional real diferida a produccion por decision
del usuario; esta revision no despliega ni habilita la API productiva.

## Publicado junto al backend, 2026-10-09

El usuario aprobo la vista movil y autorizo publicar el conjunto. La version
production esta en https://libretorio.rji-services.org, con buscador y gestion
de usuarios habilitados en el backend. Esta entrada reemplaza la limitacion
de API exclusiva de 8449 indicada en las secciones anteriores.

Se publicaron 66 archivos de la compilacion y se conservaron bundles previos
y enlaces de biblioteca/cache. La comprobacion PDF devuelve requestId: Dune
order-de-lectura.md ya existente se reconoce como preparado. No se regenero.
252 tests Angular, 161 backend del stage, 17 integraciones de usuarios y
34 comprobaciones por el dominio publico aprobadas. Detalles, respaldo,
reversion y pruebas de uso pendientes: `../ops/2026-10-09-release/README.md`.

NG0956 reproducido en los tests que reemplazan el libro de los formularios
de editar/buscar metadata: se reconstruyen cuatro/nueve controles. No es
el scroll del catalogo. Los avisos de CSS/CommonJS siguen sin bloquear build.
Uso prolongado audio/TTS y excepciones de documentos reales siguen pendientes.
Dev8447 mantiene su bloqueo de escrituras administrativas: para gestion real
usar produccion; 8449 sigue siendo el lab aislado con sus propias cuentas.

## Audio movil compacto y ampliable, publicado 2026-10-09

Reproductor compacto en movil, boton para ampliar pistas y
capitulos y controles reducidos al pie. La lista y el audio no se recrean;
se conserva la posicion y Escape vuelve al reproductor. Diagnostico dentro
de Opciones solo en movil. Desktop conserva el diseno publicado.

256 tests Angular aprobados, build production local correcto y pruebas browser
aisladas con audio real sintetico, listas largas y rotacion. Capturas desktop
antes/despues identicas en tres tamanos. Aprobado en dev por el usuario y
publicado a las 17:32 Lima, solo siete archivos de la vista, con respaldo
restaurado y verificado antes. Sin cambios backend/DB ni reinicio PM2.
66 archivos verificados; dominio publico sirve los nuevos bundles y mantiene
401 sin sesion para catalogo/libros/cache. Sin errores nuevos del backend.
Evidencia: `../ops/2026-10-09-audio-mobile/README.md`.
