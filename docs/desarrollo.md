# Desarrollo de la vista

Volver a la [presentacion de Libretorio](../README.md).

## Entorno y conexion

Usar la version de Node declarada en [package.json](../package.json) y ejecutar
`npm ci` desde la raiz de este repositorio. El frontend usa el mismo origen para
API, WebSocket y archivos; un proxy de desarrollo debe cubrir los tres.

- `npm start` escucha en `0.0.0.0` y utiliza el proxy de
  [angular.json](../angular.json): [proxy.conf.json](../proxy.conf.json). Este
  archivo contiene una IP de desarrollo concreta y solo reenvia `/api/*`;
  no constituye una configuracion portable para probar todos los lectores.
- `npm run start:readers` escucha por HTTPS en `0.0.0.0:8447` y usa
  [proxy.readers.cjs](../proxy.readers.cjs). Necesita los certificados
  `../local-b0-b1/tls/localhost.crt` y `.key`, que no se incluyen en el repo.
- `LIBRETORIO_DEV_BACKEND` permite elegir el backend HTTPS del proxy de lectores.
  **Si no se define, ese proxy apunta a la instalacion productiva configurada
  en el archivo.** No iniciar pruebas suponiendo que es un backend aislado.

Con un backend de pruebas ya disponible y certificados propios, puede ejecutarse
desde la raiz del repositorio, sustituyendo dominio y rutas:

```bash
LIBRETORIO_DEV_BACKEND=https://backend-de-pruebas.example \
  npx ng serve --host 127.0.0.1 --port 8447 --ssl \
  --ssl-cert /ruta/dev.crt --ssl-key /ruta/dev.key \
  --proxy-config proxy.readers.cjs --hmr=false --live-reload=false
```

El proxy verifica el certificado del backend. Preparar certificados confiables;
no desactivar esa verificacion para resolver problemas de conexion. Para probar
desde el movil en la misma LAN, escuchar en `0.0.0.0` y abrir la IP de la PC,
no `localhost` en el telefono. El certificado debe ser adecuado para ese acceso.
No publicar el servidor de desarrollo en Internet.

## Limites del proxy de lectores

El proxy permite login, logout, actividad de sesion y escrituras de historial,
progreso y preferencias; bloquea otras escrituras HTTP. Por ello no permite
validar toda la gestion administrativa de usuarios.

**No es un aislamiento de solo lectura:** reenvia WebSocket y algunas acciones
del catalogo pueden modificar datos. Si apunta a produccion, usa sus cuentas,
guarda actividad real y un login sustituye la otra sesion del mismo usuario.
Para pruebas destructivas o administrativas se necesita un backend y una base
aislados, con una configuracion de proxy apropiada para ese entorno.

## Pruebas y compilacion

```bash
npm test -- --watch=false --browsers=ChromeHeadless
node --experimental-vm-modules --test tests/text-search.test.mjs tests/pdf-worker.test.mjs
npm run build
```

La suite Angular requiere Chrome/Chromium disponible. Las pruebas del worker PDF
se ejecutan con Node 24. Los tests automatizados no reemplazan pruebas reales de
audio prolongado, voces del sistema, bloqueo de pantalla y cambios de red.

Los diagnosticos de lectores y TTS sirven para investigar fallos. El TTS conserva
eventos y metricas acotados y permite exportarlos desde la interfaz; no envia el
texto a un servidor propio de sintesis. El usuario debe habilitar expresamente
las voces que el navegador identifica como remotas.

## Publicacion junto al backend

1. Compilar con `npm run build` y comprobar los archivos de
   `dist/libretorio-ng/browser/`, incluidos worker, WASM y recursos de lectores.
2. Incorporar ese contenido a `src/browser/` del repositorio del backend. Su
   `copyStaticAssets.ts` lo copia a `dist/public/` durante la compilacion.
3. Preparar y verificar la entrega del backend con sus migraciones, variables y
   rutas de almacenamiento. Respaldar antes de intervenir una instalacion.
4. Publicar frontend y backend compatibles; comprobar login, sesion unica,
   historial, lectura, audio y peticiones por rango a traves del HTTPS real.

Los libros y la cache no son assets publicos de Angular. Deben pasar por la
autenticacion del backend, tambien cuando se conocen sus rutas. Revisar las
[instrucciones del backend](https://github.com/Rigo85/libretorio#readme) antes
de configurar el proxy inverso. Este documento no autoriza ni ejecuta despliegues.
