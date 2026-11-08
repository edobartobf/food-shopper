// Lettura e scrittura dei file del repo dati tramite le API di GitHub (Contents API).
import { impostazioni } from './impostazioni'

const API = 'https://api.github.com'

export class ErroreGitHub extends Error {
  stato: number
  constructor(stato: number, messaggio: string) {
    super(messaggio)
    this.stato = stato
  }
  /** Il file è cambiato nel frattempo (sha non più valido) */
  get conflitto() {
    return this.stato === 409 || this.stato === 422
  }
}

async function richiesta(percorso: string, init: RequestInit = {}): Promise<Response> {
  if (!impostazioni.token) throw new ErroreGitHub(401, 'Token non configurato')
  let risposta: Response
  try {
    risposta = await fetch(`${API}${percorso}`, {
      ...init,
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${impostazioni.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.headers ?? {}),
      },
    })
  } catch {
    throw new ErroreGitHub(0, 'Nessuna connessione')
  }
  if (!risposta.ok && risposta.status !== 404) {
    let dettaglio = ''
    try {
      dettaglio = (await risposta.json()).message ?? ''
    } catch {
      /* corpo non JSON */
    }
    throw new ErroreGitHub(risposta.status, messaggioErrore(risposta.status, dettaglio))
  }
  return risposta
}

function messaggioErrore(stato: number, dettaglio: string): string {
  if (stato === 401) return 'Token non valido o scaduto'
  if (stato === 403) return `Accesso negato (${dettaglio || 'permessi del token'})`
  if (stato === 409 || stato === 422) return 'Il file è stato modificato nel frattempo'
  return `Errore GitHub ${stato}${dettaglio ? `: ${dettaglio}` : ''}`
}

const contenuti = (percorso: string) => `/repos/${impostazioni.repo}/contents/${percorso.split('/').map(encodeURIComponent).join('/')}`

// --- base64 compatibile con UTF-8 (accenti) e con file binari ---
export function bytesInBase64(bytes: Uint8Array): string {
  let binario = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binario)
}
export const testoInBase64 = (testo: string) => bytesInBase64(new TextEncoder().encode(testo))
export function base64InTesto(b64: string): string {
  const binario = atob(b64.replace(/\s/g, ''))
  const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export interface FileJson<T> {
  dati: T
  sha: string
}

/** Legge un file JSON. Restituisce null se non esiste. */
export async function leggiJson<T>(percorso: string): Promise<FileJson<T> | null> {
  const r = await richiesta(contenuti(percorso))
  if (r.status === 404) return null
  const corpo = await r.json()
  return { dati: JSON.parse(base64InTesto(corpo.content)) as T, sha: corpo.sha }
}

/** Crea o aggiorna un file. Con sha: aggiorna solo se il file non è cambiato (altrimenti errore con conflitto=true). */
export async function scriviFile(percorso: string, contenutoBase64: string, messaggio: string, sha?: string): Promise<string> {
  const r = await richiesta(contenuti(percorso), {
    method: 'PUT',
    body: JSON.stringify({ message: firma(messaggio), content: contenutoBase64, ...(sha ? { sha } : {}) }),
  })
  if (r.status === 404) throw new ErroreGitHub(404, 'Repo dei dati non trovato: controlla il nome e i permessi del token')
  return (await r.json()).content.sha
}

export const scriviJson = (percorso: string, dati: unknown, messaggio: string, sha?: string) =>
  scriviFile(percorso, testoInBase64(JSON.stringify(dati, null, 2) + '\n'), messaggio, sha)

export async function eliminaFile(percorso: string, sha: string, messaggio: string): Promise<void> {
  await richiesta(contenuti(percorso), { method: 'DELETE', body: JSON.stringify({ message: firma(messaggio), sha }) })
}

export interface VoceCartella {
  name: string
  path: string
  sha: string
  type: 'file' | 'dir'
}

/** Elenca una cartella. Cartella inesistente = vuota. */
export async function elencaCartella(percorso: string): Promise<VoceCartella[]> {
  const r = await richiesta(contenuti(percorso))
  if (r.status === 404) return []
  return (await r.json()) as VoceCartella[]
}

/** Controlla che il token veda il repo e possa scriverci. */
export async function verificaAccesso(): Promise<{ ok: boolean; messaggio: string }> {
  try {
    const r = await richiesta(`/repos/${impostazioni.repo}`)
    if (r.status === 404) return { ok: false, messaggio: 'Repo non trovato, oppure il token non ha accesso a questo repo' }
    const repo = await r.json()
    if (repo.permissions && !repo.permissions.push) return { ok: false, messaggio: 'Il token può leggere ma non scrivere' }
    return { ok: true, messaggio: `Collegato a ${repo.full_name}` }
  } catch (e) {
    return { ok: false, messaggio: e instanceof Error ? e.message : String(e) }
  }
}

const firma = (messaggio: string) => `${messaggio} [${impostazioni.nome || 'app'}]`
