# Spingere

Diario degli allenamenti in palestra per iPhone: una web app installabile (PWA), in italiano, che funziona **offline** e tiene **tutti i dati sul telefono** (IndexedDB). Niente server, account, tracciamento o API esterne.

- App: https://luciano2461.github.io/spingere/
- Come installarla: [INSTALLAZIONE.md](INSTALLAZIONE.md)
- Formato del file di backup: [BACKUP_FORMAT.md](BACKUP_FORMAT.md)
- Licenze di librerie e dati usati: [LICENZE-TERZE.md](LICENZE-TERZE.md)

## Cosa fa

Schede personali (create a mano o importate da CSV, Excel, PDF), registrazione delle serie con recupero a tempo, superserie e circuiti, storico con calendario, record personali, grafici di progressione, mappa dei muscoli allenati, esercizi personalizzati con foto, backup e ripristino in JSON.

## Sviluppo

Richiede Node.js LTS.

```bash
npm install
npm run dev        # sviluppo
npm test           # test (Vitest)
npm run check      # controllo dei tipi
npm run build      # build in dist/ (servita sotto /spingere/)
npm run preview    # anteprima della build
```

Stack: Svelte 5, TypeScript, Vite, Dexie (IndexedDB), vite-plugin-pwa. Grafici e mappa dei muscoli in SVG propri.

Il database degli esercizi deriva da [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (vedi `LICENZE-TERZE.md`); `npm run icons` rigenera icone e schermate di avvio.
