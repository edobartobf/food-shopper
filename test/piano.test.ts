import { describe, expect, it } from 'vitest'
import { conservazione, consigliPasto, promemoriaDiOggi } from '../src/lib/conservazione'
import {
  aggiungiGiorni,
  applica,
  applicaTutte,
  fineSettimana,
  giorniTra,
  oggi,
  ordina,
  pastiDaComprare,
  pianoVuoto,
  quandoPasto,
  titoloGiorno,
  type Operazione,
  type Pasto,
} from '../src/lib/piano'
import { normalizza, type Ricetta } from '../src/lib/ricette'

let n = 0
const op = (o: Record<string, unknown>) => ({ id: `op${++n}`, autore: 'Edo', ...o }) as Operazione
const tra = (g: number) => aggiungiGiorni(oggi(), g)

const pasto = (id: string, data: string, momento: Pasto['momento'] = 'cena', ricetta: string | null = 'r1'): Operazione =>
  op({ tipo: 'aggiungi', pasto: { id, data, momento, ricetta, titolo: ricetta ?? 'pizza fuori', porzioni: 2 } })

const ricetta = (ingredienti: Array<[string, string, boolean?]>): Ricetta =>
  normalizza({
    id: 'r1',
    titolo: 'Prova',
    ingredienti: ingredienti.map(([nome, reparto, qb]) => ({ nome, reparto, quantita: qb ? null : 100, unita: qb ? null : 'g', qb })),
  })

describe('date', () => {
  it('aggiunge giorni anche a cavallo di mese e ora legale', () => {
    expect(aggiungiGiorni('2026-10-24', 2)).toBe('2026-10-26')
    expect(aggiungiGiorni('2026-11-30', 1)).toBe('2026-12-01')
    expect(giorniTra('2026-03-28', '2026-03-30')).toBe(2)
  })
  it('fine settimana è la domenica', () => {
    expect(fineSettimana('2026-11-13')).toBe('2026-11-15') // venerdì
    expect(fineSettimana('2026-11-15')).toBe('2026-11-15') // domenica
    expect(fineSettimana('2026-11-16')).toBe('2026-11-22') // lunedì
  })
  it('nomi dei giorni', () => {
    expect(titoloGiorno('2026-11-13', '2026-11-13')).toBe('Oggi')
    expect(titoloGiorno('2026-11-14', '2026-11-13')).toBe('Domani')
    expect(titoloGiorno('2026-11-16', '2026-11-13')).toBe('Lunedì 16 nov')
    expect(quandoPasto({ data: '2026-11-15', momento: 'pranzo' }, '2026-11-13')).toBe('domenica a pranzo')
    expect(quandoPasto({ data: '2026-11-14', momento: 'cena' }, '2026-11-13')).toBe('domani a cena')
  })
})

describe('operazioni del piano', () => {
  it('aggiunge, sposta, cambia porzioni e toglie', () => {
    let p = applicaTutte(pianoVuoto(), [pasto('a', tra(1)), pasto('b', tra(0), 'pranzo')])
    expect(ordina(p.pasti).map((x) => x.id)).toEqual(['b', 'a'])
    p = applica(p, op({ tipo: 'modifica', pasto: 'a', campi: { data: tra(0), momento: 'colazione', porzioni: 4 } }))
    expect(ordina(p.pasti).map((x) => x.id)).toEqual(['a', 'b'])
    expect(p.pasti.find((x) => x.id === 'a')!.porzioni).toBe(4)
    p = applica(p, op({ tipo: 'elimina', pasto: 'b' }))
    expect(p.pasti.map((x) => x.id)).toEqual(['a'])
  })
  it('la stessa operazione due volte vale una', () => {
    const o = pasto('a', tra(1))
    const p = applicaTutte(pianoVuoto(), [o, o])
    expect(p.pasti).toHaveLength(1)
  })
  it('segna in lista e toglie il segno', () => {
    let p = applicaTutte(pianoVuoto(), [pasto('a', tra(1)), pasto('b', tra(2))])
    p = applica(p, op({ tipo: 'in_lista', pasti: ['a'], spesa_il: tra(0) }))
    expect(pastiDaComprare(p.pasti, tra(0), tra(6)).map((x) => x.id)).toEqual(['b'])
    p = applica(p, op({ tipo: 'in_lista', pasti: ['a'], spesa_il: null }))
    expect(pastiDaComprare(p.pasti, tra(0), tra(6)).map((x) => x.id)).toEqual(['a', 'b'])
  })
  it('da comprare: solo nel periodo e solo con ricetta', () => {
    const p = applicaTutte(pianoVuoto(), [pasto('a', tra(1)), pasto('b', tra(5)), pasto('c', tra(1), 'pranzo', null)])
    expect(pastiDaComprare(p.pasti, tra(0), tra(2)).map((x) => x.id)).toEqual(['a'])
  })
  it('spostare un pasto azzera i promemoria fatti', () => {
    let p = applicaTutte(pianoVuoto(), [pasto('a', tra(3))])
    p = applica(p, op({ tipo: 'fatto', pasto: 'a', promemoria: 'congela:salmone', valore: true }))
    expect(p.pasti[0]!.fatti).toEqual(['congela:salmone'])
    p = applica(p, op({ tipo: 'modifica', pasto: 'a', campi: { data: tra(4) } }))
    expect(p.pasti[0]!.fatti).toEqual([])
  })
  it('toglie i pasti di più di due mesi fa', () => {
    const p = applicaTutte(pianoVuoto(), [pasto('vecchio', tra(-90)), pasto('nuovo', tra(1))])
    expect(p.pasti.map((x) => x.id)).toEqual(['nuovo'])
  })
})

