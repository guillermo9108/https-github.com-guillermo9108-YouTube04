# Guía de Actualización de APK StreamPay

Para que el sistema detecte nuevas versiones de la aplicación, debes colocar los archivos APK en la raíz del proyecto o en la carpeta `public/`.

## Formato del Nombre del Archivo
El sistema busca archivos que sigan este patrón:
`StreamPay X.X.X.apk`

Ejemplos válidos:
- `StreamPay 0.0.1.apk`
- `StreamPay 0.0.2.apk`
- `StreamPay 1.0.0.apk`

## Funcionamiento
1. **Detección de Navegador**: Si un usuario accede desde un navegador móvil (Chrome, Safari, etc.) que no sea la APK oficial, será redirigido automáticamente a la página de descarga (`#/download`).
2. **Detección de Actualizaciones**: Si un usuario accede desde la APK y el sistema detecta un archivo con una versión superior a la actual (definida en `App.tsx`), se mostrará un modal de actualización.
3. **Descarga Directa**: La página de descarga ofrece un botón de descarga directa del archivo APK más reciente encontrado.
4. **Acceso Directo**: Se incluye un botón para intentar abrir la aplicación si ya está instalada (usando el esquema `streampay://open`).

## Notas Técnicas
- La versión actual de la aplicación se define en la constante `currentVersion` dentro de `App.tsx`.
- El UserAgent utilizado por la APK para identificarse debe contener la cadena `StreamPayAPK`.
