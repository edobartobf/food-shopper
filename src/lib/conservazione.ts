// Quanto dura un ingrediente fresco dopo la spesa e cosa fare se il pasto è più in là:
// congelarlo appena si torna a casa e scongelarlo in tempo, oppure comprarlo più vicino al giorno.
//
// È una tabella fissa e prudente, non l'AI: vale subito per tutte le ricette (anche quelle scritte a mano)
// e non costa nulla. Copre solo i freschi che durano pochi giorni; tutto il resto non genera consigli.
import type { Ricetta } from './ricette'
import { chiave } from './lista'
import { aggiungiGiorni, giorniTra, quandoPasto, type Pasto } from './piano'

export interface Conservazione {
  /** giorni in frigo dopo la spesa senza problemi */
  giorni: number
  congelabile: boolean
  /** quando spostarlo dal congelatore: la sera prima (carne, pesce) o il giorno stesso (pane, frutti di bosco) */
  scongela: 'sera_prima' | 'stesso_giorno'
  /** "o surgelati": per cosa conviene comprare già surgelato */
  surgelato?: boolean
}

// Confezioni a lunga conservazione: niente consigli anche se il nome contiene "salmone", "pomodori"…
const CONSERVATI =
  /(surgelat|congelat|in scatola|affumicat|sott ?olio|sott ?aceto|salamoia|\bsecc(o|a|hi|he)\b|essiccat|in polvere|liofilizzat|pelati|passata|concentrato|barattolo|sciroppat|lunga conservazione|precott|wurstel|\bdado\b|\bbrodo\b|al naturale|grattugiat|stagionat|guancial|pancetta|prosciutto|speck|bresaola|salame|salami|mortadella|lardo|nduja|coppa|salumi|in cassetta|pan carre|carasau|grissini|pangrattato|fette biscottate)/

const REGOLE: Array<[RegExp, Conservazione]> = [
  // molluschi vivi: non si congelano crudi nel guscio
  [/\b(cozze|vongole|telline|ostriche|fasolari|cannolicchi)\b/, { giorni: 1, congelabile: false, scongela: 'sera_prima', surgelato: true }],
  [
    /\b(salmone|merluzzo|nasello|orata|orate|branzin[oi]|spigol[ae]|tonno fresco|trancio di tonno|tonno rosso|pesce spada|sgombr[oi]|alici|acciughe fresche|sardine|gamber[ie]?|gamberett[ie]|scampi|mazzancolle|calamar[ie]?|seppi[ae]|seppioline|polp[oi]|moscardini|totan[ie]|rana pescatrice|coda di rospo|sogliol[ae]|platessa|trot[ae]|cernia|dentice|ricciola|pesce)\b/,
    { giorni: 1, congelabile: true, scongela: 'sera_prima' },
  ],
  [/\b(macinat[aoie]|carne trita|fegat[oi]|frattaglie|hamburger|polpette)\b/, { giorni: 1, congelabile: true, scongela: 'sera_prima' }],
  [
    /\b(poll[oi]|tacchino|petto|petti|cosce|coscia|sovracosce|alette|anatra|faraona|coniglio|salsicc[ae]|salamella|luganega)\b/,
    { giorni: 2, congelabile: true, scongela: 'sera_prima' },
  ],
  [
    /\b(manzo|vitello|vitellone|maiale|suino|agnello|capretto|bistecc[ah]e?|fettin[ae]|spezzatino|arrosto|lonza|filett[oi]|controfiletto|costin[ae]|costolette|braciol[ae]|scaloppin[ae]|carpaccio|tagliata|entrecote|roast beef|scamone|girello|cotolett[ae]|involtini|tartare|ossobuc[oh]i?|carne)\b/,
    { giorni: 3, congelabile: true, scongela: 'sera_prima' },
  ],
  [/\b(burrata|stracciatella|bufala)\b/, { giorni: 3, congelabile: false, scongela: 'sera_prima' }],
  [/\b(ricotta|mozzarell[ae]|fior di latte|stracchino|crescenza|squacquerone)\b/, { giorni: 5, congelabile: false, scongela: 'sera_prima' }],
  [/\b(fragol[ae]|lamponi|mirtilli|more|ribes|frutti di bosco)\b/, { giorni: 2, congelabile: true, scongela: 'stesso_giorno' }],
  [
    /\b(rucola|songino|valeriana|insalata|lattuga|misticanza|spinaci|spinacini|germogli|basilico|prezzemolo|menta|erba cipollina|coriandolo)\b/,
    { giorni: 3, congelabile: false, scongela: 'sera_prima' },
  ],
  [/\b(funghi|champignon|porcini|chiodini|pioppini|finferli)\b/, { giorni: 3, congelabile: false, scongela: 'sera_prima' }],
  [/\b(asparagi|avocado)\b/, { giorni: 3, congelabile: false, scongela: 'sera_prima' }],
  [/\b(fagiolini|broccol[oi]|cime di rapa|cavolfiore|carciof[oi])\b/, { giorni: 4, congelabile: false, scongela: 'sera_prima' }],
  [/\b(zucchin[ae]|melanzan[ae])\b/, { giorni: 5, congelabile: false, scongela: 'sera_prima' }],
  [/^(pane|baguette|focacci[ae]|ciabatt[ae]|rosette|filone|pagnotta|panini)\b/, { giorni: 2, congelabile: true, scongela: 'stesso_giorno' }],
]

