import { describe, expect, it } from 'vitest'
import {
  applica,
  applicaTutte,
  chiave,
  CARRELLO,
  DISPENSA,
  formattaQuantitaVoce,
  leggiQuantita,
  leggiVoceLibera,
  listaVuota,
  raggruppa,
  sommaQuantita,
  testoDaCondividere,
  type Operazione,
} from '../src/lib/lista'

const REPARTI = ['frutta e verdura', 'latticini e uova', 'dispensa', 'altro']
let n = 0
const op = (o: Record<string, unknown>) => ({ id: `op${++n}`, autore: 'Edo', ...o }) as Operazione
const aggiungi = (...voci: Array<[string, number | null, string | null, string?, boolean?]>) =>
  op({
    tipo: 'aggiungi',
    voci: voci.map(([nome, valore, unita, reparto = 'dispensa', qb = false]) => ({
      nome,
      quantita: valore == null ? [] : [{ valore, unita }],
      reparto,
      qb,
    })),
  })

describe('somme', () => {
  it('somma la stessa unità e tiene separate unità diverse', () => {
    expect(sommaQuantita([{ valore: 200, unita: 'g' }], [{ valore: 300, unita: 'g' }, { valore: 2, unita: 'cucchiaio' }])).toEqual([
      { valore: 500, unita: 'g' },
      { valore: 2, unita: 'cucchiaio' },
    ])
  })
  it('kg con g e l con ml', () => {
    expect(sommaQuantita([{ valore: 1, unita: 'kg' }], [{ valore: 200, unita: 'g' }])).toEqual([{ valore: 1200, unita: 'g' }])
    expect(formattaQuantitaVoce({ quantita: [{ valore: 1200, unita: 'g' }], qb: false })).toBe('1,2 kg')
    expect(formattaQuantitaVoce({ quantita: [{ valore: 500, unita: 'ml' }, { valore: 1, unita: 'cucchiaio' }], qb: false })).toBe(
      '500 ml + 1 cucchiaio',
    )
  })
})

describe('operazioni', () => {
  it('aggiungere due ricette somma gli ingredienti uguali', () => {
    const l = applicaTutte(listaVuota(), [
      aggiungi(['Spaghetti', 200, 'g'], ['sale', null, null, 'dispensa', true]),
      aggiungi(['spaghetti ', 160, 'g'], ['Sale', null, null, 'dispensa', true]),
    ])
    expect(l.voci).toHaveLength(2)
    expect(l.voci.find((v) => chiave(v.nome) === 'spaghetti')!.quantita).toEqual([{ valore: 360, unita: 'g' }])
  })
  it('riaggiungere una voce già spuntata la rimette da comprare', () => {
    const a = aggiungi(['latte', 1, 'l', 'latticini e uova'])
    let l = applica(listaVuota(), a)
    l = applica(l, op({ tipo: 'spunta', voce: l.voci[0]!.id, chiave: 'latte', valore: true }))
    l = applica(l, aggiungi(['Latte', 500, 'ml', 'latticini e uova']))
    expect(l.voci[0]).toMatchObject({ spuntata: false, quantita: [{ valore: 1500, unita: 'ml' }] })
  })
  it('una operazione applicata due volte conta una volta sola', () => {
    const a = aggiungi(['uova', 6, 'pz', 'latticini e uova'])
    const l = applicaTutte(listaVuota(), [a, a])
    expect(l.voci[0]!.quantita).toEqual([{ valore: 6, unita: 'pz' }])
  })
  it('modifiche fatte su due telefoni si uniscono', () => {
    const iniziale = applica(listaVuota(), aggiungi(['pane', null, null, 'altro'], ['mele', 4, 'pz', 'frutta e verdura']))
    // telefono A spunta il pane, telefono B intanto aggiunge il latte: B salva per primo
    const daB = aggiungi(['latte', 1, 'l', 'latticini e uova'])
    const daA = op({ tipo: 'spunta', voce: iniziale.voci[0]!.id, chiave: 'pane', valore: true })
    const remotoDopoB = applica(iniziale, daB)
    // A riapplica la sua coda sulla versione di B
    const finale = applica(remotoDopoB, daA)
    expect(finale.voci.map((v) => [v.nome, v.spuntata])).toEqual([
      ['pane', true],
      ['mele', false],
      ['latte', false],
    ])
  })
  it('trova la voce per nome se l’id non c’è (voce creata offline e unita a una esistente)', () => {
    const remoto = applica(listaVuota(), aggiungi(['burro', 100, 'g']))
    const l = applica(remoto, op({ tipo: 'elimina', voce: 'id-che-non-esiste', chiave: 'burro' }))
    expect(l.voci).toEqual([])
  })
  it('svuota solo le spuntate', () => {
    let l = applica(listaVuota(), aggiungi(['a', 1, null], ['b', 1, null]))
    l = applica(l, op({ tipo: 'spunta', voce: l.voci[0]!.id, chiave: 'a', valore: true }))
    l = applica(l, op({ tipo: 'svuota', solo_spuntate: true }))
    expect(l.voci.map((v) => v.nome)).toEqual(['b'])
  })
  it('non modifica la lista di partenza', () => {
    const vuota = listaVuota()
    applica(vuota, aggiungi(['x', 1, null]))
    expect(vuota.voci).toEqual([])
  })
})

