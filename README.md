# S-HUB

Biblioteca de videos local: una API Node que sirve tus series/películas desde la PC y una app propia para el **Chromecast with Google TV**.

## Estructura

```
apps/api        API Express (migrada desde api-js-browser, con su historial de git)
apps/tv         Front nuevo: interfaz web para TV, control remoto (WU-11)
apps/android-tv App Android TV: WebView + reproductor Media3 (WU-12)
packages/shared Contrato compartido
docs/           Documentación
workunits/      Plan de trabajo (WU-00 … WU-16)
```

## Requisitos

- Node **>= 22.13** (recomendado 24 LTS, ver `.nvmrc`)
- npm 10+

## Uso

```bash
npm install          # instala todos los workspaces
npm run dev          # levanta la API con recarga
npm start            # API en modo normal
npm run lint         # ESLint en todo el repo
npm run format       # Prettier
```

La red (protocolo, IP, puerto) se configura por variables de entorno; ver `../CLAUDE.md` (raíz del proyecto, fuera del repo) → "Todo parametrizable".
