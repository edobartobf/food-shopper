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
