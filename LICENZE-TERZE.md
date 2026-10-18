# Licenze di terze parti

Elenco di librerie e asset inclusi o usati in sviluppo. Aggiornare a ogni aggiunta (anche con `/aggiorna`).
Le licenze vanno confermate sul file `LICENSE` di ciascun pacchetto in `node_modules/` prima della pubblicazione.

| Componente | Uso | Licenza (attesa) |
|---|---|---|
| Svelte | UI (bundle) | MIT |
| Dexie | IndexedDB (bundle) | Apache-2.0 |
| SortableJS | trascinamento per riordinare esercizi (bundle) | MIT |
| read-excel-file 9.3.12 (+ saxen, fflate, worker-f, unzipper-esm) | lettura dei file .xlsx per l'import schede, caricata solo quando serve (bundle, ~17 KB gz) | MIT (tutte, verificato su `package.json` dei pacchetti) |
| pdfjs-dist 4.10.38 (build «legacy») | lettura del testo dei PDF per l'import schede, caricata solo quando serve (bundle: libreria ~110 KB gz + worker ~1,4 MB, nel precache per l'uso offline) | Apache-2.0 (verificato su `package.json`) |
| Workbox (via vite-plugin-pwa) | Service worker (bundle) | MIT |
| Vite, @sveltejs/vite-plugin-svelte, vite-plugin-pwa | build (dev) | MIT |
| Vitest, fake-indexeddb, TypeScript, svelte-check | test/check (dev) | MIT / Apache-2.0 |
| free-exercise-db (github.com/yuhonas/free-exercise-db) | elenco di 876 esercizi, muscoli, attrezzi e 1746 immagini, convertite in WebP 400 px (`scripts/build-exercises.mjs`) | Unlicense (pubblico dominio). Il README indica che deriva da wrkout/exercises.json, anch'esso di pubblico dominio. Istruzioni inglesi non incluse. |
| sharp (dev) | conversione immagini in fase di build, non distribuita nell'app | Apache-2.0 (con libvips LGPL-3.0 nei binari nativi, solo in sviluppo) |
| Traduzioni italiane dei nomi (`data/translations.it.json`) | nomi esercizi in italiano | originali del progetto |
| Icone PWA e schermate di avvio | generate da `scripts/make-icons.mjs` (solo forme SVG, nessun font), disegno originale | proprie del progetto |

Da aggiungere più avanti: Tesseract.js e dati lingua `ita`. (SheetJS non usato: il pacchetto `xlsx` su npm è fermo a una versione con vulnerabilità note; per l'XLSX si usa read-excel-file. Il CSV si legge con un parser proprio.) (Grafici: SVG propri, nessuna libreria.)
