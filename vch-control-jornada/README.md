# VCH Control de Jornada — File Manager

Arquitectura final: **File Manager + Supabase**, sin n8n.

## Roles
- **Administrador:** crea trabajadores y supervisores, asigna personal, ve reportes y controla altas/bajas.
- **Supervisor:** registra entrada/salida por RUT o QR, ve pendientes y reportes.
- **Trabajador:** entra con su cuenta, ve su QR individual y su historial de jornadas.

## Instalación
Subir el contenido de esta carpeta directamente a:
`public_html/vch-control-jornada/`

Abrir:
`https://masterlaw.cl/vch-control-jornada/`

Si el hosting conserva caché, hacer Ctrl+F5 y limpiar WP Fastest Cache.

## Seguridad
El frontend usa solo la clave publishable de Supabase. No contiene `service_role`.
Las horas de marcación se calculan en el servidor y cada evento queda encadenado con SHA-256.
La administración de cuentas Auth se realiza mediante la Edge Function autenticada `vch-admin-users`, que valida que el llamante sea un administrador VCH activo.
