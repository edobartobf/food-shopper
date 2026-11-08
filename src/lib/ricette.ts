// Ricettario: una ricetta per file in ricette/<id>.json nel repo dati.
// Copia locale in IndexedDB: si scaricano solo i file cambiati (sha diverso) e l'elenco funziona anche offline.
import { get, set } from 'idb-keyval'
import { reactive } from 'vue'
import { elencaCartella, eliminaFile, ErroreGitHub, leggiBlobJson, leggiJson, scriviJson } from './github'
import { impostazioni } from './impostazioni'
import { nuovoId } from './condivisi'
import { unitaPerQuantita } from './unita'

export interface Ingrediente {
  nome: string
  quantita: number | null
  unita: string | null
  reparto: string
  qb?: boolean
  nota?: string
}

export interface Ricetta {
  id: string
  titolo: string
  porzioni: number
  tempo_minuti?: number | null
  tag: string[]
  ingredienti: Ingrediente[]
  passaggi: string[]
  fonte: { tipo: string; url?: string; url_condiviso?: string; autore?: string }
  immagine_url?: string | null
  note?: string
  da_ricontrollare: boolean
  creata_da: string
  creata_il: string
  modificata_il: string
}

export const UNITA = ['g', 'kg', 'ml', 'l', 'pz', 'cucchiaio', 'cucchiaino', 'tazza', 'spicchio', 'fetta', 'mazzetto', 'pizzico', 'confezione']

export const REPARTI_PREDEFINITI = [
  'frutta e verdura',
  'carne e pesce',
  'latticini e uova',
  'pane e forno',
  'dispensa',
  'surgelati',
  'bevande',
  'casa e igiene',
  'altro',
]

interface Cache {
  repo: string
  ricette: Record<string, { sha: string; dati: Ricetta }>
}

const CHIAVE_CACHE = 'cache:ricette'

export const ricettario = reactive({
  ricette: [] as Ricetta[],
  sha: {} as Record<string, string>,
  reparti: [...REPARTI_PREDEFINITI],
  caricamento: false,
  caricato: false,
  errore: '',
})

const percorso = (id: string) => `ricette/${id}.json`

function ordina(ricette: Ricetta[]) {
  return ricette.sort((a, b) => a.titolo.localeCompare(b.titolo, 'it'))
}

async function leggiCache(): Promise<Cache> {
  try {
    const c = await get<Cache>(CHIAVE_CACHE)
    if (c && c.repo === impostazioni.repo) return c
  } catch {
    /* IndexedDB non disponibile */
  }
  return { repo: impostazioni.repo, ricette: {} }
}

async function scriviCache(c: Cache) {
  try {
    await set(CHIAVE_CACHE, JSON.parse(JSON.stringify(c)))
  } catch {
    /* pazienza: la prossima volta riscarica */
  }
}

function applica(c: Cache) {
  ricettario.ricette = ordina(Object.values(c.ricette).map((v) => v.dati))
  ricettario.sha = Object.fromEntries(Object.values(c.ricette).map((v) => [v.dati.id, v.sha]))
}

/** Mostra subito la copia locale, poi la allinea a GitHub scaricando solo le ricette cambiate. */
export async function aggiornaRicettario(): Promise<void> {
  if (ricettario.caricamento) return
  ricettario.caricamento = true
  ricettario.errore = ''
  const cache = await leggiCache()
  if (!ricettario.caricato) applica(cache)
  try {
    const [voci, config] = await Promise.all([elencaCartella('ricette'), leggiJson<{ reparti?: string[] }>('config.json')])
    if (config?.dati.reparti?.length) ricettario.reparti = config.dati.reparti
    const nuova: Cache = { repo: impostazioni.repo, ricette: {} }
    const daScaricare = voci.filter((v) => v.type === 'file' && v.name.endsWith('.json'))
    await Promise.all(
      daScaricare.map(async (v) => {
        const vecchia = cache.ricette[v.path]
        const dati = vecchia && vecchia.sha === v.sha ? vecchia.dati : await leggiBlobJson<Ricetta>(v.sha)
        nuova.ricette[v.path] = { sha: v.sha, dati: normalizza(dati) }
      }),
    )
    applica(nuova)
    await scriviCache(nuova)
  } catch (e) {
    ricettario.errore = e instanceof ErroreGitHub && e.stato === 0 ? 'Sei offline: mostro la copia salvata sul telefono' : String(e instanceof Error ? e.message : e)
  } finally {
    ricettario.caricamento = false
    ricettario.caricato = true
  }
}

/** Completa i campi mancanti (ricette scritte a mano nel repo o da versioni precedenti). */
export function normalizza(r: Partial<Ricetta>): Ricetta {
  const adesso = new Date().toISOString()
  return {
    id: r.id ?? nuovoId(),
    titolo: r.titolo?.trim() || 'Senza titolo',
    porzioni: r.porzioni && r.porzioni > 0 ? r.porzioni : 2,
    tempo_minuti: r.tempo_minuti ?? null,
    tag: (r.tag ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean),
    ingredienti: (r.ingredienti ?? []).map((i) => ({
      ...i,
      nome: i.nome?.trim() ?? '',
      quantita: i.quantita ?? null,
      unita: i.unita ?? null,
      reparto: i.reparto || 'altro',
    })),
    passaggi: (r.passaggi ?? []).filter((p) => p?.trim()),
    fonte: r.fonte ?? { tipo: 'manuale' },
    immagine_url: r.immagine_url ?? null,
    note: r.note ?? '',
    da_ricontrollare: r.da_ricontrollare ?? false,
    creata_da: r.creata_da ?? '',
    creata_il: r.creata_il ?? adesso,
    modificata_il: r.modificata_il ?? adesso,
  }
}

