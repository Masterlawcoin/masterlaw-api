# VCH Control de Jornada

PWA independiente para publicar directamente en **File Manager de Masterlaw**. GitHub se usa solo para versionado y Supabase para datos, autenticación y funciones seguras. **No usa n8n.**

## Arquitectura final
File Manager (`public_html/vch-jornada/`) → PWA móvil/web → Supabase Auth/PostgreSQL/RLS → jornadas y marcaciones → SHA-256 → dashboard → CSV/PDF.

## Flujo
Supervisor autenticado → selecciona Entrada/Salida → escanea QR o ingresa RUT → Supabase registra hora de servidor → jornada se abre/cierra → se genera hash SHA-256 encadenado → dashboard y reportes.

## Seguridad
- La clave incluida en `config.js` es publishable; nunca usar service_role en el frontend.
- RLS activo.
- Cada marcación usa hora del servidor y cadena SHA-256 (`prev_hash` + evento actual).
- La salida NO se inventa automáticamente: si falta, queda pendiente para regularización auditada.

## Reportes / gerencia
- Botón **Generar reporte**: consulta el resumen seguro desde Supabase.
- **Descargar CSV**: genera el archivo en el navegador.
- **Imprimir / PDF**: permite guardar un PDF desde celular o PC.
- No hay webhook ni dependencia de n8n.
- Si después quieres correo automático a gerencia, se puede hacer con un PHP/SMTP dentro de File Manager, manteniendo las credenciales fuera del frontend.

## File Manager
Subir esta carpeta completa a:
`public_html/vch-jornada/`

Abrir:
`https://masterlaw.cl/vch-jornada/`

## Primer supervisor
Crear el usuario en Supabase Auth y luego asociarlo en `vch_supervisores` con su `user_id`. No se incluye auto-registro de supervisor por seguridad.
