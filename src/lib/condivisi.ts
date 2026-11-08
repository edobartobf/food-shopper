// Contenuti ricevuti dal menu "Condividi", tenuti sul telefono finché non vengono inviati all'import.
import { del, get, set } from 'idb-keyval'

export interface ImmagineCondivisa {
  nome: string
  tipo: string
  dati: ArrayBuffer
}

export interface Condiviso {
  id: string
  titolo: string
  testo: string
  url: string
  immagini: ImmagineCondivisa[]
  ricevuto_il: string
}

const chiave = (id: string) => `condiviso:${id}`

export async function salvaCondiviso(dati: Omit<Condiviso, 'id' | 'ricevuto_il'>): Promise<string> {
  const id = nuovoId()
  await set(chiave(id), { ...dati, id, ricevuto_il: new Date().toISOString() } satisfies Condiviso)
  return id
}

export const leggiCondiviso = (id: string) => get<Condiviso>(chiave(id))
export const eliminaCondiviso = (id: string) => del(chiave(id))

/** id corto, ordinabile per data: es. "mh8k2x-4f9a" */
export function nuovoId(): string {
  const tempo = Date.now().toString(36)
  const caso = Math.random().toString(36).slice(2, 6)
  return `${tempo}-${caso}`
}

const RE_URL = /https?:\/\/[^\s<>"']+/i

/**
 * TikTok e Instagram mettono il link dentro il testo ("Guarda questo video… https://vm.tiktok.com/…"),
 * i browser lo passano nel campo url. Restituisce il primo link trovato e il testo senza quel link.
 */
export function separaLink(url: string, testo: string): { url: string; testo: string } {
  const pulito = (s: string) => s.replace(/[),.;]+$/, '')
  if (url.trim()) return { url: pulito(url.trim()), testo: testo.trim() }
  const trovato = testo.match(RE_URL)
  if (!trovato) return { url: '', testo: testo.trim() }
  return { url: pulito(trovato[0]), testo: testo.replace(trovato[0], '').trim() }
}

export type TipoFonte = 'tiktok' | 'instagram' | 'sito' | 'testo' | 'screenshot'

export function tipoFonte(url: string, haImmagini: boolean): TipoFonte {
  if (url) {
    let host = ''
    try {
      host = new URL(url).hostname.replace(/^www\./, '')
    } catch {
      return 'sito'
    }
    if (host.endsWith('tiktok.com')) return 'tiktok'
    if (host.endsWith('instagram.com')) return 'instagram'
    return 'sito'
  }
  return haImmagini ? 'screenshot' : 'testo'
}
