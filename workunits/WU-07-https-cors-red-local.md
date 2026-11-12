# WU-07 · HTTPS en la LAN, CORS y Range para Cast

**Fase:** 2 · API · **Tamaño:** M · **Depende de:** WU-05, WU-00

> **Decisión 2026-10-21:** por ahora la API corre en esta PC y todo se comunica por **HTTP plano a `IP:puerto` de la LAN**. Alcance actual de este WU: IP fija, `HOST=0.0.0.0`, `PUBLIC_BASE_URL=http://IP:PORT`, firewall (perfil Privado), **CORS** y **Range**. La parte de HTTPS/dominio/certificados queda **diferida** y se retoma solo si se necesita el Custom Web Receiver o castear desde el celular sin flags. Ver "Impacto de la decisión" en `../CLAUDE.md` (raíz del proyecto, fuera del repo).

## Por qué
- El **Cast Web Sender SDK** solo funciona en orígenes seguros (HTTPS o `localhost`) → para usarlo desde el celular hace falta HTTPS.
- El **Custom Web Receiver** debe estar en HTTPS; si carga medios por `http://`, Chrome los auto-upgradea a HTTPS y los bloquea si falla.
- El Chromecast **no confía en CAs propias** (mkcert no sirve) y no resuelve `localhost`.

## Opción recomendada
Dominio propio (ej. `flix.tudominio.com`) con registro **A → IP local fija de la PC** (ej. `192.168.0.50`) y certificado **Let's Encrypt por DNS-01** (Cloudflare/otro DNS con API). Renovación automática con:
- **Caddy** como reverse proxy delante de Node (más simple: TLS + renovación + HTTP/2), o
- `acme.sh`/`certbot` + `https.createServer` en Node.

> Algunos routers bloquean respuestas DNS con IPs privadas ("DNS rebinding protection"); si pasa, agregar excepción para el dominio o usar DNS del router.

## Tareas
- [ ] Reservar IP fija para la PC en el router (DHCP reservation).
- [ ] Configurar dominio + certificado (o la alternativa elegida en WU-00).
- [ ] Servir API, sender y receiver por HTTPS (mismo host, distintos paths: `/`, `/receiver/`, `/api/v1`, `/media`).
- [ ] **CORS** en `/media/*`, subtítulos e imágenes:
  - `Access-Control-Allow-Origin`: origen del receiver (o `*` para medios en LAN).
  - `Access-Control-Allow-Headers: Range, Content-Type`
  - `Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges`
  - Responder `OPTIONS` (preflight).
- [ ] Verificar Range (206) a través del proxy.
- [ ] Regla de firewall de Windows para el puerto (solo perfil "Privado").
- [ ] Health check: `https://<host>/api/v1/health` accesible desde el celular por Wi-Fi.

## Prueba de humo (Hito 1)
Desde Chrome en la PC, abrir una página mínima con el Cast SDK y el **Default Media Receiver** (`chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID`) y castear `streamUrl` de un MP4 H.264. Si reproduce y se puede adelantar (seek), red + HTTPS + CORS + Range están OK.

## Criterios de aceptación
- [ ] Certificado válido sin advertencias en Chrome de la PC y del celular.
- [ ] Un MP4 se reproduce en el Chromecast y el seek funciona.

> **Avance 2026-10-21:**
> - ✅ CORS + Range (hechos en WU-05). ✅ `.env`: `HOST=0.0.0.0`, `PUBLIC_HOST=192.168.1.5`, `PORT=30001`.
> - La API corre dentro de **WSL2**. Estaba en modo NAT (la LAN no llega a WSL) → decisión: **modo mirrored** + regla de firewall **Hyper-V** (`New-NetFirewallHyperVRule ... -LocalPorts 30001`) en lugar de la regla de firewall clásica de Windows. Alternativa descartada: `netsh portproxy` (la IP de WSL cambia en cada reinicio).
> - ⏳ Falta: aplicar mirrored + firewall, reserva DHCP de 192.168.1.5 en el router, y probar desde el celular y el Chromecast.
> - ✅ 2026-10-21: mirrored + firewall Hyper-V aplicados; desde el celular (192.168.1.6) responde `http://192.168.1.5:30001/api/v1/library`. Causa del último bloqueo: `HOST=localhost` en el `.env` → corregido a `0.0.0.0`.
