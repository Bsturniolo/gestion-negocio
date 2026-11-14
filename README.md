# Gestión del Negocio

Versión para el celular: https://bsturniolo.github.io/gestion-negocio/

App para manejar stock, proveedores, cobros, gastos, inversión, balance mensual/anual y un calendario de deudas y préstamos. Funciona en Windows (instalador) y en el celular (app web instalable), con los datos sincronizados por Firebase.

## Estructura
- `app/` — la app (HTML/CSS/JS sin framework). Es lo mismo en PC y celular.
- `app/config.js` — configuración de Firebase del negocio.
- `src/cloud.js` — capa de sincronización (Firebase Auth + Firestore). Se empaqueta en `app/cloud.js`.
- `main.js`, `preload.js` — envoltorio de escritorio (Electron) y respaldo automático en Documentos.
- `firestore.rules` — reglas: cada usuario solo ve sus datos (`users/{uid}/...`).

## Comandos
```
npm install
npm start               # abrir la app de escritorio
npm run build:cloud     # reempaquetar src/cloud.js
npm run dist:win        # instalador de Windows (en Linux necesita wine)
npx firebase-tools deploy --only hosting,firestore:rules   # publicar versión web
```
