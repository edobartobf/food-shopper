# Dispensa: decisioni di progetto

App per Edoardo e la sua compagna: un ricettario condiviso che si alimenta da link, testo e screenshot,
e da cui si genera la lista della spesa condivisa. Decisioni prese l'8/11/2026.

## Vincoli
- Nessun server da mantenere, costo zero o quasi, dati sotto il proprio controllo.
- Uso: due persone, due telefoni Android.
- Edoardo non tocca il codice: le scelte tecniche sono di Claude, la verifica si fa con ricette vere.

## Architettura

```
 Telefono (PWA "Dispensa")                      GitHub, account edobartobf
┌──────────────────────────┐   API REST      ┌──────────────────────────────────────┐
│ ricettario, lista spesa  │ ──────────────▶ │ food-shopper-data (PRIVATO)          │
│ menu "Condividi" Android │  file JSON      │   ricette/<id>.json                  │
│ copia offline (IndexedDB)│                 │   spesa/attuale.json                 │
└──────────────────────────┘                 │   importazioni/<id>.json  (coda)     │
          ▲                                  │   allegati/<id>-<n>.<ext>            │
          │ GitHub Pages                     │   config.json  (reparti)             │
┌──────────────────────────┐                 │   .github/workflows/importa.yml      │
│ food-shopper (PUBBLICO)  │                 │     push su importazioni/** → AI     │
│ solo codice, nessun dato │                 │     → commit ricette/<id>.json       │
└──────────────────────────┘                 └──────────────────────────────────────┘
```

- **Due repo**: `food-shopper` pubblico (codice, pubblicato su `edobartobf.github.io/food-shopper`),
  `food-shopper-data` privato (dati, Action di import, segreto `ANTHROPIC_API_KEY`).
  Pages da repo privato richiederebbe GitHub Pro, per questo il codice è pubblico: non contiene nessun dato.
- **Accesso**: un solo token fine-grained dell'account `edobartobf`, limitato a `food-shopper-data`,
  permesso *Contents: read and write*. Si inserisce una volta per telefono con un link di configurazione
  (token nel frammento `#`, che non viene mai inviato a nessun server). Selettore "Chi sei?" che firma i commit.
- **Import**: l'app scrive `importazioni/<id>.json` (più eventuali screenshot in `allegati/`). Il push con il token
  personale fa partire la Action, che estrae la ricetta, scrive `ricette/<id>.json` e cancella la richiesta
  (o la segna `errore` con il motivo). Niente `repository_dispatch`: la richiesta resta salvata anche se la Action fallisce.
- **Concorrenza**: ogni scrittura usa lo `sha` del file (scrittura condizionata). Su conflitto l'app riscarica,
  fonde voce per voce e riprova. La lista si ricontrolla ogni pochi secondi mentre è aperta.
- **Offline**: l'app tiene una copia in IndexedDB; le modifiche fatte senza rete vanno in coda e si inviano al ritorno.

## Limiti dei servizi (verificati a novembre 2026)
- API GitHub: 5.000 richieste/ora per token; le risposte 304 (richieste condizionate) non contano.
- Actions su repo privato, piano Free: 12 $/mese di calcolo inclusi (~2.000 minuti Linux). Senza metodo di
  pagamento, superata la quota si fermano senza addebiti. Un import dura circa un minuto.
- Claude Haiku 5.5: 0,10 $/M token in ingresso, 0,50 $/M in uscita, circa 0,001 $ a ricetta.
  Tetto di spesa impostato da Edoardo nella console Anthropic.
- GitHub Models non esiste più (ritirato il 30/7/2026). Gemini free: possibile alternativa, codice indipendente dal fornitore.

## Tecnologia
- Vue 3 + Vite + TypeScript, `vue-router` con hash (GitHub Pages non ha riscritture degli URL), `vite-plugin-pwa`
  con service worker personalizzato (serve per ricevere screenshot dal menu Condividi), `idb-keyval`.
- Più avanti: APK con Capacitor sullo stesso codice (notifiche a import finito, integrazione più nativa).
- Niente GSD: si lavora a tappe, un commit e un push per tappa.

## Prima versione (v1)
- **Ricettario**: aggiungere, modificare, cercare, filtrare per tag. Le ricette importate compaiono subito con
  l'etichetta "da ricontrollare" finché uno dei due non le conferma.
- **Import dal menu Condividi**: link, testo, screenshot.
  - Siti: dati strutturati schema.org `Recipe` dalla pagina; l'AI solo se mancano.
  - TikTok: didascalia e sottotitoli automatici del parlato letti dalla pagina pubblica del video (`yt-dlp` chiede
    il login, la pagina no), poi l'AI. I sottotitoli coprono anche molte ricette "solo parlate".
  - Instagram: didascalia con `yt-dlp`, senza login né cookie (a novembre 2026 funziona anche dai server di GitHub).
    Se Instagram blocca, la richiesta va in errore e l'app propone di riprovare o di incollare testo o screenshot.
  - Un link già importato apre la ricetta esistente.
- **Ingredienti normalizzati all'import**: tutto in italiano (anche da fonti in inglese), link originale conservato,
  unità metriche (g, ml, pz, cucchiaio, cucchiaino), nessuna conversione tra unità diverse ("200 g + 2 cucchiai"),
  ingredienti q.b. nella sezione "Controlla in dispensa", reparto da una lista fissa riordinabile.
