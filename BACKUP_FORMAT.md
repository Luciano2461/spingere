# Formato del backup di Spingere

File JSON (UTF-8) prodotto da **Backup e ripristino → Esporta** e letto da **Importa**. È il formato di scambio previsto anche con la futura app iOS nativa (Swift): per questo è versionato e documentato. Il codice di riferimento è `src/domain/backup.ts` (costruzione, validazione, importazione) e `src/db/backup.ts` (lettura/scrittura del database).

- Nome file: `spingere-backup-AAAA-MM-GG.json`
- Versione attuale del formato (`schemaVersion`): **2**
- Convenzioni: ID = stringhe (UUID, oppure `b:<slug>` per gli esercizi inclusi nell'app e `c:<uuid>` per quelli personalizzati); date in ISO 8601 in UTC (`2026-10-14T10:00:00.000Z`; un file con un altro fuso, es. `+02:00`, viene convertito in UTC all'importazione); pesi in **kg**; durate in **secondi**; distanze in **km**.

## Struttura

```json
{
  "format": "spingere-backup",
  "schemaVersion": 2,
  "exportedAt": "2026-10-14T12:00:00.000Z",
  "app": { "name": "Spingere", "version": "0.1.0" },
  "data": {
    "plans": [],
    "sessions": [],
    "customExercises": [],
    "aliases": [],
    "imageChoices": [],
    "photos": [],
    "settings": {}
  }
}
```

| Campo | Contenuto |
|---|---|
| `format` | Sempre `"spingere-backup"`. Un file con altro valore viene rifiutato. |
| `schemaVersion` | Intero ≥ 1. Più alto della versione dell'app → rifiutato con invito ad aggiornare; più basso → migrato al volo (vedi sotto). |
| `exportedAt`, `app` | Informativi. |
| `data.plans` | Schede (`Plan`). |
| `data.sessions` | **Solo allenamenti conclusi** (`status: "done"`). L'allenamento in corso e il suo timer di recupero (`rest`) non vengono mai esportati. |
| `data.customExercises` | Solo esercizi personalizzati (`source: "custom"`, id `c:…`). Gli esercizi inclusi nell'app **non** sono nel backup: si ritrovano con l'ID stabile `b:<slug>`. |
| `data.aliases` | Nomi alternativi scelti dall'utente per un esercizio. |
| `data.imageChoices` | Immagine scelta dall'utente per un esercizio. |
| `data.photos` | Foto personali, in base64. |
| `data.settings` | Impostazioni (senza `id` né `lastBackupAt`, che sono locali al dispositivo). |

## Oggetti

### Plan (scheda)
```json
{ "id": "…", "name": "Scheda A", "notes": "", "createdAt": "…", "updatedAt": "…",
  "days": [ { "id": "…", "name": "Push",
    "groups": [ { "id": "…", "kind": "superset" | "circuit", "restAfterGroup": 90 } ],
    "exercises": [ { "exerciseId": "b:barbell-bench-press-medium-grip", "nameSnapshot": "Panca piana…",
      "targetSets": 3, "targetReps": 10, "targetSeconds": 30, "targetWeight": 60,
      "restSeconds": 90, "notes": "", "groupId": "…" } ] } ] }
```
L'ordine dell'array `exercises` è l'ordine di esecuzione. Gli esercizi con lo stesso `groupId` sono contigui (superserie/circuito); `restSeconds` negli esercizi di un gruppo non è usato (conta `restAfterGroup`). `targetReps` / `targetSeconds` / `targetWeight` sono opzionali a seconda del tipo di esercizio.

### Session (allenamento concluso)
```json
{ "id": "…", "planName": "Scheda A", "dayName": "Push", "startedAt": "…", "endedAt": "…", "updatedAt": "…",
  "status": "done", "notes": "",
  "groups": [ { "id": "…", "kind": "superset", "restAfterGroup": 90 } ],
  "entries": [ { "exerciseId": "b:…", "nameSnapshot": "Panca piana…", "type": "weight_reps",
    "groupId": "…", "restSeconds": 90,
    "sets": [ { "kind": "normal", "weight": 60, "reps": 10, "done": true, "doneAt": "…" } ] } ] }
```
**La sessione è una copia autonoma**: non contiene riferimenti a schede o a esercizi modificabili (solo `exerciseId` per collegare le statistiche, più il nome copiato in `nameSnapshot`). `planName`/`dayName` sono testi, non ID. Modificare o eliminare una scheda non cambia lo storico.

`updatedAt` (opzionale): ultima modifica dell'allenamento concluso, cioè la fine o una correzione successiva dal calendario. Serve all'unione dei backup per tenere la versione più recente; se manca vale `endedAt` (altrimenti `startedAt`). Nessun cambio di versione schema: il campo è opzionale e i file senza restano validi.

Serie (`SetLog`): `kind` ∈ `normal | warmup | drop | failure` (il riscaldamento è escluso da volume e record); campi opzionali `weight` (kg; negativo = assistenza), `reps`, `seconds`, `distance`, `rpe`, `rir`, `doneAt`; `done` booleano. Nel backup le serie sono tutte `done: true` (le non completate non vengono registrate alla conclusione).