describe('conservazione', () => {
  it('riconosce i freschi', () => {
    expect(conservazione('filetto di salmone', 'carne e pesce')).toMatchObject({ giorni: 1, congelabile: true })
    expect(conservazione('carne macinata di manzo', 'carne e pesce')).toMatchObject({ giorni: 1 })
    expect(conservazione('petto di pollo', 'carne e pesce')).toMatchObject({ giorni: 2 })
    expect(conservazione('cozze', 'carne e pesce')).toMatchObject({ congelabile: false, surgelato: true })
    expect(conservazione('rucola', 'frutta e verdura')).toMatchObject({ giorni: 3, congelabile: false })
    expect(conservazione('burrata', 'latticini e uova')).toMatchObject({ giorni: 3 })
    expect(conservazione('pane', 'pane e forno')).toMatchObject({ scongela: 'stesso_giorno' })
  })
  it('ignora conserve e surgelati', () => {
    expect(conservazione('salmone affumicato', 'carne e pesce')).toBeNull()
    expect(conservazione('tonno', 'dispensa')).toBeNull()
    expect(conservazione("tonno sott'olio", 'carne e pesce')).toBeNull()
    expect(conservazione('spinaci', 'surgelati')).toBeNull()
    expect(conservazione('pomodori secchi', 'frutta e verdura')).toBeNull()
    expect(conservazione('pangrattato', 'pane e forno')).toBeNull()
    expect(conservazione('pasta', 'dispensa')).toBeNull()
    expect(conservazione('cipolla', 'frutta e verdura')).toBeNull()
    expect(conservazione('guanciale', 'carne e pesce')).toBeNull()
    expect(conservazione('prosciutto crudo', 'carne e pesce')).toBeNull()
  })
  it('carne o pesce sconosciuti: prudenza', () => {
    expect(conservazione('pollame misto strano', 'carne e pesce')).not.toBeNull()
    expect(conservazione('bocconcini di qualcosa', 'carne e pesce')).toMatchObject({ giorni: 2 })
  })
})

describe('consigli', () => {
  const r = ricetta([
    ['salmone', 'carne e pesce'],
    ['rucola', 'frutta e verdura'],
    ['pasta', 'dispensa'],
    ['basilico', 'frutta e verdura', true],
  ])
  const p = (data: string, extra: Partial<Pasto> = {}): Pasto => ({
    id: 'a', data, momento: 'cena', ricetta: 'r1', titolo: 'Prova', porzioni: 2, spesa_il: null, fatti: [], aggiunto_da: 'Edo', ...extra,
  })

  it('nessun consiglio se il pasto è vicino alla spesa', () => {
    expect(consigliPasto(p('2026-11-14'), r, '2026-11-13')).toEqual([])
  })
  it('lontano: congela e scongela il pesce, compra dopo la rucola, niente per pasta e q.b.', () => {
    const c = consigliPasto(p('2026-11-20'), r, '2026-11-14', '2026-11-14')
    expect(c.map((x) => [x.tipo, x.ingrediente, x.giorno])).toEqual([
      ['congela', 'salmone', '2026-11-14'],
      ['scongela', 'salmone', '2026-11-19'],
      ['compra_dopo', 'rucola', '2026-11-14'],
    ])
    expect(c[0]!.testo).toContain('venerdì a cena')
  })
  it('promemoria di oggi: congela il giorno della spesa, scongela la sera prima, spariscono se fatti', () => {
    const pasti = [p('2026-11-20', { spesa_il: '2026-11-14' })]
    expect(promemoriaDiOggi(pasti, [r], '2026-11-14').map((c) => c.tipo)).toEqual(['congela'])
    expect(promemoriaDiOggi(pasti, [r], '2026-11-17').map((c) => c.tipo)).toEqual(['congela']) // dimenticato: resta
    const fatto = [p('2026-11-20', { spesa_il: '2026-11-14', fatti: ['congela:salmone'] })]
    expect(promemoriaDiOggi(fatto, [r], '2026-11-17')).toEqual([])
    expect(promemoriaDiOggi(fatto, [r], '2026-11-19').map((c) => c.tipo)).toEqual(['scongela'])
    expect(promemoriaDiOggi(fatto, [r], '2026-11-21')).toEqual([])
  })
  it('nessun promemoria prima del giorno della spesa', () => {
    expect(promemoriaDiOggi([p('2026-11-20', { spesa_il: '2026-11-15' })], [r], '2026-11-14')).toEqual([])
  })
})