- **Lista della spesa**: una sola lista attiva. Le ricette scelte, con le porzioni, si sommano a quello che c'è già.
  Voci libere, modifica, spunta, "Svuota spuntati". Funziona offline. Si condivide come testo (es. WhatsApp).
- Nessuna notifica a import finito: la ricetta compare "in elaborazione" e si completa da sola.
- **Import bloccati**: se dopo 10 minuti dall'invio (o dall'ultimo Riprova, campo `inviata_il`) una richiesta non è
  finita né in errore, la Action si è fermata senza scriverlo: l'app la mostra come "Sembra bloccato" con Riprova e Togli.
- **Modalità cucina** ("Sto cucinando" nella ricetta): schermo sempre acceso (Screen Wake Lock, richiesto di nuovo
  quando si torna all'app) e spunte su ingredienti e passaggi. Le spunte restano finché l'app è aperta, non vanno su GitHub.

## Importatore
Il codice sta in questo repo, cartella `importatore/` (Python: `fonti.py` raccoglie il materiale, `estrazione.py`
chiama Claude Haiku 5.5 con output strutturato e corregge i risultati, `importa.py` elabora le richieste).
La Action `importa.yml` del repo dati lo scarica a ogni esecuzione e lo lancia con la chiave Anthropic.
Le ricette importate restano "da ricontrollare" finché uno dei due non le conferma.
Contro gli ingredienti persi: ogni ingrediente ha la sua sezione (`gruppo`: impasto, salsa…) e la frase della fonte
da cui viene (`origine`, mostrata nell'app finché la ricetta è da ricontrollare); ingredienti uguali di sezioni diverse
restano voci separate. `verifica.py` confronta senza AI le righe di ingredienti dei siti e le quantità delle didascalie
con il risultato: se manca qualcosa rifà l'estrazione una volta indicando cosa, e se manca ancora lo scrive nelle note.
Dosi mancanti: se la fonte non dà la quantità di un ingrediente da comprare, l'AI la stima per le porzioni
(`stimata: true`) e l'app la mostra come "≈ 300 g", anche nella lista della spesa. Il segno sparisce quando la
ricetta viene confermata o corretta. q.b. resta solo per sale, pepe, olio, spezie, erbe e guarnizioni.
Prova senza salvare: Actions del repo dati → "Importa ricette" → Run workflow con un link e un numero di ripetizioni.
Doppioni: si confronta il link condiviso e quello canonico (i link brevi di TikTok cambiano a ogni condivisione).

## Rimandato
Ricette solo parlate senza sottotitoli (Whisper), testo in sovrimpressione nei video, dispensa, pianificazione dei pasti,
foto ospitate da voi, notifiche (con l'APK), liste multiple, valori nutrizionali.

## Tappe
1. Repo, app di base installabile, menu Condividi, configurazione del token.
2. Ricettario (lettura, scrittura, ricerca, tag).
3. Import con l'AI (Action nel repo dati), provato sui link veri mandati da Edoardo.
4. Lista della spesa condivisa e offline.
5. (9/11) Provata sul telefono vero da Edoardo: installazione e menu Condividi funzionano. Poi import bloccati e
   modalità cucina.

## Formato dei dati

`ricette/<id>.json`
```json
{
  "id": "carbonara-k3x9",
  "titolo": "Spaghetti alla carbonara",
  "porzioni": 2,
  "tempo_minuti": 25,
  "tag": ["primi", "veloce"],
  "ingredienti": [
    { "nome": "spaghetti", "quantita": 200, "unita": "g", "reparto": "dispensa" },
    { "nome": "pepe nero", "quantita": null, "unita": null, "reparto": "dispensa", "qb": true }
  ],
  "passaggi": ["Cuoci la pasta…", "…"],
  "fonte": { "tipo": "tiktok", "url": "https://www.tiktok.com/@…" },
  "immagine_url": "https://…",
  "da_ricontrollare": true,
  "creata_da": "Edoardo",
  "creata_il": "2026-11-08T18:00:00Z",
  "modificata_il": "2026-11-08T18:00:00Z"
}
```

`importazioni/<id>.json`
```json
{
  "id": "imp-k3x9",
  "stato": "in_attesa",
  "url": "https://…",
  "testo": "testo condiviso o incollato",
  "allegati": ["allegati/imp-k3x9-1.jpg"],
  "creata_da": "Edoardo",
  "creata_il": "2026-11-08T18:00:00Z",
  "errore": null
}
```

`spesa/attuale.json`
```json
{
  "voci": [
    {
      "id": "v1",
      "nome": "spaghetti",
      "quantita": [{ "valore": 400, "unita": "g" }],
      "reparto": "dispensa",
      "qb": false,
      "spuntata": false,
      "da_ricette": ["carbonara-k3x9"],
      "aggiunta_da": "Edoardo"
    }
  ],
  "aggiornata_il": "2026-11-08T18:00:00Z",
  "ops_applicate": ["mh8k2x-4f9a"]
}
```

La lista si modifica solo per operazioni (aggiungi, spunta, modifica, elimina, svuota). Il telefono tiene in coda
quelle non ancora salvate e per salvarle le riapplica sull'ultima versione letta da GitHub; `ops_applicate`
(ultime 200) evita di applicarne una due volte. Le voci uguali si riconoscono dal nome (senza maiuscole e accenti),
le quantità si sommano per unità; kg si somma con g e l con ml, le altre unità restano separate.

`config.json`: `{ "reparti": ["frutta e verdura", "carne e pesce", "latticini e uova", "pane e forno", "dispensa", "surgelati", "bevande", "casa e igiene", "altro"] }`
