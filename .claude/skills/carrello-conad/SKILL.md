---
name: carrello-conad
description: Riempie il carrello di spesaonline.conad.it (ritiro in negozio) con la lista della spesa della Dispensa, usando Claude in Chrome e gli abbinamenti voce→prodotto già scelti. Usala quando Edoardo chiede di preparare/riempire il carrello Conad, fare la spesa online, o cambiare un prodotto scelto per una voce ("per il pollo prendi quello a fette").
---

# Carrello Conad dalla lista della Dispensa

Obiettivo: carrello pronto da controllare. **Mai** confermare l'ordine, prenotare la fascia oraria, pagare o inserire
password: quelle cose le fa Edoardo. Il carrello vive nel suo account Conad e si vede anche dall'app Conad sul telefono.

Lo script `conad.py` (in questa cartella) legge e scrive il repo dati con `gh api`:
- `python3 .claude/skills/carrello-conad/conad.py lista` → voci non spuntate con l'abbinamento salvato (`abbinamento`),
  il segno `non_online`, le voci q.b. saltate, il negozio e la regola di scelta.
- `python3 .claude/skills/carrello-conad/conad.py ricorda FILE.json` → salva scelte nuove o corrette (formato nel docstring).
- `python3 .claude/skills/carrello-conad/conad.py mostra` → tutti gli abbinamenti.

Gli abbinamenti stanno in `conad/abbinamenti.json` nel repo dati; l'app li usa per segnare in lista le voci che
online non ci sono.

## Passi

