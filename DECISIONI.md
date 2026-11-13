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

## Foto e "Ci piace" (9/11)
Foto vostre al posto dei soli link: si scattano o si scelgono dalla galleria, il telefono le riduce (lato lungo
1280 px, JPEG 80%: sui 150–400 KB) e le carica nel repo dati in `foto/<id>.jpg`. Il repo è privato, quindi
l'app le scarica con il token e le tiene in IndexedDB: si vedono anche offline. Le foto dei prodotti "Ci piace" e
quelle delle voci in lista si scaricano in anticipo, perché servono al supermercato, spesso senza campo.
- **Foto del piatto**: campo `foto` della ricetta; se c'è prende il posto di `immagine_url`. Dalla pagina della
  ricetta si mette o si cambia senza confermarla (resta "da ricontrollare" se lo era).
- **Ci piace**: prodotti precisi (quel pesto, quella marca) con foto, nota e reparto, un file per prodotto.
  "🛒 In lista" li aggiunge alla spesa con foto e nota; anche scrivendo a mano lo stesso nome in lista la voce
  prende foto, nota e reparto del prodotto. In lista un tocco sulla miniatura apre la foto grande.
- Una foto tolta o sostituita, o di una ricetta o un prodotto eliminati, si cancella dal repo.
- Commit su `foto/` e `preferiti/` non fanno partire la Action di import (parte solo su `importazioni/**`).

## Settimana: piano dei pasti (13/11)
Un calendario condiviso: per ogni giorno colazione, pranzo e cena, con una o più ricette (con le porzioni) o una voce
scritta a mano ("pizza fuori", "avanzi") che serve solo a ricordare. Si apre dalla scheda **Settimana** o da una ricetta
("Mettila in settimana"). Le Impostazioni sono passate nel ⚙ in alto nelle Ricette, per lasciare la scheda alla Settimana.
- **Porzioni**: quelle che si scelgono quando si mette la ricetta nel giorno (di partenza 2). Niente gestione degli
  avanzi: scelta di Edoardo, ci si regola da soli.
- **Fai la spesa**: si sceglie quando si fa la spesa (oggi, domani, dopodomani) e per quanti giorni (2, 3, fino a domenica,
  una settimana, o fino a una data). Gli ingredienti dei pasti di quei giorni vanno in lista, sommati come sempre, e il
  pasto viene segnato "in lista" (`spesa_il`), così la volta dopo non si ricompra. Dal pasto si può togliere il segno.
