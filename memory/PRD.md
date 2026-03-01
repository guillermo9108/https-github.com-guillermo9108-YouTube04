# StreamPay PWA - Product Requirements Document

## Original Problem Statement
Análisis del proyecto PWA de streaming y ventas para corregir:
1. Página principal: mostrar correctamente tarjetas de carpetas, navegación entre carpetas hijas y categorías
2. Edición de carpetas: precio y orden se apliquen recursivamente a carpetas hijas y categorías
3. El orden (sortOrder) debe heredarse y respetarse en toda la jerarquía

## Architecture
- **Frontend**: React + TypeScript + Vite + TailwindCSS
- **Backend**: PHP con MariaDB
- **Estructura**: PWA con service worker

## Core Requirements
- Carpetas con sortOrder configurable (LATEST, ALPHA, RANDOM)
- Herencia de orden de padre a hijo
- Watch.tsx debe respetar el orden de la carpeta/categoría
- Búsqueda debe permitir ordenar resultados

## What's Been Implemented (Feb 2025)

### Backend (functions_videos.php)
- ✅ Nueva función `get_folder_sort_order()` para obtener el orden configurado de una carpeta/categoría
- ✅ Modificado `video_get_all()` para usar el sortOrder de la carpeta cuando no hay userSort
- ✅ Modificado `video_get_one()` para incluir `folderSortOrder` en la respuesta
- ✅ Modificado `video_get_related()` para respetar el sortOrder de la carpeta
- ✅ Nueva función `video_get_folder_videos()` para obtener videos de la misma carpeta con sortOrder
- ✅ Modificado `video_discover_subfolders()` para incluir sortOrder de cada subcarpeta
- ✅ Respuesta de `video_get_all()` incluye `appliedSortOrder` para el frontend

### Frontend
- ✅ **Watch.tsx**: 
  - Usa `getFolderVideos()` para obtener videos ordenados según configuración
  - Control de orden en la lista "A continuación"
  - Respeta sortOrder de URL cuando viene de búsqueda
  - Helper `sortVideosBySortOrder()` para ordenar en frontend

- ✅ **Home.tsx**:
  - Estado `appliedSortOrder` para mostrar el orden aplicado por backend
  - Pasa sortOrder al contexto de VideoCard
  - Indicador visual del orden aplicado

- ✅ **VideoCard.tsx**:
  - Pasa sortOrder en los parámetros de URL hacia Watch

- ✅ **db.ts**:
  - Nuevo método `getFolderVideos()`

## Prioritized Backlog

### P0 (Critical)
- [x] Orden de carpetas respetado al navegar

### P1 (High)
- [x] Testing completo del flujo de navegación
- [x] Verificar herencia de precios recursiva

### P2 (Medium)
- [ ] Botón de filtro en resultados de búsqueda (UI mejorada)
- [ ] Indicador de orden en tarjetas de carpetas

## Next Tasks
1. Implementar botón de filtro en resultados de búsqueda (UI mejorada)
2. Añadir indicador de orden en tarjetas de carpetas
