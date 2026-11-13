// Piano dei pasti (piano/pasti.json) condiviso tra i telefoni: vedi sincronizzato.ts per come si salva.
import { nuovoId } from './condivisi'
import { documentoSincronizzato } from './sincronizzato'
import { applicaTutte, pianoVuoto, type Momento, type Operazione, type Pasto, type Piano } from './piano'

function descrivi(ops: Operazione[]): string {
  if (ops.length === 1) {
    const o = ops[0]!
    if (o.tipo === 'aggiungi') return `Piano: ${o.pasto.titolo} ${o.pasto.data} ${o.pasto.momento}`
    if (o.tipo === 'in_lista') return o.spesa_il ? `Piano: ${o.pasti.length} pasti in lista per la spesa del ${o.spesa_il}` : 'Piano: tolto il segno "in lista"'
    if (o.tipo === 'fatto') return `Piano: ${o.valore ? 'fatto' : 'da fare'} ${o.promemoria}`
    return `Piano: ${o.tipo} ${o.pasto}`
  }
  return `Piano: ${ops.length} modifiche`
}

const documento = documentoSincronizzato<Piano, Operazione>({
  percorso: 'piano/pasti.json',
  chiaveLocale: 'piano:stato',
  vuoto: pianoVuoto,
  applicaTutte,
  descrivi,
})

export const piano = documento.stato
export const { vista, caricaLocale, sincronizza, avviaControllo, testoStato } = documento
const esegui = documento.esegui

// --- azioni usate dalle schermate ---

export function aggiungiPasto(p: { data: string; momento: Momento; ricetta: string | null; titolo: string; porzioni: number | null }) {
  esegui({ tipo: 'aggiungi', pasto: { id: nuovoId(), ...p } })
}
export const modificaPasto = (p: Pasto, campi: Partial<Pick<Pasto, 'data' | 'momento' | 'porzioni' | 'titolo'>>) =>
  esegui({ tipo: 'modifica', pasto: p.id, campi })
export const eliminaPasto = (p: Pasto) => esegui({ tipo: 'elimina', pasto: p.id })
export const segnaInLista = (pasti: Pasto[], spesa_il: string | null) =>
  pasti.length && esegui({ tipo: 'in_lista', pasti: pasti.map((p) => p.id), spesa_il })
export const segnaFatto = (p: Pasto, promemoria: string, valore: boolean) => esegui({ tipo: 'fatto', pasto: p.id, promemoria, valore })