Tipi di esercizio (`type`): `weight_reps` (carico × ripetizioni), `bodyweight` (corpo libero), `weighted_bodyweight` (zavorra o assistenza, kg anche negativi), `timed` (a tempo), `cardio` (tempo e distanza).

### Exercise personalizzato
```json
{ "id": "c:…", "source": "custom", "name": "…", "type": "weight_reps", "equipment": "other",
  "primaryMuscles": ["chest"], "secondaryMuscles": [], "images": [], "photoId": "…" }
```
Campo opzionale `deleted: true`: l'esercizio personalizzato è stato «eliminato» dall'utente, cioè nascosto dalle ricerche ma conservato (storico, schede e record continuano a riferirsi al suo `id` e al nome salvato). Chi legge il backup deve mantenerlo, non cancellarlo. Nessun cambio di versione schema: il campo è opzionale.

Muscoli e attrezzi usano le chiavi inglesi di free-exercise-db (`chest`, `lats`, `barbell`, `body only`, …).

### Alias, ImageChoice, Photo
```json
{ "id": "…", "exerciseId": "b:…", "text": "panca del lunedì" }
{ "exerciseId": "b:…", "kind": "builtin", "path": "altro-esercizio/0.webp" }
{ "exerciseId": "b:…", "kind": "photo", "photoId": "…" }
{ "id": "…", "exerciseId": "b:…", "mime": "image/jpeg", "data": "<base64>" }
```
- `ImageChoice` con `kind: "builtin"` indica un'immagine inclusa nell'app (`path` relativo a `exercises/`); con `kind: "photo"`, `photoId` rimanda a una voce di `photos`. Una scelta «foto» senza la foto corrispondente viene ignorata in importazione.
- Le foto sono ridimensionate a 800 px (JPEG) e codificate in base64 **senza** prefisso `data:`.

### Settings
`increments` (numeri), `defaultRestSeconds`, `backupReminderDays` (0 = mai), `theme` (`system|light|dark`), `restSound` (opzionale, assente = sì), `restSoundStyle` (opzionale, `classic|gong|triple`, assente = `classic`), `restVolume` (opzionale, `low|medium|high`, assente = `high`), `restCountdown` (opzionale, assente = sì), `restIgnoreSilent` (opzionale, assente = no), `weightStep` (opzionale, assente = 2,5). Un valore non valido di questi campi viene trattato come assente.

## Importazione

1. Il file viene letto e validato: JSON, `format`, `schemaVersion`, struttura di ogni elenco. Un file non valido viene rifiutato **senza modificare nulla**, con un messaggio che dice cosa non va.
   Gli allenamenti vengono anche normalizzati: `status` sempre `"done"` (mai un secondo allenamento in corso), date in UTC, `endedAt` mancante = `startedAt`, `groups` e `notes` mancanti = vuoti, `kind` sconosciuto = `normal`, campi numerici delle serie non validi tolti, `rest` tolto. Un `startedAt` che non è una data rende il file non valido.
2. Se `schemaVersion` è inferiore all'attuale, i dati passano per le migrazioni in catena (`src/domain/migrations.ts`: `MIGRATIONS[n]` porta da n a n+1).
3. Due modalità, con anteprima dei numeri prima di confermare:
   - **Unisci** (predefinita): aggiunge ciò che manca. Una scheda o un allenamento con lo stesso `id` vengono aggiornati solo se quelli del file hanno `updatedAt` più recente (per gli allenamenti vedi sopra; l'allenamento in corso sul dispositivo non viene mai toccato); nomi, immagini scelte, foto ed esercizi personalizzati già presenti (stesso `id`) non si toccano; le impostazioni locali restano. È idempotente: importare lo stesso file due volte non cambia nulla.
   - **Sostituisci tutto**: cancella schede, allenamenti, esercizi personalizzati, nomi, immagini e foto del dispositivo e importa il file, impostazioni comprese (quelle mancanti nel file prendono il valore predefinito). Non è ammessa se c'è un allenamento in corso. Richiede conferma.
4. Tutte le scritture avvengono in un'unica transazione: o riesce tutto o non cambia niente.

## Storia delle versioni

| `schemaVersion` | Novità |
|---|---|
| 1 | Schema iniziale interno (schede, allenamenti, esercizi, foto, impostazioni). Nessun backup è mai stato esportato in questa versione. |
| 2 | Aggiunti `aliases` (nomi personali) e `imageChoices` (immagine scelta). Migrazione 1→2: aggiunge i due elenchi vuoti. |

## Per chi implementa un lettore (es. Swift)
- Ignorare i campi sconosciuti; trattare come opzionali quelli indicati come tali.
- Non assumere che gli esercizi `b:…` siano nel file: vanno risolti con il proprio database esercizi (stessi ID). Gli esercizi `c:…` sono invece completi nel file.
- Mostrare sempre il nome di `nameSnapshot` per lo storico, non quello attuale dell'esercizio.
- Ogni modifica incompatibile aumenta `schemaVersion` e va accompagnata da una migrazione e da una nuova riga nella tabella qui sopra.
