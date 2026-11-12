# WU-00 · Decisiones: modelo de Chromecast y estrategia de cast

**Fase:** 0 · Decidir · **Tamaño:** S · **Depende de:** —

## Objetivo
Cerrar las decisiones que cambian el diseño de todo lo demás, antes de escribir código de front.

## Preguntas a responder
1. **¿Qué dispositivo es?**
   - Chromecast clásico (2ª/3ª gen, Ultra) → solo receiver; la navegación ocurre en el sender.
   - Chromecast con Google TV / Google TV Streamer → además corre apps Android TV y tiene control remoto (habilita WU-13).
2. **¿Desde dónde vas a navegar la biblioteca?** Chrome en la PC, Chrome en Android, ambos. (iOS no soporta Cast Web Sender.)
3. **¿Receiver propio o default?**
   | Opción | Pros | Contras |
   |---|---|---|
   | **Default Media Receiver** | Cero registro, cero hosting, funciona ya | UI genérica, sin branding ni overlays |
   | **Styled Media Receiver** | Solo CSS propio | Registro en la consola, poca personalización |
   | **Custom Web Receiver (CAF)** ✅ recomendado como meta | UI propia, cola, "siguiente episodio", lógica propia | Registro (US$5), hosting HTTPS, registrar el serial del dispositivo para pruebas |
4. **¿Cómo se resuelve HTTPS en la LAN?** (detalle en WU-07)
   - Dominio propio + certificado Let's Encrypt por DNS-01 apuntando a la IP local (recomendado).
   - Tailscale (`tailscale serve`) con certificado `*.ts.net` — requiere Tailscale en la PC; el Chromecast no lo tiene, así que solo sirve si se expone con Funnel.
   - mkcert/CA propia → **no sirve** para el Chromecast (no se pueden instalar CAs en el dispositivo).
5. **¿Dónde viven los videos?** Ruta real en disco (ej. `D:\Videos\Series`) → define `MEDIA_ROOT`.
6. **Formatos predominantes en la biblioteca** (mp4/mkv, H.264/HEVC, audio AAC/AC3) → define el alcance de WU-08.

## Recomendación por defecto
Empezar con **Default Media Receiver** para el Hito 1 (valida red/formatos en horas), y pasar a **Custom Web Receiver** en el Hito 2.

## Entregable
- `docs/decisiones.md` (ADR corto) con las respuestas y la fecha.

## Criterios de aceptación
- [ ] Modelo de dispositivo y número de serie anotados.
- [ ] Estrategia de receiver y de HTTPS elegidas.
- [ ] `MEDIA_ROOT` definido.