describe('voci scritte a mano', () => {
  it.each([
    ['2 l latte', 'latte', [{ valore: 2, unita: 'l' }]],
    ['latte 2 l', 'latte', [{ valore: 2, unita: 'l' }]],
    ['500g di farina', 'farina', [{ valore: 500, unita: 'g' }]],
    ['uova 6', 'uova', [{ valore: 6, unita: null }]],
    ['1,5 kg patate', 'patate', [{ valore: 1.5, unita: 'kg' }]],
    ['pane', 'pane', []],
    ['carta da forno', 'carta da forno', []],
  ])('%s', (testo, nome, quantita) => expect(leggiVoceLibera(testo)).toEqual({ nome, quantita }))

  it('quantità con più unità', () => {
    expect(leggiQuantita('400 g + 2 cucchiai')).toEqual([
      { valore: 400, unita: 'g' },
      { valore: 2, unita: 'cucchiaio' },
    ])
    expect(leggiQuantita('3 spicchi')).toEqual([{ valore: 3, unita: 'spicchi' }])
    expect(leggiQuantita('')).toEqual([])
  })
})

describe('raggruppamento e testo', () => {
  const l = applicaTutte(listaVuota(), [
    aggiungi(['mele', 4, 'pz', 'frutta e verdura'], ['spaghetti', 400, 'g', 'dispensa'], ['sale', null, null, 'dispensa', true]),
    aggiungi(['zafferano', 1, 'confezione', 'reparto inventato']),
  ])
  const conSpunta = applica(l, op({ tipo: 'spunta', voce: l.voci[0]!.id, chiave: 'mele', valore: true }))

  it('ordina per reparto, poi dispensa, poi carrello', () => {
    expect(raggruppa(conSpunta.voci, REPARTI).map((g) => [g.titolo, g.voci.map((v) => v.nome)])).toEqual([
      ['dispensa', ['spaghetti']],
      ['altro', ['zafferano']],
      [DISPENSA, ['sale']],
      [CARRELLO, ['mele']],
    ])
  })
  it('il testo da condividere esclude quello già nel carrello', () => {
    const t = testoDaCondividere(conSpunta.voci, REPARTI)
    expect(t).toContain('• spaghetti — 400 g')
    expect(t).toContain('• sale')
    expect(t).not.toContain('mele')
  })
})

describe('oggetti reattivi di Vue', () => {
  it('applica funziona su una lista reattiva', async () => {
    const { reactive } = await import('vue')
    const stato = reactive({ base: listaVuota(), coda: [] as Operazione[] })
    stato.coda.push(aggiungi(['olio', 1, 'l']))
    expect(applicaTutte(stato.base, stato.coda).voci[0]!.nome).toBe('olio')
  })
})

describe('plurali delle unità', () => {
  it('singolare solo per 1', () => {
    expect(formattaQuantitaVoce({ quantita: [{ valore: 2, unita: 'spicchio' }], qb: false })).toBe('2 spicchi')
    expect(formattaQuantitaVoce({ quantita: [{ valore: 1, unita: 'spicchio' }], qb: false })).toBe('1 spicchio')
    expect(formattaQuantitaVoce({ quantita: [{ valore: 5.5, unita: 'cucchiaio' }], qb: false })).toBe('5,5 cucchiai')
  })
})