- **Freschi**: una tabella fissa in `conservazione.ts` (non l'AI: vale subito per tutte le ricette e non costa) dice
  quanti giorni dura in frigo un fresco e se si può congelare (pesce 1 giorno, macinato 1, pollo e salsiccia 2, carne 3,
  burrata 3, mozzarella e ricotta 5, insalate ed erbe 3, frutti di bosco 2, pane 2…). Conserve, surgelati, salumi
  stagionati e reparti dispensa/surgelati non danno consigli. Se il pasto è più in là della durata:
  congelabile → "in congelatore appena torni dalla spesa" e "dal congelatore al frigo la sera prima" (pane e frutti di
  bosco: la mattina stessa); non congelabile → "da comprare più vicino al giorno" (cozze e vongole: "o surgelate").
  I consigli si vedono prima di mettere in lista e, dal giorno della spesa, nel riquadro "Da fare oggi" della Settimana,
  dove un tocco li segna come fatti (condiviso tra i telefoni). Senza notifiche finché non c'è l'APK.
- La lista e il piano usano lo stesso meccanismo di salvataggio (`sincronizzato.ts`): operazioni in coda, offline,
  riapplicate sull'ultima versione di GitHub. I pasti di più di 60 giorni fa si tolgono dal file.

## Carrello Conad (13/11)
- Prova a mano il 13/11 con 3 ricette: 15 prodotti su 16 trovati (manca il latte di cocco), 32 € nel Superstore di
  via Don Morisi (ritiro). Circa 12 minuti, di cui 4 per riempire il carrello una volta scelti i prodotti.
- Niente API pubblica: lo fa **Claude in Chrome** con la skill di progetto `.claude/skills/carrello-conad` (istruzioni
  + `conad.py`). Si lancia da una sessione Claude su edo-dev, con il Chrome di edo-dev collegato all'estensione
  (stesso account Claude dell'app). Claude non conferma l'ordine, non prenota la fascia e non paga.
- Le scelte si ricordano in `conad/abbinamenti.json` nel repo dati (voce della lista → prodotto Conad con link,
  confezione, nota), più le voci che online non ci sono. Dalla seconda spesa Claude sceglie solo le voci nuove.
- Regola di scelta: marca Conad o prezzo al kg più basso tra prodotti normali; la nota della voce vince.
- Nell'app l'unico segno è "non su Conad online" in lista, per sapere cosa prendere a parte.
- Cose viste: spesa minima 40 € (sotto c'è un supplemento); i freschi a peso hanno un minimo (salmone 600 g) e
  incrementi di 100 g; il server a volte risponde 503 ma il prodotto entra lo stesso; il motore di ricerca confonde
  parole simili ("tubetti" → "cubetti").

## Rimandato
Ricette solo parlate senza sottotitoli (Whisper), testo in sovrimpressione nei video, dispensa,
notifiche (con l'APK), liste multiple, valori nutrizionali. Carrello Conad lanciato dal telefono (oggi serve il
computer con Chrome).

## Tappe
1. Repo, app di base installabile, menu Condividi, configurazione del token.
2. Ricettario (lettura, scrittura, ricerca, tag).
3. Import con l'AI (Action nel repo dati), provato sui link veri mandati da Edoardo.
4. Lista della spesa condivisa e offline.
5. (9/11) Provata sul telefono vero da Edoardo: installazione e menu Condividi funzionano. Poi import bloccati e
   modalità cucina.
6. (9/11) Foto vostre: foto del piatto nelle ricette e sezione "Ci piace" con i prodotti da ricordare.
7. (13/11) Settimana: piano dei pasti, spesa per un periodo, consigli su congelatore e freschi.
8. (13/11) Carrello Conad: prova a mano riuscita, poi skill con abbinamenti ricordati.

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
  "foto": "foto/mh8k2x-4f9a.jpg",
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

Una voce aggiunta da "Ci piace" ha in più `"foto": "foto/<id>.jpg"` e la `nota` del prodotto.

`preferiti/<id>.json`
```json
{
  "id": "mh8k2x-4f9a",
  "nome": "Pesto Rana",
  "nota": "quello senza aglio, banco frigo",
  "reparto": "latticini e uova",
  "foto": "foto/mh8k3a-77qp.jpg",
  "creato_da": "Edoardo",
  "creato_il": "2026-11-09T18:00:00Z",
  "modificato_il": "2026-11-09T18:00:00Z"
}
```

`piano/pasti.json`
```json
{
  "pasti": [
    {
      "id": "mh8k2x-4f9a",
      "data": "2026-11-18",
      "momento": "cena",
      "ricetta": "salmone-ab12",
      "titolo": "Salmone in crosta di pistacchi",
      "porzioni": 2,
      "spesa_il": "2026-11-14",
      "fatti": ["congela:filetto di salmone"],
      "aggiunto_da": "Edoardo"
    }
  ],
  "aggiornato_il": "2026-11-13T18:00:00Z",
  "ops_applicate": ["mh8k2x-4f9a"]
}
```
`momento`: colazione, pranzo o cena. Un pasto scritto a mano ha `ricetta: null` e `porzioni: null`.

`conad/abbinamenti.json` (lo scrive Claude con `conad.py ricorda`; chiavi come `chiave()` di `lista.ts`)
```json
{
  "negozio": "Conad Superstore, via Don G. Morisi 3, Piacenza — Ordina e ritira",
  "regola": "Marca Conad o il prezzo al kg più basso…",
  "abbinamenti": {
    "filetto di salmone": { "nome": "filetto di salmone", "prodotto": "FILETTO DI SALMONE FRESCO ALLEVATO NORVEGIA",
      "url": "/p/filetto-di-salmone-fresco-allevato-norvegia--V_738190_C", "confezione": "minimo 600 g, poi +100 g",
      "peso_variabile": true, "nota": "facoltativa", "scelto_il": "2026-11-13" }
  },
  "non_online": { "latte di cocco": { "nome": "latte di cocco", "visto_il": "2026-11-13" } },
  "aggiornato_il": "2026-11-13T11:50:00+00:00"
}
```

`config.json`: `{ "reparti": ["frutta e verdura", "carne e pesce", "latticini e uova", "pane e forno", "dispensa", "surgelati", "bevande", "casa e igiene", "altro"] }`
