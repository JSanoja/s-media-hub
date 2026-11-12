# WU-13 · (Opcional) Castear desde el celular / Custom Web Receiver

**Fase:** 4 · Extra · **Tamaño:** L · **Depende de:** WU-07 (HTTPS)

## Contexto
Con la decisión de 2026-10-21 (app propia en el Chromecast), castear desde el celular pasa a ser un extra. Requiere **HTTPS** (Cast Web Sender exige contexto seguro y el Custom Web Receiver se hospeda en HTTPS) y registro en Google Cast SDK Developer Console (US$5).

## Tareas (si se hace)
- [ ] Pasar a HTTPS (WU-07: `PROTOCOL=https`, dominio + Let's Encrypt).
- [ ] Botón de Cast en la interfaz web cuando se abre desde Chrome del celular/PC (Default Media Receiver primero).
- [ ] (Opcional) Custom Web Receiver con la estética de S-HUB.