export function nuovaRicetta(): Ricetta {
  return { ...normalizza({ fonte: { tipo: 'manuale' }, creata_da: impostazioni.nome }), id: '', titolo: '' }
}

export function idDaTitolo(titolo: string): string {
  const base = titolo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return `${base || 'ricetta'}-${nuovoId().split('-')[1]}`
}

/** Salva una ricetta. Se un altro telefono l'ha modificata nel frattempo, si ferma con un errore chiaro. */
export async function salvaRicetta(r: Ricetta): Promise<Ricetta> {
  const nuova = !r.id
  const pulita = normalizza({
    ...r,
    id: r.id || idDaTitolo(r.titolo),
    ingredienti: r.ingredienti.filter((i) => i.nome.trim()),
    modificata_il: new Date().toISOString(),
  })
  try {
    const sha = await scriviJson(
      percorso(pulita.id),
      pulita,
      `${nuova ? 'Nuova ricetta' : 'Modifica'}: ${pulita.titolo}`,
      nuova ? undefined : ricettario.sha[pulita.id],
    )
    aggiornaLocale(pulita, sha)
    return pulita
  } catch (e) {
    if (e instanceof ErroreGitHub && e.conflitto) {
      throw new Error("Nel frattempo questa ricetta è stata modificata dall'altro telefono. Torna indietro e riaprila per vedere la versione aggiornata.")
    }
    throw e
  }
}

export async function eliminaRicetta(r: Ricetta): Promise<void> {
  const sha = ricettario.sha[r.id]
  if (sha) await eliminaFile(percorso(r.id), sha, `Elimina ricetta: ${r.titolo}`)
  ricettario.ricette = ricettario.ricette.filter((x) => x.id !== r.id)
  delete ricettario.sha[r.id]
  await salvaStatoInCache()
}

function aggiornaLocale(r: Ricetta, sha: string) {
  ricettario.ricette = ordina([...ricettario.ricette.filter((x) => x.id !== r.id), r])
  ricettario.sha[r.id] = sha
  void salvaStatoInCache()
}

async function salvaStatoInCache() {
  await scriviCache({
    repo: impostazioni.repo,
    ricette: Object.fromEntries(ricettario.ricette.map((r) => [percorso(r.id), { sha: ricettario.sha[r.id] ?? '', dati: r }])),
  })
}

// --- ricerca ---

const senzaAccenti = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Cerca nel titolo, nei tag e negli ingredienti; tutti i tag selezionati devono essere presenti. */
export function filtraRicette(ricette: Ricetta[], testo: string, tag: string[]): Ricetta[] {
  const parole = senzaAccenti(testo).split(/\s+/).filter(Boolean)
  return ricette.filter((r) => {
    if (tag.some((t) => !r.tag.includes(t))) return false
    if (!parole.length) return true
    const pagliaio = senzaAccenti([r.titolo, ...r.tag, ...r.ingredienti.map((i) => i.nome)].join(' '))
    return parole.every((p) => pagliaio.includes(p))
  })
}

export function tuttiITag(ricette: Ricetta[]): string[] {
  const conteggio = new Map<string, number>()
  for (const r of ricette) for (const t of r.tag) conteggio.set(t, (conteggio.get(t) ?? 0) + 1)
  return [...conteggio.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'it')).map(([t]) => t)
}

// --- doppioni ---

/** Toglie i parametri di tracciamento e le differenze irrilevanti, per riconoscere lo stesso link. */
export function urlConfrontabile(url: string): string {
  try {
    const u = new URL(url.trim())
    u.hash = ''
    for (const p of [...u.searchParams.keys()]) {
      if (/^(utm_|igsh|igshid|si$|_r$|_t$|is_from_webapp|sender_device|fbclid|gclid|share|exln|obrf)/i.test(p)) u.searchParams.delete(p)
    }
    u.hostname = u.hostname.replace(/^(www|m)\./, '')
    return `${u.hostname}${u.pathname.replace(/\/+$/, '')}${u.search}`.toLowerCase()
  } catch {
    return url.trim().toLowerCase()
  }
}

export function trovaPerUrl(ricette: Ricetta[], url: string): Ricetta | undefined {
  if (!url.trim()) return undefined
  const cercato = urlConfrontabile(url)
  return ricette.find((r) => [r.fonte.url, r.fonte.url_condiviso].some((u) => u && urlConfrontabile(u) === cercato))
}

export function formattaQuantita(i: Ingrediente, fattore = 1): string {
  if (i.qb || i.quantita == null) return i.qb ? 'q.b.' : ''
  const q = Math.round(i.quantita * fattore * 100) / 100
  const numero = q.toLocaleString('it-IT', { maximumFractionDigits: 2 })
  return i.unita ? `${numero} ${unitaPerQuantita(i.unita, q)}` : numero
}
