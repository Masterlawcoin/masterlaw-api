# MASTERLAW hotfix 2026-09-21

## Hallazgo verificado
El repositorio `Masterlawcoin/masterlaw-api` no contiene actualmente los archivos PHP de produccion:
- `masterlaw-core/api/index.php`
- `bandeja/index.html`
- `bandeja/bandeja-api.php`
- `admin/index.html`
- `broker/index.html`
- `cliente/index.html`

Por eso los cambios preparados fuera de GitHub no aparecian en el repositorio.

## Error actual
El mensaje **"Control temporal no disponible"** se origina cuando el RPC `ml_core_rate_limit` falla y el PHP corta el login con HTTP 503 antes de validar credenciales.

## Cambio propuesto
Aplicar el parche `hotfixes/2026-09-21-login-rate-limit.patch` sobre el `masterlaw-core/api/index.php` real de V23.9.

El cambio es deliberadamente acotado:
- fail-open solo para rutas de login cuando el RPC de rate-limit esta temporalmente caido;
- el login sigue validando contraseña/identidad en Supabase;
- todas las demas rutas conservan fail-closed;
- no cambia contraseñas, usuarios, roles ni datos.

## Pendiente estructural
Versionar en un repositorio privado la fuente PHP real de MASTERLAW (Bandeja/Admin/Broker/Cliente/Core) antes de seguir aplicando hotfixes de produccion.
