# MASTERLAW · módulo web de Paños

Este directorio es **staging del frontend**. No reemplaza Supabase ni el API.

## Destino en File Manager

Copiar el contenido de `web-panos/` a:

`public_html/panos/`

Resultado esperado:

- `/panos/` → resumen operativo y financiero
- `/panos/panos.html` → listado maestro
- `/panos/investigacion.html` → cola de investigación
- `/panos/vendidos.html` → ventas, GMV, comisiones, facturación y cobro
- `/panos/documentos.html` → selector de expedientes/documentos
- `/panos/historial.html` → selector de historial/auditoría
- `/panos/pano.html?id=134` → ficha integral de un paño

## Jerarquía de la ficha

PAÑO → PREDIOS → PROPIETARIOS → INVESTIGACIÓN → DOCUMENTOS → VENTA → HISTORIAL

## Fuentes

- Operación: Supabase
- Documentos y respaldo: Google Drive
- API privada: `https://masterlaw-api.vercel.app/api/panos`
- Frontend ejecutable: File Manager / `masterlaw.cl/panos/`

## Autenticación

Las páginas reutilizan el JWT privado de MASTERLAW desde `localStorage`/`sessionStorage`. Se reconocen las claves `masterlaw_token`, `token`, `jwt`, `auth_token` y `ml_token`. Si no existe sesión, se dirige al login de MASTERLAW.

## Seguridad

El frontend no contiene `service_role`, claves Supabase ni secretos. Todas las lecturas sensibles pasan por el API autenticado. El menú oficial se registra en `public.ml_web_paginas` y `public.ml_web_menu_panos`.

## Regla financiera vigente

MASTERLAW recibe el **50% del fee pool total**. La UI diferencia precio confirmado de precio referencial y no convierte automáticamente referencias históricas en precio final.
