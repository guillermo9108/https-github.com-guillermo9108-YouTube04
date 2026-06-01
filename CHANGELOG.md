
# Historial de Actualizaciones Técnicas - StreamPay

## v1.7.1 - Corrección en Backend y Estabilidad de Índices
*   **Corrección de Error en Backend (FASE 1):** Resuelto el error `Undefined index: createdAt` en `/api/functions_videos.php` (Línea 1066). Se agregó validación de existencia del índice con `isset($gv['createdAt'])` y se asignó un valor por defecto usando `date("Y-m-d H:i:s")` cuando no está definido. Adicionalmente se aseguró la obtención de la columna `createdAt` en la consulta SQL de `video_discover_subfolders`.

## v1.7.0 - Sistema de Resiliencia y Organización Instantánea

Esta actualización resuelve problemas de estancamiento en el procesamiento y acelera la disponibilidad de contenido nuevo.

### 🛡️ Resiliencia de Procesamiento
*   **Persistent Retry System:** Nueva columna `processing_attempts` en la tabla `videos`. 
*   **Auto-Discard:** Si un video falla en la extracción de metadatos (archivo dañado, formato incompatible) más de 3 veces, el sistema lo marca automáticamente como `FAILED_METADATA`.
*   **Estabilidad del Escáner:** Evita que el escáner se detenga indefinidamente en archivos corruptos, permitiendo que el flujo de importación continúe con el siguiente archivo válido.

### ⚡ Organización Instantánea (Single-Video Pipeline)
*   **Trigger Inmediato:** Al finalizar el **Paso 2** (Extracción), el backend ahora ejecuta la lógica del **Paso 3** (Organización Inteligente) para ese video específico.
*   **Beneficio para Colaboración:** Los videos procesados por usuarios mediante el `GridProcessor` ahora se publican, renombran y categorizan al instante, apareciendo en el Inicio sin intervención manual del administrador.
*   **Refactorización Backend:** Extracción de la lógica de organización a una función interna reutilizable que aplica Regex Cleaners, mapeo de carpetas y asignación de precios base por categoría.

---

## v1.6.0 - Consolidación de Módulos Administrativos y Core Streaming
*   Implementación de Proxy de Streaming PHP para archivos locales (NAS).
*   Soporte completo para Byte-Range Requests (206 Partial Content).
*   Integración de Google Gemini 1.5 Flash para categorización semántica.
*   Módulo de Finanzas con aprobaciones ACID y simulador de proyecciones.
