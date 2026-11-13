// Logica pura del piano dei pasti (piano/pasti.json): nessun accesso a rete o archivi, così si testa facilmente.
// Come per la lista della spesa, ogni modifica è un'operazione che si riapplica sull'ultima versione presente su GitHub.

export type Momento = 'colazione' | 'pranzo' | 'cena'
export const MOMENTI: Momento[] = ['colazione', 'pranzo', 'cena']

export interface Pasto {
  id: string
  /** giorno, "2026-11-16" */
  data: string
  momento: Momento
  /** ricetta del ricettario; null per un pasto scritto a mano ("pizza fuori", "avanzi") */
  ricetta: string | null
  /** titolo della ricetta al momento della scelta, o il testo scritto a mano */
  titolo: string
  porzioni: number | null
  /** giorno in cui si fa la spesa per questo pasto (gli ingredienti sono già in lista); null = non ancora */
  spesa_il: string | null
  /** promemoria già fatti, es. "congela:salmone" */
  fatti: string[]
  aggiunto_da: string
}

export interface Piano {
  pasti: Pasto[]
  aggiornato_il: string
  ops_applicate?: string[]
}

export type PastoNuovo = Omit<Pasto, 'aggiunto_da' | 'spesa_il' | 'fatti'>

export type Operazione = { id: string; autore: string } & (
  | { tipo: 'aggiungi'; pasto: PastoNuovo }
  | { tipo: 'modifica'; pasto: string; campi: Partial<Pick<Pasto, 'data' | 'momento' | 'porzioni' | 'titolo'>> }
  | { tipo: 'elimina'; pasto: string }
  /** gli ingredienti di questi pasti sono andati in lista, per la spesa di quel giorno (null = tolto il segno) */
  | { tipo: 'in_lista'; pasti: string[]; spesa_il: string | null }
  | { tipo: 'fatto'; pasto: string; promemoria: string; valore: boolean }
)

/** I pasti più vecchi di così si tolgono dal file, per tenerlo piccolo. */
const GIORNI_STORICO = 60

const copia = <T>(x: T): T => JSON.parse(JSON.stringify(x))

export const pianoVuoto = (): Piano => ({ pasti: [], aggiornato_il: new Date(0).toISOString(), ops_applicate: [] })

export function applica(partenza: Piano, op: Operazione): Piano {
  const piano: Piano = copia(partenza)
  piano.ops_applicate ??= []
  if (piano.ops_applicate.includes(op.id)) return piano
  const trova = (id: string) => piano.pasti.find((p) => p.id === id)

  switch (op.tipo) {
    case 'aggiungi':
      if (!trova(op.pasto.id) && op.pasto.titolo.trim()) {
        piano.pasti.push({ ...copia(op.pasto), titolo: op.pasto.titolo.trim(), spesa_il: null, fatti: [], aggiunto_da: op.autore })
      }
      piano.pasti = piano.pasti.filter((p) => p.data >= aggiungiGiorni(oggi(), -GIORNI_STORICO))
      break
    case 'modifica': {
      const p = trova(op.pasto)
      if (p) {
        // un pasto spostato di giorno ha promemoria diversi
        if (op.campi.data && op.campi.data !== p.data) p.fatti = []
        Object.assign(p, copia(op.campi))
      }
      break
    }
    case 'elimina':
      piano.pasti = piano.pasti.filter((p) => p.id !== op.pasto)
      break
    case 'in_lista':
      for (const id of op.pasti) {
        const p = trova(id)
        if (p) p.spesa_il = op.spesa_il
      }
      break
    case 'fatto': {
      const p = trova(op.pasto)
      if (p) p.fatti = op.valore ? [...new Set([...p.fatti, op.promemoria])] : p.fatti.filter((f) => f !== op.promemoria)
      break
    }
  }
  piano.ops_applicate = [...piano.ops_applicate, op.id].slice(-200)
  piano.aggiornato_il = new Date().toISOString()
  return piano
}

export const applicaTutte = (piano: Piano, ops: Operazione[]) => ops.reduce(applica, piano)

/** Pasti in ordine: per giorno e poi colazione, pranzo, cena. */
export function ordina(pasti: Pasto[]): Pasto[] {
  return [...pasti].sort((a, b) => a.data.localeCompare(b.data) || MOMENTI.indexOf(a.momento) - MOMENTI.indexOf(b.momento))
}

/** Pasti con ricetta tra dal e al (compresi) i cui ingredienti non sono ancora andati in lista. */
export function pastiDaComprare(pasti: Pasto[], dal: string, al: string): Pasto[] {
  return ordina(pasti.filter((p) => p.ricetta && !p.spesa_il && p.data >= dal && p.data <= al))
}

// --- date: sempre giorni locali "AAAA-MM-GG", senza ore né fusi ---

const due = (n: number) => String(n).padStart(2, '0')
export const comeData = (d: Date) => `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}`
export const oggi = () => comeData(new Date())

function daData(s: string): Date {
  const [a, m, g] = s.split('-').map(Number)
  return new Date(a!, m! - 1, g!, 12)
}

export function aggiungiGiorni(data: string, n: number): string {
  const d = daData(data)
  d.setDate(d.getDate() + n)
  return comeData(d)
}

/** Giorni da "da" ad "a" (positivo se "a" viene dopo). */
export const giorniTra = (da: string, a: string) => Math.round((daData(a).getTime() - daData(da).getTime()) / 86_400_000)

const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato']
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']

export const nomeGiorno = (data: string) => GIORNI[daData(data).getDay()]!

/** Prossima domenica (oggi stesso se è domenica). */
export const fineSettimana = (da: string) => aggiungiGiorni(da, (7 - daData(da).getDay()) % 7)

/** "Oggi", "Domani", "Lunedì 16 nov". */
export function titoloGiorno(data: string, rispetto = oggi()): string {
  const diff = giorniTra(rispetto, data)
  if (diff === 0) return 'Oggi'
  if (diff === 1) return 'Domani'
  if (diff === -1) return 'Ieri'
  const d = daData(data)
  const nome = nomeGiorno(data)
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} ${d.getDate()} ${MESI[d.getMonth()]}`
}

/** "Oggi", "Domani", "Lun 16": per i pulsanti piccoli. */
export function giornoBreve(data: string, rispetto = oggi()): string {
  const diff = giorniTra(rispetto, data)
  if (diff === 0) return 'Oggi'
  if (diff === 1) return 'Domani'
  const nome = nomeGiorno(data)
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1, 3)} ${daData(data).getDate()}`
}

/** "oggi", "domani", "sabato" (entro una settimana), "lunedì 24 nov". */
export function quandoBreve(data: string, rispetto = oggi()): string {
  const diff = giorniTra(rispetto, data)
  if (diff === 0) return 'oggi'
  if (diff === 1) return 'domani'
  if (diff === -1) return 'ieri'
  if (diff > 1 && diff < 7) return nomeGiorno(data)
  return titoloGiorno(data, rispetto).toLowerCase()
}

/** "domani a cena", "sabato a pranzo", "oggi a colazione". */
export const quandoPasto = (p: Pick<Pasto, 'data' | 'momento'>, rispetto = oggi()) => `${quandoBreve(p.data, rispetto)} a ${p.momento}`
