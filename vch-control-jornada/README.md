# VCH Control de Jornada

PWA independiente para subir a File Manager o servir desde Vercel.

## Flujo
Supervisor autenticado -> Entrada/Salida -> QR o RUT -> hora exacta del servidor -> Supabase -> jornada -> SHA-256 encadenado -> dashboard -> CSV/PDF -> reporte gerencia.

## Seguridad
- Solo clave publishable en el frontend; nunca `service_role`.
- RLS activo.
- Cada marcación encadena `prev_hash` + evento y genera SHA-256.
- La salida NO se inventa ni se precarga. Si falta, queda pendiente para aviso/corrección auditada.

## n8n / gerencia
La Edge Function `vch-gerencia-report` está desplegada. Si se define el secreto `VCH_N8N_WEBHOOK_URL` en Supabase, enviará un JSON diario a n8n para correo, documentación, Drive/Slack u otros destinos.

## File Manager
Subir la carpeta completa a `public_html/vch-jornada/` y abrir `https://masterlaw.cl/vch-jornada/`.

## Primer supervisor
Crear/usar un usuario Supabase Auth y asociar su `user_id` en `vch_supervisores`. El sistema no permite autoasignarse como supervisor.
