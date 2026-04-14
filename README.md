
# StreamPay - Plataforma Integral de Video y E-commerce Pay-Per-View

## 📄 Documento de Venta (Executive Summary)

### 1. Arquitectura y Escalabilidad (El por qué del valor)

**Modelo de Negocio Integrado**  
StreamPay no es solo una plataforma de video; es un ecosistema económico completo que combina tres sistemas en uno:
1.  **Marketplace de Video (Estilo YouTube/Netflix):** Los creadores suben contenido premium que los usuarios desbloquean mediante micro-pagos.
2.  **E-commerce P2P:** Una tienda integrada donde los usuarios pueden vender bienes físicos, similar a un marketplace de segunda mano.
3.  **Sistema de Finanzas Internas:** Gestión de una moneda virtual ("Saldo") que facilita transacciones instantáneas y sin fricción entre usuarios.

**Módulos Clave de Alto Valor**
*   **Módulo de Comisiones Automatizado:** El sistema retiene automáticamente un porcentaje configurable (por defecto 20%) sobre cada venta de video o producto físico, generando ingresos pasivos constantes para el administrador.
*   **Módulo de Saldo Virtual Seguro:** Gestión centralizada de cuentas de usuario con un historial inmutable de transacciones (Depósitos, Compras, Ventas, Transferencias).
*   **Integración FFmpeg (Future-Proof):** El código base incluye la lógica para integración con FFmpeg para generación de miniaturas y transcodificación. *Nota: Esta funcionalidad está configurada para operar en modo ligero por defecto para compatibilidad con servidores NAS/Hosting compartido, pero está lista para activarse al migrar a servidores dedicados (VPS/GPU).*

**Tecnologías Usadas**
*   **Frontend:** React 18, TypeScript, Vite, Tailwind CSS (PWA Nativa).
*   **Backend:** PHP 8.0+ (Optimizado para alto rendimiento sin frameworks pesados).
*   **Base de Datos:** MariaDB / MySQL.
*   **Almacenamiento:** Sistema de archivos local o FTP remoto.

---

### 2. Seguridad y Contabilidad (El por qué de la seguridad)

**Flujo de Dinero Claro**  
El sistema maneja un ciclo económico cerrado para maximizar la seguridad y el control:
1.  **Entrada (CUP/Fiat):** El dinero real entra al sistema a través de Pasarelas de Pago (Tropipay) o Recargas Manuales aprobadas por el Administrador.
2.  **Conversión:** El dinero se convierte 1:1 (o con tasa configurable) a "Saldo" virtual en la cuenta del usuario.
3.  **Circulación:** El Saldo se mueve de Comprador a Vendedor (menos la comisión de la plataforma).
4.  **Salida/Consumo:** El Saldo se "quema" al adquirir servicios VIP o se acumula en las cuentas de los creadores.

**Prevención de Fraude Básico**
*   **Integridad de Sesión:** Tokens de sesión únicos validados contra la base de datos en cada petición crítica.
*   **Validación de Transacciones:** Uso de transacciones atómicas en base de datos (ACID) para asegurar que el saldo nunca se pierda ni se duplique durante una compra (si falla el crédito al vendedor, no se debita al comprador).
*   **Roles Estrictos:** Separación lógica completa entre usuarios estándar y administradores.

**Requisitos Mínimos y Limitaciones de Hosting (NAS/Shared)**  
La aplicación está diseñada para ser extremadamente ligera, permitiendo su ejecución en servidores locales (Self-Hosted) o NAS. Sin embargo, para garantizar la estabilidad en hardware modesto:
*   **Transcodificación:** Se recomienda mantener desactivada la transcodificación en tiempo real.
*   **Restricciones Sugeridas:**
    *   **Resolución Máxima:** 720p / 1080p (según ancho de banda de subida).
    *   **Duración Máxima:** 10-15 minutos por video para evitar timeouts de PHP en subidas lentas.
    *   **Configuración PHP:** `upload_max_filesize` y `post_max_size` deben ajustarse (ej. 512M) en el `php.ini`.

---

### 3. Experiencia de Usuario y Documentación

**Manual del Administrador: Configuración Económica**  
Desde el panel de administración (`/admin`), pestaña **Config**, puedes ajustar las palancas económicas del negocio:
*   **Comisión Videos (%):** Define cuánto retiene la plataforma de cada video vendido. (Ej. Creador vende a 100, Plataforma se queda 20, Creador recibe 80).
*   **Comisión Marketplace (%):** Define la comisión sobre ventas de productos físicos.
*   **Planes VIP:** Configura el precio y duración de las membresías que otorgan acceso ilimitado o bonos de saldo.

**Instrucciones de Despliegue (Servidor Estándar)**
1.  **Base de Datos:** Crea una base de datos vacía en MariaDB/MySQL (ej. `streampay_db`).
2.  **Archivos:** Sube el contenido de la carpeta `dist/` a tu servidor web (carpeta pública `public_html` o `www`).
3.  **Permisos:** Asegura permisos de escritura y lectura (generalmente `777` o `755`) en la carpeta `api/uploads/` y sus subcarpetas.
4.  **Instalación:**
    *   Abre tu navegador y ve a `https://tu-dominio.com/#/setup` (o la ruta donde subiste los archivos).
    *   Ingresa las credenciales de la base de datos (Host, Usuario, Contraseña, Nombre DB).
    *   Crea tu cuenta de **Super Administrador**.
5.  **Listo:** El sistema generará las tablas y configuraciones iniciales automáticamente.

---

*Desarrollado con arquitectura escalable y enfoque Mobile-First.*
