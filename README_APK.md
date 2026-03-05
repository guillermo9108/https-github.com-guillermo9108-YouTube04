# Guía Técnica: Creación del Cliente Android (APK) para StreamPay

Este documento detalla los requisitos críticos para desarrollar un contenedor nativo (**WebView Wrapper**) que convierta la PWA de StreamPay en una aplicación Android con apariencia y comportamiento 100% nativos, optimizada para servidores locales (self-hosted).

## 1. Arquitectura de Conexión y Red

El APK debe conectarse a dos servicios que corren en el mismo servidor físico pero en puertos distintos:
*   **Interfaz PWA:** `http://[IP_DEL_SERVIDOR]/` (Ej: `http://192.168.1.100/`)
*   **Motor de Streaming:** `http://[IP_DEL_SERVIDOR]:3001/`

### Configuración del Manifest (`AndroidManifest.xml`)
Es obligatorio habilitar el tráfico de red en texto plano (HTTP) ya que los servidores locales raramente usan SSL (HTTPS).

```xml
<!-- Permisos -->
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.CAMERA" /> <!-- Para Marketplace -->
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />

<application
    android:usesCleartextTraffic="true"
    android:networkSecurityConfig="@xml/network_security_config"
    android:theme="@style/Theme.AppCompat.Light.NoActionBar"> <!-- Quitar barra superior nativa -->
    
    <!-- Bloquear Orientación a Vertical -->
    <activity
        android:name=".MainActivity"
        android:screenOrientation="portrait" 
        android:configChanges="orientation|screenSize">
    </activity>
</application>
```

### Configuración de Seguridad (`res/xml/network_security_config.xml`)
```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>
```

## 2. Inmersión Visual (Apariencia Móvil)

Para que el APK se vea idéntico a la web en modo móvil, el contenedor debe "desaparecer" y dejar que React controle toda la interfaz.

### StatusBar y NavigationBar (Java/Kotlin)
El color de fondo debe ser el **Slate 950** (`#0f172a`) usado en la aplicación.

```java
if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
    Window window = getWindow();
    window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
    window.setStatusBarColor(Color.parseColor("#0f172a")); // Fondo Dark de StreamPay
    window.setNavigationBarColor(Color.parseColor("#0f172a")); // Bottom bar nativa
}
```

## 3. Implementación con React Native / Expo (Recomendado)

Para una implementación moderna y multiplataforma, se recomienda usar **Expo** con `react-native-webview`. Hemos incluido un componente completo en `/mobile/webview.tsx` que maneja:

*   **Descargas Nativas:** Intercepta enlaces de streaming y descarga archivos directamente al almacenamiento del dispositivo usando `expo-file-system`.
*   **Galería:** Guarda automáticamente los videos descargados en la galería del teléfono (`expo-media-library`).
*   **Pantalla Completa:** Gestión automática de orientación y modo inmersivo para videos.
*   **Menú de Control:** Acceso rápido a descargas, recarga y configuración.

### Instalación de Dependencias (en el proyecto Expo):
```bash
npx expo install react-native-webview expo-file-system expo-media-library expo-sharing expo-screen-orientation expo-notifications @react-native-async-storage/async-storage
```

---

## 4. Configuración del WebView Nativo (Java/Kotlin - Legado)

Si prefiere usar Android Studio directamente, configure el WebView para que soporte la persistencia de datos y la reproducción fluida.

## 4. Manejo del Botón "Atrás" (Navegación)

En una PWA, si el usuario presiona el botón físico "Atrás" de Android, la aplicación se cerraría por defecto. Debes interceptar esto para navegar dentro del historial de la web.

```java
@Override
public void onBackPressed() {
    if (myWebView.canGoBack()) {
        myWebView.goBack(); // Navega atrás en la web (React)
    } else {
        super.onBackPressed(); // Cierra la app si está en el inicio
    }
}
```

## 5. El Desafío de la IP Dinámica (DHCP)

Dado que la IP del servidor puede cambiar, se recomienda implementar una de estas dos soluciones:
1.  **IP Configurable:** Al iniciar el APK por primera vez (o mediante un botón de ajustes), permitir al usuario escribir la IP del servidor y guardarla en `SharedPreferences`.
2.  **mDNS / Bonjour:** Usar una URL como `http://streampay.local` si el servidor soporta resolución de nombres locales.

## 6. Iconografía y Marca (Assets)

*   **Icono de App:** Usar el logo circular de StreamPay (Indigo con letras S+P).
*   **Splash Screen:** Fondo `#0f172a` con el logo centrado. Duración sugerida: 1.5 segundos para dar tiempo a que el Service Worker cargue la interfaz inicial.
*   **Carga Inicial:** Mostrar un `ProgressBar` discreto mientras el WebView carga la URL por primera vez.

---
**Nota sobre el Microservicio de Streaming:**
Asegúrese de que el puerto `3001` no esté bloqueado por el firewall del servidor (Synology DSM / Windows Firewall). El APK hará peticiones directas a ese puerto para el flujo de video MP4.