1. **Lista.** Lancia `conad.py lista`. Se `da_comprare` è vuoto, dillo e fermati.
2. **Chrome.** Segui la skill `chrome-browser` (carica gli strumenti in una sola ToolSearch, includendo
   `javascript_tool`, `get_page_text`, `find`, `list_connected_browsers`). Se `list_connected_browsers` è vuoto: Chrome
   su edo-dev (profilo con l'estensione Claude) deve essere aperto e l'estensione collegata con **lo stesso account
   Claude di questa app**; dillo a Edoardo e aspetta. Lavora in una scheda nuova.
3. **Sito.** Apri `https://spesaonline.conad.it/home`. Banner dei cookie → "Rifiuta tutti i cookie".
   - In alto deve esserci "Ritiro" e il punto di ritiro del campo `negozio`. Se manca o è un altro: indirizzo del
     negozio nel campo "Il tuo indirizzo" → scegli il suggerimento → Verifica → "Ordina e ritira" → scegli il negozio
     → "Conferma il negozio".
   - Se non è entrato nell'account (icona utente senza "Ciao …"), chiedi a Edoardo di entrare lui.
   - **Carrello non vuoto** (pulsante in alto con un totale): chiedi se aggiungere sopra o se vuole svuotarlo lui prima.
     Non svuotarlo di tua iniziativa.
4. **Quantità.** Raggruppa le voci con lo stesso `url`. Per ogni prodotto decidi quanti pezzi servono confrontando la
   quantità in lista con `confezione`: frazioni ("0,5 pz", "0,25 tazza", "1 spicchio") = una confezione; grammi o
   millilitri = confezioni che coprono il totale, meglio un po' di più. Prodotti a peso (`peso_variabile`): il primo
   "Aggiungi" mette il minimo, ogni "+" aggiunge l'incremento scritto in `confezione`. Le voci `stimata` hanno dosi
   indovinate: una confezione basta quasi sempre.
5. **Voci con abbinamento.** Apri `https://spesaonline.conad.it` + `url` e lancia l'aiuto **AGGIUNGI** qui sotto con
   il numero di clic. Se la pagina non c'è più o il prodotto non è disponibile, cerca un'alternativa come al passo 6 e
   mettila tra i dubbi.
6. **Voci senza abbinamento.** Cerca con `https://spesaonline.conad.it/search?query=<parole>` e leggi con
   `get_page_text` (nome, formato, prezzo al kg, offerte). Prova 2-3 ricerche diverse se la prima è fuori tema (il
   motore confonde: "tubetti" → "cubetti"). Scegli con la `regola`; se la voce ha una `nota` (es. "marca Rana") vince
   la nota. Il link del prodotto lo prendi con `javascript_tool`:
   `[...document.querySelectorAll('main a[href*="/p/"]')].map(a => [a.innerText.split('\n')[0], new URL(a.href).pathname])`.
   Poi passo 5. Se non c'è niente di adatto: "non trovato".
7. **Voci `non_online`.** Saltale e mettile in "da prendere a parte". Se `visto_il` ha più di 30 giorni, fai una
   ricerca veloce: il catalogo cambia.
8. **Controllo.** Apri il riepilogo con il pulsante del carrello in alto e lancia l'aiuto **CARRELLO**: ogni prodotto
   previsto deve esserci, con i pezzi giusti.
9. **Ricorda.** Scrivi in un file della scratchpad le scelte nuove (`abbinamenti`, con `prodotto`, `url`, `confezione`,
   `peso_variabile`, `nota` se serve) e le voci non trovate (`non_online`), poi `conad.py ricorda FILE`. Usa come nome
   la voce come appare in lista. Non salvare abbinamenti per nomi generici ("pasta", "formaggio"): valgono una volta sola.
10. **Riassunto** a Edoardo, in quest'ordine:
    - **Nel carrello**: tabella prodotto · pezzi · prezzo (offerte segnate).
    - **Dubbi**: dove la scelta non era ovvia, perché.
    - **Da prendere a parte**: non trovati e `non_online`.
    - **Saltate (q.b.)**: le voci `qb_saltate`, da aggiungere se mancano in casa.
    - Totale del carrello. Sotto i **40 €** di spesa minima si paga un supplemento: dillo.
    - Ricordagli che ordine, fascia oraria e pagamento sono suoi.
    Chiudi la scheda che hai aperto.

Se Edoardo poi corregge ("il salmone prendilo surgelato"), cambia il carrello e aggiorna l'abbinamento con `ricorda`.

## Aiuti JavaScript (con `javascript_tool`, nella pagina)

**AGGIUNGI** — sulla pagina di un prodotto; cambia `CLIC` (1 = "Aggiungi", poi ogni clic in più è un "+"):

```js
await (async (CLIC) => {
  const m = document.querySelector('main')
  const titolo = m?.querySelector('h1')?.textContent.trim()
  if (!titolo) return { errore: 'pagina prodotto non trovata' }
  const simili = [...m.querySelectorAll('h2,h3')].find((e) => /simili/i.test(e.textContent))
  const prima = (b) => !simili || b.compareDocumentPosition(simili) & Node.DOCUMENT_POSITION_FOLLOWING
  const btn = (t) => [...m.querySelectorAll('button')].find((b) => prima(b) && b.offsetParent && b.textContent.trim() === t)
  const stato = () => btn('+')?.parentElement?.innerText.replace(/\s+/g, ' ') ?? null
  // durante l'aggiornamento il riquadro mostra "- +" senza numero: si aspetta un numero nuovo
  const aspetta = async (prima) => { for (let i = 0; i < 30; i++) { const s = stato(); if (s && s !== prima && /\d/.test(s)) return; await new Promise((r) => setTimeout(r, 300)) } }
  const iniziale = stato()
  let fatti = 0
  if (btn('Aggiungi')) { btn('Aggiungi').click(); fatti++; await aspetta(null) }
  else if (!btn('+')) return { titolo, errore: 'non disponibile: né Aggiungi né +' }
  while (fatti < CLIC) { const s = stato(); btn('+').click(); fatti++; await aspetta(s) }
  await new Promise((r) => setTimeout(r, 800)) // il totale in alto arriva un attimo dopo
  return { titolo, era: iniziale, ora: stato(), carrello: document.querySelector('button[aria-label^="Carrello"]')?.getAttribute('aria-label') }
})(1)
```

`era` diverso da null vuol dire che il prodotto era già nel carrello e hai aggiunto sopra. Il server a volte risponde
503 ma il prodotto entra lo stesso: guarda `ora` e il totale prima di riprovare.

**CARRELLO** — con il riepilogo aperto (clic sul pulsante del carrello in alto):

```js
(() => {
  const h = [...document.querySelectorAll('h1,h2,h3')].find((e) => e.textContent.trim() === 'Il tuo carrello')
  if (!h) return 'apri prima il riepilogo del carrello'
  let c = h
  for (let i = 0; i < 6; i++) { c = c.parentElement; if (c.innerText.length > 800) break }
  const righe = {}
  c.querySelectorAll('a[href*="/p/"]').forEach((a) => { const t = a.innerText.trim(); if (t) righe[new URL(a.href).pathname] = t.replace(/\n/g, ' · ') })
  return { totale: document.querySelector('button[aria-label^="Carrello"]')?.getAttribute('aria-label'), righe }
})()
```
