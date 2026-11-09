// "Ci piace": prodotti precisi da ricordare (quel pesto, quella marca di yogurt), con foto e nota.
// Un file per prodotto in preferiti/<id>.json nel repo dati, come le ricette; copia locale per vederli offline.
import { get, set } from 'idb-keyval'
import { reactive } from 'vue'
import { elencaCartella, eliminaFile, ErroreGitHub, leggiBlobJson, scriviJson } from './github'
import { impostazioni } from './impostazioni'
import { nuovoId } from './condivisi'
import { caricaFoto, eliminaFoto, preparaOffline } from './foto'
import { chiave, type VoceNuova } from './lista'

export interface Preferito {
  id: string
  nome: string
  /** es. "marca Rana, banco frigo" */
  nota: string
  reparto: string
  /** foto/<id>.jpg nel repo dati */
  foto: string | null
  creato_da: string
  creato_il: string
  modificato_il: string
}

interface Cache {
  repo: string
  preferiti: Record<string, { sha: string; dati: Preferito }>
}

const CHIAVE_CACHE = 'cache:preferiti'
const percorso = (id: string) => `preferiti/${id}.json`

export const preferiti = reactive({
  elenco: [] as Preferito[],
  sha: {} as Record<string, string>,
  caricamento: false,
  caricato: false,
  errore: '',
})

const ordina = (p: Preferito[]) => p.sort((a, b) => a.nome.localeCompare(b.nome, 'it'))

export function normalizzaPreferito(p: Partial<Preferito>): Preferito {
  const adesso = new Date().toISOString()
  return {
    id: p.id || nuovoId(),
    nome: p.nome?.trim() || 'Senza nome',
    nota: p.nota?.trim() ?? '',
    reparto: p.reparto || 'altro',
    foto: p.foto ?? null,
    creato_da: p.creato_da ?? '',
    creato_il: p.creato_il ?? adesso,
    modificato_il: p.modificato_il ?? adesso,
  }
}

async function leggiCache(): Promise<Cache> {
  try {
    const c = await get<Cache>(CHIAVE_CACHE)
    if (c && c.repo === impostazioni.repo) return c
  } catch {
    /* IndexedDB non disponibile */
  }
  return { repo: impostazioni.repo, preferiti: {} }
}

async function salvaCache() {
  try {
    await set(
      CHIAVE_CACHE,
      JSON.parse(
        JSON.stringify({
          repo: impostazioni.repo,
          preferiti: Object.fromEntries(preferiti.elenco.map((p) => [percorso(p.id), { sha: preferiti.sha[p.id] ?? '', dati: p }])),
        } satisfies Cache),
      ),
    )
  } catch {
    /* pazienza */
  }
}

function applica(c: Cache) {
  preferiti.elenco = ordina(Object.values(c.preferiti).map((v) => v.dati))
  preferiti.sha = Object.fromEntries(Object.values(c.preferiti).map((v) => [v.dati.id, v.sha]))
}

/** Mostra subito la copia locale, poi scarica solo i prodotti cambiati e prepara le foto per l'offline. */
export async function aggiornaPreferiti(): Promise<void> {
  if (preferiti.caricamento) return
  preferiti.caricamento = true
  preferiti.errore = ''
  const cache = await leggiCache()
  if (!preferiti.caricato) applica(cache)
  try {
    const voci = (await elencaCartella('preferiti')).filter((v) => v.type === 'file' && v.name.endsWith('.json'))
    const nuova: Cache = { repo: impostazioni.repo, preferiti: {} }
    await Promise.all(
      voci.map(async (v) => {
        const vecchia = cache.preferiti[v.path]
        const dati = vecchia && vecchia.sha === v.sha ? vecchia.dati : await leggiBlobJson<Preferito>(v.sha)
        nuova.preferiti[v.path] = { sha: v.sha, dati: normalizzaPreferito(dati) }
      }),
    )
    applica(nuova)
    await salvaCache()
  } catch (e) {
    preferiti.errore =
      e instanceof ErroreGitHub && e.stato === 0 ? 'Sei offline: mostro la copia salvata sul telefono' : String(e instanceof Error ? e.message : e)
  } finally {
    preferiti.caricamento = false
    preferiti.caricato = true
  }
  void preparaOffline(preferiti.elenco.map((p) => p.foto).filter((f): f is string => !!f))
}

/**
 * Salva un prodotto. `foto`: Blob = foto nuova da caricare, null = togli la foto, undefined = lascia com'è.
 */
export async function salvaPreferito(p: Partial<Preferito>, foto?: Blob | null): Promise<Preferito> {
  const esistente = p.id ? preferiti.elenco.find((x) => x.id === p.id) : undefined
  const caricata = foto ? await caricaFoto(foto, p.nome || 'prodotto') : null
  const pulito = normalizzaPreferito({
    ...p,
    creato_da: p.creato_da || impostazioni.nome,
    foto: foto === undefined ? (p.foto ?? null) : caricata,
    modificato_il: new Date().toISOString(),
  })
  try {
    const sha = await scriviJson(
      percorso(pulito.id),
      pulito,
      `${esistente ? 'Modifica' : 'Ci piace'}: ${pulito.nome}`,
      esistente ? preferiti.sha[pulito.id] : undefined,
    )
    preferiti.elenco = ordina([...preferiti.elenco.filter((x) => x.id !== pulito.id), pulito])
    preferiti.sha[pulito.id] = sha
    void salvaCache()
  } catch (e) {
    void eliminaFoto(caricata, pulito.nome)
    if (e instanceof ErroreGitHub && e.conflitto) {
      throw new Error("Nel frattempo questo prodotto è stato modificato dall'altro telefono. Torna indietro e riaprilo.")
    }
    throw e
  }
  if (esistente?.foto && esistente.foto !== pulito.foto) void eliminaFoto(esistente.foto, pulito.nome)
  return pulito
}

export async function eliminaPreferito(p: Preferito): Promise<void> {
  const sha = preferiti.sha[p.id]
  if (sha) await eliminaFile(percorso(p.id), sha, `Non ci piace più: ${p.nome}`)
  void eliminaFoto(p.foto, p.nome)
  preferiti.elenco = preferiti.elenco.filter((x) => x.id !== p.id)
  delete preferiti.sha[p.id]
  await salvaCache()
}

/** Voce per la lista della spesa: porta con sé foto e nota, così al supermercato si vede quale prodotto prendere. */
export const voceDaPreferito = (p: Preferito): VoceNuova => ({
  nome: p.nome,
  quantita: [],
  reparto: p.reparto,
  qb: false,
  ...(p.foto ? { foto: p.foto } : {}),
  ...(p.nota ? { nota: p.nota } : {}),
})

/** Il prodotto "Ci piace" con questo nome, se c'è (per dare la foto anche alle voci scritte a mano). */
export const preferitoPerNome = (elenco: Preferito[], nome: string) => elenco.find((p) => chiave(p.nome) === chiave(nome))

const senzaAccenti = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export function filtraPreferiti(elenco: Preferito[], testo: string): Preferito[] {
  const parole = senzaAccenti(testo).split(/\s+/).filter(Boolean)
  if (!parole.length) return elenco
  return elenco.filter((p) => {
    const pagliaio = senzaAccenti(`${p.nome} ${p.nota} ${p.reparto}`)
    return parole.every((x) => pagliaio.includes(x))
  })
}
