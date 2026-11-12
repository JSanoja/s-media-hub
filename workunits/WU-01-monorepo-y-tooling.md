# WU-01 · Monorepo, Node LTS y tooling base

**Fase:** 1 · Base · **Tamaño:** S · **Depende de:** —

## Contexto
Hoy hay dos repos separados (`JSanoja/api-js-browser`, `JSanoja/js-brwoser` — este último con typo en el nombre). El front nuevo se compone de 2 apps (sender + receiver) que comparten el contrato de la API: conviene un monorepo.

## Tareas
- [x] Crear repo `s-hub` (o renombrar `api-js-browser` y conservar historial con `git mv` a `apps/api`).
- [x] Estructura con npm workspaces:
  ```
  s-hub/
  ├─ apps/api/        ← código actual migrado
  ├─ apps/sender/     ← WU-11
  ├─ apps/receiver/   ← WU-12
  ├─ packages/shared/ ← tipos del contrato (TS) / JSON Schema
  ├─ docs/
  └─ package.json     ← "workspaces": ["apps/*", "packages/*"]
  ```
- [x] Fijar Node: `.nvmrc` = `24` (LTS activo); `"engines": { "node": ">=22.12" }` (tu PC tiene 22.23, compatible). Corregir el "recomendado v25" del README (versión impar, no LTS).
- [x] `.editorconfig`, `.gitignore` raíz (`node_modules`, `.env`, `cache/`, `dist/`, certificados).
- [x] Prettier + ESLint 9 (flat config) a nivel raíz.
- [x] Scripts raíz: `dev`, `build`, `test`, `lint` que delegan en los workspaces.
- [ ] Archivar `js-brwoser` en GitHub al terminar WU-15.

## Criterios de aceptación
- [x] `npm install` en la raíz instala todo; `npm run dev -w apps/api` levanta la API actual sin cambios funcionales.
- [x] Historial de git de la API preservado.

> **Estado:** ✅ hecho 2026-10-21. Repo nuevo `s-hub` (rama `main`), API importada en `apps/api` con historial (merge `-s ours` + `read-tree`). Los repos viejos quedaron en su lugar e ignorados por git porque Windows no permitió moverlos.

> **Actualización 2026-10-21:** el monorepo se movió a `D:\AI - FOLDER\s-hub\s-hub` para no mezclarlo con los proyectos viejos, que quedan al lado en `api-js-browser/` y `js-brwoser/`.
