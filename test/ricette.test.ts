import { describe, expect, it } from 'vitest'
import { filtraRicette, formattaQuantita, idDaTitolo, normalizza, trovaPerUrl, tuttiITag, urlConfrontabile } from '../src/lib/ricette'

const carbonara = normalizza({
  id: 'carbonara-1',
  titolo: 'Spaghetti alla carbonara',
  tag: ['primi', 'veloce'],
  ingredienti: [
    { nome: 'spaghetti', quantita: 200, unita: 'g', reparto: 'dispensa' },
    { nome: 'guanciale', quantita: 100, unita: 'g', reparto: 'carne e pesce' },
  ],
  fonte: { tipo: 'tiktok', url: 'https://www.tiktok.com/@cuoca/video/123?is_from_webapp=1&sender_device=pc' },
})
const parmigiana = normalizza({
  id: 'parmigiana-2',
  titolo: 'Parmigiana di melanzane',
  tag: ['secondi', 'vegetariano'],
  ingredienti: [{ nome: 'melanzane', quantita: 2, unita: 'pz', reparto: 'frutta e verdura' }],
  fonte: { tipo: 'sito', url: 'https://ricette.giallozafferano.it/Parmigiana-di-melanzane.html' },
})

describe('filtraRicette', () => {
  const tutte = [carbonara, parmigiana]
  it('cerca nel titolo ignorando maiuscole e accenti', () => {
    expect(filtraRicette(tutte, 'CARBONÀRA', []).map((r) => r.id)).toEqual(['carbonara-1'])
  })
  it('cerca negli ingredienti', () => {
    expect(filtraRicette(tutte, 'melanzane', []).map((r) => r.id)).toEqual(['parmigiana-2'])
  })
  it('richiede tutte le parole', () => {
    expect(filtraRicette(tutte, 'spaghetti melanzane', [])).toEqual([])
  })
  it('filtra per tag', () => {
    expect(filtraRicette(tutte, '', ['vegetariano']).map((r) => r.id)).toEqual(['parmigiana-2'])
    expect(filtraRicette(tutte, '', ['primi', 'veloce']).map((r) => r.id)).toEqual(['carbonara-1'])
  })
  it('elenca i tag dal più usato', () => {
    expect(tuttiITag([carbonara, parmigiana, normalizza({ titolo: 'x', tag: ['veloce'] })])[0]).toBe('veloce')
  })
})

describe('doppioni', () => {
  it('riconosce lo stesso link con parametri di tracciamento diversi', () => {
    expect(trovaPerUrl([carbonara], 'https://tiktok.com/@cuoca/video/123/?_r=1&_t=abc')?.id).toBe('carbonara-1')
  })
  it('instagram con igsh', () => {
    const r = normalizza({ titolo: 'x', fonte: { tipo: 'instagram', url: 'https://www.instagram.com/reel/ABC/' } })
    expect(trovaPerUrl([r], 'https://instagram.com/reel/ABC?igsh=xyz')).toBe(r)
  })
  it('link diversi restano diversi', () => {
    expect(trovaPerUrl([carbonara], 'https://www.tiktok.com/@cuoca/video/999')).toBeUndefined()
    expect(urlConfrontabile('https://x.it/a?p=1')).not.toBe(urlConfrontabile('https://x.it/a?p=2'))
  })
  it('testo senza link', () => {
    expect(trovaPerUrl([carbonara], '')).toBeUndefined()
  })
})

describe('varie', () => {
  it('id leggibile senza accenti', () => {
    expect(idDaTitolo('Pàsta e Ceci!')).toMatch(/^pasta-e-ceci-[a-z0-9]+$/)
  })
  it('scala le quantità e scrive i decimali all’italiana', () => {
    expect(formattaQuantita({ nome: 'farina', quantita: 250, unita: 'g', reparto: 'dispensa' }, 1.5)).toBe('375 g')
    expect(formattaQuantita({ nome: 'latte', quantita: 0.5, unita: 'l', reparto: 'latticini e uova' })).toBe('0,5 l')
    expect(formattaQuantita({ nome: 'sale', quantita: null, unita: null, reparto: 'dispensa', qb: true })).toBe('q.b.')
  })
  it('normalizza completa i campi mancanti', () => {
    const r = normalizza({ titolo: '  ', ingredienti: [{ nome: ' uova ', quantita: 2, unita: 'pz', reparto: '' }] })
    expect(r.titolo).toBe('Senza titolo')
    expect(r.porzioni).toBe(2)
    expect(r.ingredienti[0]).toMatchObject({ nome: 'uova', reparto: 'altro' })
  })
})

