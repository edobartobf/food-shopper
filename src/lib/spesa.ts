// Lista della spesa (spesa/attuale.json) condivisa tra i telefoni: vedi sincronizzato.ts per come si salva.
import { documentoSincronizzato } from './sincronizzato'
import { applicaTutte, chiave, listaVuota, type Lista, type Operazione, type Voce, type VoceNuova } from './lista'

function descrivi(ops: Operazione[]): string {
  if (ops.length === 1) {
    const o = ops[0]!
    if (o.tipo === 'aggiungi') return o.voci.length === 1 ? `Spesa: aggiunto ${o.voci[0]!.nome}` : `Spesa: aggiunte ${o.voci.length} voci`
    if (o.tipo === 'spunta') return `Spesa: ${o.valore ? 'preso' : 'da prendere'} ${o.chiave}`
    if (o.tipo === 'svuota') return o.solo_spuntate ? 'Spesa: tolte le voci prese' : 'Spesa: lista svuotata'
    return `Spesa: ${o.tipo} ${o.chiave}`
  }
  return `Spesa: ${ops.length} modifiche`
}

const documento = documentoSincronizzato<Lista, Operazione>({
  percorso: 'spesa/attuale.json',
  chiaveLocale: 'spesa:stato',
  vuoto: listaVuota,
  applicaTutte,
  descrivi,
})

export const spesa = documento.stato
export const { vista, caricaLocale, sincronizza, avviaControllo, testoStato } = documento
const esegui = documento.esegui

// --- azioni usate dalle schermate ---

export const aggiungiVoci = (voci: VoceNuova[]) => voci.length && esegui({ tipo: 'aggiungi', voci })
const bersaglio = (v: Voce) => ({ voce: v.id, chiave: chiave(v.nome) })
export const spunta = (v: Voce, valore: boolean) => esegui({ tipo: 'spunta', valore, ...bersaglio(v) })
export const modificaVoce = (v: Voce, campi: Partial<Pick<Voce, 'nome' | 'quantita' | 'reparto' | 'qb' | 'nota' | 'stimata'>>) =>
  esegui({ tipo: 'modifica', campi, ...bersaglio(v) })
export const eliminaVoce = (v: Voce) => esegui({ tipo: 'elimina', ...bersaglio(v) })
export const svuota = (solo_spuntate: boolean) => esegui({ tipo: 'svuota', solo_spuntate })
