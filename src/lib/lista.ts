import { unitaPerQuantita } from './unita'

// Logica pura della lista della spesa: nessun accesso a rete o archivi, così si testa facilmente.
//
// Ogni modifica è un'"operazione" (aggiungi, spunta, modifica, elimina, svuota). L'app tiene in coda le operazioni
// non ancora salvate e, per salvarle, le riapplica sull'ultima versione presente su GitHub: così due telefoni che
// modificano la lista insieme non si cancellano a vicenda le modifiche.

export interface Quantita {
  valore: number
  unita: string | null
}

export interface Voce {
  id: string
  nome: string
  quantita: Quantita[]
  reparto: string
  qb: boolean
  spuntata: boolean
  da_ricette: string[]
  aggiunta_da: string
  nota?: string
  /** almeno una dose viene da una ricetta che non la indicava */
  stimata?: boolean
}

export interface Lista {
  voci: Voce[]
  aggiornata_il: string
  /** id delle ultime operazioni applicate: evita di applicarne una due volte */
  ops_applicate?: string[]
}

export interface VoceNuova {
  nome: string
  quantita: Quantita[]
  reparto: string
  qb: boolean
  da_ricetta?: string
  stimata?: boolean
}

type Bersaglio = { voce: string; chiave: string }

export type Operazione = { id: string; autore: string } & (
  | { tipo: 'aggiungi'; voci: VoceNuova[] }
  | ({ tipo: 'spunta'; valore: boolean } & Bersaglio)
  | ({ tipo: 'modifica'; campi: Partial<Pick<Voce, 'nome' | 'quantita' | 'reparto' | 'qb' | 'nota' | 'stimata'>> } & Bersaglio)
  | ({ tipo: 'elimina' } & Bersaglio)
  | { tipo: 'svuota'; solo_spuntate: boolean }
)

/** Copia profonda (funziona anche sugli oggetti reattivi di Vue, a differenza di structuredClone) */
const copia = <T>(x: T): T => JSON.parse(JSON.stringify(x))

export const listaVuota = (): Lista => ({ voci: [], aggiornata_il: new Date(0).toISOString(), ops_applicate: [] })

/** "Pomodori  Pelati" e "pomodori pelati" sono la stessa voce. */
export const chiave = (nome: string) =>
  nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

const arrotonda = (n: number) => Math.round(n * 100) / 100

/** kg e l si sommano come g e ml; le altre unità restano separate (niente conversioni tra cucchiai e grammi). */
function base(q: Quantita): Quantita {
  if (q.unita === 'kg') return { valore: q.valore * 1000, unita: 'g' }
  if (q.unita === 'l') return { valore: q.valore * 1000, unita: 'ml' }
  return { valore: q.valore, unita: q.unita || null }
}

export function sommaQuantita(a: Quantita[], b: Quantita[]): Quantita[] {
  const risultato = a.map(base)
  for (const q of b.map(base)) {
    const uguale = risultato.find((r) => r.unita === q.unita)
    if (uguale) uguale.valore = arrotonda(uguale.valore + q.valore)
    else risultato.push({ valore: arrotonda(q.valore), unita: q.unita })
  }
  return risultato
}

export function formattaQuantitaVoce(v: Pick<Voce, 'quantita' | 'qb' | 'stimata'>): string {
  const parti = v.quantita.map((q) => {
    let { valore, unita } = q
    if (unita === 'g' && valore >= 1000) [valore, unita] = [valore / 1000, 'kg']
    if (unita === 'ml' && valore >= 1000) [valore, unita] = [valore / 1000, 'l']
    const n = arrotonda(valore).toLocaleString('it-IT', { maximumFractionDigits: 2 })
    return unita ? `${n} ${unitaPerQuantita(unita, arrotonda(valore))}` : n
  })
  if (v.qb && !parti.length) return 'q.b.'
  return v.stimata && parti.length ? `≈ ${parti.join(' + ')}` : parti.join(' + ')
}

function trova(lista: Lista, b: Bersaglio): Voce | undefined {
  return lista.voci.find((v) => v.id === b.voce) ?? lista.voci.find((v) => chiave(v.nome) === b.chiave)
}

/** Applica un'operazione e restituisce una lista nuova (quella di partenza non viene toccata). */
export function applica(partenza: Lista, op: Operazione): Lista {
  const lista: Lista = copia(partenza)
  lista.ops_applicate ??= []
  if (lista.ops_applicate.includes(op.id)) return lista

  switch (op.tipo) {
    case 'aggiungi':
      op.voci.forEach((n, i) => {
        if (!n.nome.trim()) return
        const esistente = lista.voci.find((v) => chiave(v.nome) === chiave(n.nome))
        if (esistente) {
          esistente.quantita = sommaQuantita(esistente.quantita, n.quantita)
          esistente.qb = esistente.qb || n.qb
          if (n.stimata && n.quantita.length) esistente.stimata = true
          esistente.spuntata = false
          if (n.da_ricetta && !esistente.da_ricette.includes(n.da_ricetta)) esistente.da_ricette.push(n.da_ricetta)
        } else {
          lista.voci.push({
            id: `${op.id}-${i}`,
            nome: n.nome.trim(),
            quantita: sommaQuantita([], n.quantita),
            reparto: n.reparto || 'altro',
            qb: n.qb,
            spuntata: false,
            da_ricette: n.da_ricetta ? [n.da_ricetta] : [],
            aggiunta_da: op.autore,
            ...(n.stimata && n.quantita.length ? { stimata: true } : {}),
          })
        }
      })
      break
    case 'spunta': {
      const v = trova(lista, op)
      if (v) v.spuntata = op.valore
      break
    }
    case 'modifica': {
      const v = trova(lista, op)
      if (v) Object.assign(v, copia(op.campi))
      break
    }
    case 'elimina': {
      const v = trova(lista, op)
      if (v) lista.voci = lista.voci.filter((x) => x !== v)
      break
    }
    case 'svuota':
      lista.voci = op.solo_spuntate ? lista.voci.filter((v) => !v.spuntata) : []
      break
  }
  lista.ops_applicate = [...lista.ops_applicate, op.id].slice(-200)
  lista.aggiornata_il = new Date().toISOString()
  return lista
}