describe('gruppi di ingredienti', () => {
  it('tiene le sezioni nell’ordine della ricetta e non fonde voci uguali', async () => {
    const { gruppiIngredienti } = await import('../src/lib/ricette')
    const g = gruppiIngredienti([
      { nome: 'patate', quantita: 500, unita: 'g', reparto: 'frutta e verdura', gruppo: 'impasto' },
      { nome: 'fecola di patate', quantita: 200, unita: 'g', reparto: 'dispensa', gruppo: 'impasto' },
      { nome: 'fecola di patate', quantita: 1, unita: 'cucchiaino', reparto: 'dispensa', gruppo: 'salsa' },
      { nome: 'zucchina', quantita: 1, unita: 'pz', reparto: 'frutta e verdura', gruppo: 'impasto' },
    ])
    expect(g.map((x) => [x.titolo, x.ingredienti.length])).toEqual([
      ['impasto', 3],
      ['salsa', 1],
    ])
  })
})

describe('dosi stimate nelle ricette', () => {
  it('mostra ≈ e la conferma la toglie', async () => {
    const { formattaQuantita, senzaStime } = await import('../src/lib/ricette')
    const ing = { nome: 'totano', quantita: 300, unita: 'g', reparto: 'carne e pesce', stimata: true }
    expect(formattaQuantita(ing)).toBe('≈ 300 g')
    expect(formattaQuantita(senzaStime([ing])[0]!)).toBe('300 g')
  })
  it('le stime arrivano in lista dalla ricetta', async () => {
    const { vociDaRicetta } = await import('../src/lib/daRicette')
    const r = normalizza({ titolo: 't', porzioni: 2, ingredienti: [
      { nome: 'totano', quantita: 300, unita: 'g', reparto: 'carne e pesce', stimata: true },
      { nome: 'sale', quantita: null, unita: null, reparto: 'dispensa', qb: true },
    ] })
    expect(vociDaRicetta(r, 4).map((v) => [v.nome, v.quantita, v.stimata])).toEqual([
      ['totano', [{ valore: 600, unita: 'g' }], true],
      ['sale', [], false],
    ])
  })
})

describe('import bloccati', () => {
  it('dopo 10 minuti dall’ultimo invio una richiesta non finita sembra bloccata', async () => {
    const { bloccata } = await import('../src/lib/importazioni')
    const base = { id: 'imp-1', fonte: 'tiktok' as const, url: 'u', testo: '', allegati: [], creata_da: 'Edo', errore: null }
    const t0 = Date.parse('2026-11-09T10:00:00Z')
    const imp = { ...base, stato: 'in_attesa' as const, creata_il: '2026-11-09T10:00:00Z' }
    expect(bloccata(imp, t0 + 9 * 60_000)).toBe(false)
    expect(bloccata(imp, t0 + 11 * 60_000)).toBe(true)
    // Riprova riparte da capo
    expect(bloccata({ ...imp, inviata_il: '2026-11-09T10:10:00Z' }, t0 + 11 * 60_000)).toBe(false)
    // quelle con errore hanno già i loro pulsanti
    expect(bloccata({ ...imp, stato: 'errore' as const }, t0 + 60 * 60_000)).toBe(false)
  })
})

describe('modalità cucina', () => {
  it('spunta e toglie le spunte per ricetta', async () => {
    const { alterna, eFatto, quantiFatti, ricomincia } = await import('../src/lib/cucina')
    alterna('r1', 'p-0')
    alterna('r1', 'i--2')
    alterna('r2', 'p-0')
    expect(eFatto('r1', 'p-0')).toBe(true)
    alterna('r1', 'p-0')
    expect(eFatto('r1', 'p-0')).toBe(false)
    expect(quantiFatti('r1')).toBe(1)
    ricomincia('r1')
    expect(quantiFatti('r1')).toBe(0)
    expect(eFatto('r2', 'p-0')).toBe(true)
  })
})
