import { describe, expect, it } from 'vitest'
import { separaLink, tipoFonte } from '../src/lib/condivisi'

describe('separaLink', () => {
  it('estrae il link TikTok dal testo condiviso', () => {
    const r = separaLink('', 'Guarda questo video di @cuoca! https://vm.tiktok.com/ZNabc123/ #ricetta')
    expect(r.url).toBe('https://vm.tiktok.com/ZNabc123/')
    expect(r.testo).toBe('Guarda questo video di @cuoca!  #ricetta')
  })
  it('preferisce il campo url quando c’è', () => {
    expect(separaLink('https://www.giallozafferano.it/ricetta', 'Carbonara').url).toBe('https://www.giallozafferano.it/ricetta')
  })
  it('toglie la punteggiatura finale', () => {
    expect(separaLink('', 'vedi https://example.com/ricetta).').url).toBe('https://example.com/ricetta')
  })
  it('solo testo', () => {
    expect(separaLink('', '  200 g di farina  ')).toEqual({ url: '', testo: '200 g di farina' })
  })
})

describe('tipoFonte', () => {
  it.each([
    ['https://vm.tiktok.com/x', false, 'tiktok'],
    ['https://www.instagram.com/reel/x', false, 'instagram'],
    ['https://www.giallozafferano.it/x', false, 'sito'],
    ['', true, 'screenshot'],
    ['', false, 'testo'],
  ])('%s → %s', (url, img, atteso) => expect(tipoFonte(url as string, img as boolean)).toBe(atteso))
})
