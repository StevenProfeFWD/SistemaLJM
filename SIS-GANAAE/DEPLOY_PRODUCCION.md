# Despliegue en producción — SIS-GANAAE

## Requisitos previos

1. Secretos fuertes en `.env` (no use los valores de ejemplo):
   - `JWT_SECRET` (≥ 32 caracteres aleatorios)
   - `COOKIE_ENCRYPTION_KEY` (≥ 32, distinto de JWT)
   - `FRONTEND_ORIGIN` = URL pública exacta del front (p. ej. `https://asistencias.liceomarti.ed.cr`)
   - `NODE_ENV=production`
2. Base de datos inicializada (scripts en `database/`, incluido `29_bd_jwt_revocacion.sql` y `30_bd_indices_rendimiento.sql`).
3. SMTP configurado si se requieren notificaciones.

## Levantar el stack

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

- Frontend (nginx): `http://localhost:8080` (o el dominio detrás del proxy TLS)
- API: solo red interna; el navegador llama `/api` vía nginx (misma origen → cookies `Secure` + `SameSite=Lax` correctas con HTTPS)

## HTTPS (obligatorio en internet público)

No termine TLS dentro de este compose. Use un reverse proxy delante:

### Opción A — Caddy (recomendado)

```caddyfile
asistencias.ejemplo.com {
  reverse_proxy localhost:8080
}
```

Caddy obtiene certificados Let's Encrypt automáticamente.

### Opción B — nginx / Traefik

Termine SSL en el proxy y reenvíe a `127.0.0.1:8080`. Asegure:

- `X-Forwarded-Proto: https`
- `FRONTEND_ORIGIN=https://asistencias.ejemplo.com`

Con `NODE_ENV=production` las cookies llevan `Secure=true` y solo viajan por HTTPS.

## Revocación de sesión (P2)

Al cerrar sesión, el `jti` del JWT se guarda en `jwt_revocado` hasta su fecha de expiración natural. Un token robado deja de ser válido de inmediato tras el logout, aunque aún no haya llegado `exp`.

## Healthchecks

`database`, `backend` y `frontend` exponen healthchecks en Compose. Espere a `healthy` antes de exponer el servicio.

## Actualizar

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

## Desarrollo local

Siga usando `docker compose up` (Vite + nodemon). No mezcle ambos stacks sobre los mismos nombres de contenedor a la vez.