export const applicaTutte = (lista: Lista, ops: Operazione[]) => ops.reduce(applica, lista)

// --- voci scritte a mano: "2 l latte", "latte 2 l", "500g farina", "pane" ---

const UNITA_RICONOSCIUTE: Record<string, string> = {
  g: 'g', gr: 'g', grammi: 'g', kg: 'kg', chili: 'kg', ml: 'ml', l: 'l', lt: 'l', litri: 'l', litro: 'l',
  pz: 'pz', pezzi: 'pz', confezione: 'confezione', confezioni: 'confezione', conf: 'confezione',
  cucchiaio: 'cucchiaio', cucchiai: 'cucchiaio', cucchiaino: 'cucchiaino', cucchiaini: 'cucchiaino',
}

const NUMERO = String.raw`(\d+(?:[.,]\d+)?)`
const UNITA_RE = String.raw`(?:\s*(${Object.keys(UNITA_RICONOSCIUTE).sort((a, b) => b.length - a.length).join('|')})\b)?`

export function leggiVoceLibera(testo: string): { nome: string; quantita: Quantita[] } {
  const t = testo.trim().replace(/\s+/g, ' ')
  const davanti = t.match(new RegExp(`^${NUMERO}${UNITA_RE}\\s+(?:di\\s+)?(.+)$`, 'i'))
  const dietro = t.match(new RegExp(`^(.+?)\\s+${NUMERO}${UNITA_RE}$`, 'i'))
  const [nome, num, unita] = davanti ? [davanti[3], davanti[1], davanti[2]] : dietro ? [dietro[1], dietro[2], dietro[3]] : [t, '', '']
  if (!num) return { nome: t, quantita: [] }
  return {
    nome: nome!.trim(),
    quantita: [{ valore: Number(num.replace(',', '.')), unita: unita ? UNITA_RICONOSCIUTE[unita.toLowerCase()]! : null }],
  }
}

/** "400 g + 2 cucchiai" → quantità; testo vuoto → nessuna quantità. */
export function leggiQuantita(testo: string): Quantita[] {
  return testo
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const m = p.match(new RegExp(`^${NUMERO}${UNITA_RE}`, 'i'))
      if (!m) return null
      const unita = m[2] ? UNITA_RICONOSCIUTE[m[2].toLowerCase()]! : p.slice(m[1]!.length).trim() || null
      return { valore: Number(m[1]!.replace(',', '.')), unita }
    })
    .filter((q): q is Quantita => q !== null)
}

// --- raggruppamento per la schermata e per il testo da condividere ---

export interface Gruppo {
  titolo: string
  voci: Voce[]
}

export const DISPENSA = 'Controlla in dispensa'
export const CARRELLO = 'Nel carrello'

export function raggruppa(voci: Voce[], reparti: string[]): Gruppo[] {
  const ordinaNome = (a: Voce, b: Voce) => a.nome.localeCompare(b.nome, 'it')
  const daComprare = voci.filter((v) => !v.spuntata)
  const soloQb = (v: Voce) => v.qb && !v.quantita.length
  const gruppi: Gruppo[] = []
  const noti = new Set(reparti)
  for (const r of reparti) {
    const g = daComprare.filter((v) => !soloQb(v) && (v.reparto === r || (r === 'altro' && !noti.has(v.reparto))))
    if (g.length) gruppi.push({ titolo: r, voci: g.sort(ordinaNome) })
  }
  if (!noti.has('altro')) {
    const sconosciuti = daComprare.filter((v) => !soloQb(v) && !noti.has(v.reparto))
    if (sconosciuti.length) gruppi.push({ titolo: 'altro', voci: sconosciuti.sort(ordinaNome) })
  }
  const qb = daComprare.filter(soloQb)
  if (qb.length) gruppi.push({ titolo: DISPENSA, voci: qb.sort(ordinaNome) })
  const presi = voci.filter((v) => v.spuntata)
  if (presi.length) gruppi.push({ titolo: CARRELLO, voci: presi.sort(ordinaNome) })
  return gruppi
}

export function testoDaCondividere(voci: Voce[], reparti: string[]): string {
  const righe: string[] = ['🛒 Lista della spesa']
  for (const g of raggruppa(voci, reparti)) {
    if (g.titolo === CARRELLO) continue
    righe.push('', g.titolo.charAt(0).toUpperCase() + g.titolo.slice(1))
    for (const v of g.voci) {
      const q = g.titolo === DISPENSA ? '' : formattaQuantitaVoce(v)
      righe.push(`• ${v.nome}${q ? ` — ${q}` : ''}${v.nota ? ` (${v.nota})` : ''}`)
    }
  }
  if (righe.length === 1) righe.push('', 'La lista è vuota.')
  return righe.join('\n')
}
