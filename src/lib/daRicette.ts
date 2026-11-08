import type { VoceNuova } from './lista'
import type { Ricetta } from './ricette'

/** Ingredienti di una ricetta, scalati alle porzioni scelte, pronti per la lista. */
export function vociDaRicetta(r: Ricetta, porzioni: number): VoceNuova[] {
  const fattore = porzioni / (r.porzioni || 1)
  return r.ingredienti
    .filter((i) => i.nome.trim())
    .map((i) => {
      const senzaQuantita = i.qb || i.quantita == null
      return {
        nome: i.nome,
        quantita: senzaQuantita ? [] : [{ valore: Math.round(i.quantita! * fattore * 100) / 100, unita: i.unita }],
        reparto: i.reparto,
        qb: senzaQuantita,
        da_ricetta: r.id,
        stimata: !senzaQuantita && !!i.stimata,
      }
    })
}