const SENZA_LIMITI = new Set(['surgelati', 'dispensa', 'bevande', 'casa e igiene'])

export function conservazione(nome: string, reparto: string): Conservazione | null {
  const n = chiave(nome).replace(/'/g, ' ')
  if (SENZA_LIMITI.has(reparto) || CONSERVATI.test(n)) return null
  for (const [re, c] of REGOLE) if (re.test(n)) return c
  // carne o pesce che la tabella non conosce: prudenza
  if (reparto === 'carne e pesce') return { giorni: 2, congelabile: true, scongela: 'sera_prima' }
  return null
}

// --- consigli per i pasti del piano ---

export type TipoConsiglio = 'congela' | 'scongela' | 'compra_dopo'

export interface Consiglio {
  pasto: Pasto
  ingrediente: string
  tipo: TipoConsiglio
  /** il giorno in cui va fatto */
  giorno: string
  /** chiave per segnarlo come fatto, es. "congela:salmone" */
  promemoria: string
  testo: string
}

const giorniTesto = (g: number) => (g === 1 ? '1 giorno' : `${g} giorni`)

/**
 * Consigli per un pasto la cui spesa si fa il giorno spesaIl.
 * Niente consigli per ingredienti q.b. (si suppone che ci siano già) o che arrivano in tempo.
 */
export function consigliPasto(pasto: Pasto, ricetta: Ricetta | undefined, spesaIl: string, rispetto?: string): Consiglio[] {
  if (!ricetta) return []
  const attesa = giorniTra(spesaIl, pasto.data)
  const quando = quandoPasto(pasto, rispetto)
  const visti = new Set<string>()
  const consigli: Consiglio[] = []
  for (const i of ricetta.ingredienti) {
    const k = chiave(i.nome)
    if (i.qb || !k || visti.has(k)) continue
    visti.add(k)
    const c = conservazione(i.nome, i.reparto)
    if (!c || attesa <= c.giorni) continue
    const base = { pasto, ingrediente: i.nome }
    if (c.congelabile) {
      consigli.push({
        ...base,
        tipo: 'congela',
        giorno: spesaIl,
        promemoria: `congela:${k}`,
        testo: `In congelatore appena torni dalla spesa: è per ${quando} e in frigo dura solo ${giorniTesto(c.giorni)}`,
      })
      const giornoScongela = c.scongela === 'sera_prima' ? aggiungiGiorni(pasto.data, -1) : pasto.data
      consigli.push({
        ...base,
        tipo: 'scongela',
        giorno: giornoScongela,
        promemoria: `scongela:${k}`,
        testo:
          c.scongela === 'sera_prima'
            ? `Dal congelatore al frigo la sera prima: è per ${quando}`
            : `Fuori dal congelatore la mattina: è per ${quando}`,
      })
    } else {
      consigli.push({
        ...base,
        tipo: 'compra_dopo',
        giorno: spesaIl,
        promemoria: `compra:${k}`,
        testo: `Da comprare più vicino al giorno${c.surgelato ? ' o surgelato' : ''}: è per ${quando} e dura circa ${giorniTesto(c.giorni)}`,
      })
    }
  }
  return consigli
}

/**
 * Promemoria da mostrare oggi: congelare quello che si è comprato (anche se ci si è dimenticati ieri,
 * finché il pasto non è passato) e spostare in frigo quello che serve domani.
 */
export function promemoriaDiOggi(pasti: Pasto[], ricette: Ricetta[], oggi: string): Consiglio[] {
  const perId = new Map(ricette.map((r) => [r.id, r]))
  return pasti
    .filter((p) => p.spesa_il && p.ricetta && p.data >= oggi && p.spesa_il <= oggi)
    .flatMap((p) => consigliPasto(p, perId.get(p.ricetta!), p.spesa_il!, oggi))
    .filter((c) => c.tipo !== 'compra_dopo' && c.giorno <= oggi && !c.pasto.fatti.includes(c.promemoria))
    .filter((c) => c.tipo === 'scongela' || c.pasto.data > oggi)
}
