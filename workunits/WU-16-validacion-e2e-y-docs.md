# WU-16 · Validación end-to-end en el Chromecast real y documentación

**Fase:** 4 · Cierre · **Tamaño:** S · **Depende de:** todos

## Checklist de validación (en la TV)
- [ ] Castear desde Chrome de la PC y desde Chrome Android.
- [ ] MP4 H.264, MKV remuxeado, archivo con audio AC3, archivo con subtítulos.
- [ ] Seek adelante/atrás, pausa larga (>10 min) y reanudar.
- [ ] Retomar progreso, marcar visto al 90 %, autoplay del siguiente cruzando temporada.
- [ ] Celular bloqueado durante la reproducción → el progreso se sigue guardando.
- [ ] PC reiniciada → servicio arriba (WU-14).
- [ ] Certificado renovado automáticamente (simular/forzar renovación).

## Documentación
- [ ] README raíz: qué es, arquitectura, cómo correr en dev, cómo instalar en la PC.
- [ ] `docs/chromecast.md`: registro en la Cast Console, serial, App ID, debugging.
- [ ] `docs/red-https.md`: dominio, DNS, certificados, firewall.
- [ ] `docs/biblioteca.md`: convención de carpetas/nombres (`Serie/Temporada 1/S01E01 - Título.mp4`, `cover.jpg`, `*.es.srt`).
- [ ] `docs/openapi.yaml` actualizado.

## Criterios de aceptación
- [ ] Todo el checklist en verde y documentado.
