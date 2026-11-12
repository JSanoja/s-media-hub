# WU-10 · Calidad: tests, lint, logging, OpenAPI

**Fase:** Transversal · **Tamaño:** M · **Depende de:** WU-02 (se va completando con cada WU)

## Hallazgos que resuelve
A12.

## Tareas
- [ ] Tests con `node:test` + `supertest` sobre `createApp(config)` usando una biblioteca de prueba en `test/fixtures/` (videos de 1–2 s generados con `ffmpeg -f lavfi -i testsrc`).
  - browse/library, orden natural, cover faltante, Range 206, path traversal (WU-04), CORS headers, progreso.
- [ ] ESLint 9 + Prettier; `no-undef`, `no-implicit-globals`.
- [ ] TypeScript opcional en la API: al menos `// @ts-check` + JSDoc, o migrar a TS (Node 22.18+/24 ejecuta TS con type stripping).
- [ ] Logging estructurado con `pino` / `pino-http` (reemplaza `morgan` y los `console.log` sueltos).
- [ ] Especificación **OpenAPI 3.1** en `docs/openapi.yaml` + Swagger UI en `/api/docs` (solo dev).
- [ ] GitHub Actions: lint + test en Node 22 y 24.

## Criterios de aceptación
- [ ] `npm test` verde en CI.
- [ ] Cobertura de las rutas críticas (seguridad y streaming).
