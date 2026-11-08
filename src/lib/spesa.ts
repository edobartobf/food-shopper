// Sincronizzazione della lista della spesa (spesa/attuale.json) tra i telefoni.
//
// - "base" è l'ultima versione letta da GitHub; "coda" sono le operazioni fatte su questo telefono e non ancora salvate.
// - Quello che si vede è base + coda: funziona anche offline.
// - Per salvare si rilegge GitHub, si riapplica la coda sulla versione appena letta e si scrive con lo sha:
//   se nel frattempo l'altro telefono ha salvato, GitHub rifiuta e si riprova sulla versione nuova.
import { get, set } from 'idb-keyval'
import { computed, reactive } from 'vue'
import { ErroreGitHub, leggiJson, leggiJsonSeCambiato, scriviJson } from './github'
import { impostazioni } from './impostazioni'
import { nuovoId } from './condivisi'
import { applicaTutte, chiave, listaVuota, type Lista, type Operazione, type Voce, type VoceNuova } from './lista'

const PERCORSO = 'spesa/attuale.json'
const CHIAVE_LOCALE = 'spesa:stato'

interface StatoSalvato {
  repo: string
  base: Lista
  sha: string | null
  etag: string | null
  coda: Operazione[]
}

export const spesa = reactive({
  base: listaVuota(),
  sha: null as string | null,
  etag: null as string | null,
  coda: [] as Operazione[],
  stato: 'ok' as 'ok' | 'invio' | 'offline' | 'errore',
  errore: '',
  pronta: false,
})

export const vista = computed(() => applicaTutte(spesa.base, spesa.coda))

let caricamento: Promise<void> | null = null

/** Carica la copia salvata sul telefono (una volta sola). */
export function caricaLocale(): Promise<void> {
  caricamento ??= (async () => {
    try {
      const s = await get<StatoSalvato>(CHIAVE_LOCALE)
      if (s && s.repo === impostazioni.repo) Object.assign(spesa, { base: s.base, sha: s.sha, etag: s.etag, coda: s.coda })
    } catch {
      /* IndexedDB non disponibile: si parte da GitHub */
    }
    spesa.pronta = true
  })()
  return caricamento
}

async function salvaLocale() {
  try {
    await set(
      CHIAVE_LOCALE,
      JSON.parse(JSON.stringify({ repo: impostazioni.repo, base: spesa.base, sha: spesa.sha, etag: spesa.etag, coda: spesa.coda })),
    )
  } catch {
    /* pazienza */
  }
}

function gestisciErrore(e: unknown) {
  if (e instanceof ErroreGitHub && e.stato === 0) {
    spesa.stato = 'offline'
    spesa.errore = ''
  } else {
    spesa.stato = 'errore'
    spesa.errore = e instanceof Error ? e.message : String(e)
  }
}

let inCorso = false
let ripeti = false

/** Salva la coda su GitHub, unendola alla versione più recente. */
export async function sincronizza(): Promise<void> {
  if (inCorso) {
    ripeti = true
    return
  }
  inCorso = true
  try {
    do {
      ripeti = false
      await caricaLocale()
      if (!spesa.coda.length) {
        await scaricaSeCambiata()
        continue
      }
      spesa.stato = 'invio'
      for (let tentativo = 0; ; tentativo++) {
        // Primo tentativo sulla versione che conosciamo già (una richiesta in meno); se è cambiata, si rilegge
        const remoto =
          tentativo === 0 && spesa.sha ? { dati: spesa.base, sha: spesa.sha } : await leggiJson<Lista>(PERCORSO)
        const daInviare = [...spesa.coda]
        const nuova = applicaTutte(remoto?.dati ?? listaVuota(), daInviare)
        try {
          const sha = await scriviJson(PERCORSO, nuova, descrivi(daInviare), remoto?.sha)
          spesa.base = nuova
          spesa.sha = sha
          spesa.etag = null
          // le operazioni fatte mentre si salvava restano in coda per il giro dopo
          spesa.coda = spesa.coda.filter((o) => !daInviare.includes(o))
          if (spesa.coda.length) ripeti = true
          break
        } catch (e) {
          if (!(e instanceof ErroreGitHub && e.conflitto) || tentativo >= 5) throw e
          // l'altro telefono ha salvato nel frattempo: si riprova sulla sua versione
          await new Promise((r) => setTimeout(r, 300 + Math.random() * 700))
        }
      }
      spesa.stato = 'ok'
      spesa.errore = ''
      await salvaLocale()
    } while (ripeti)
  } catch (e) {
    gestisciErrore(e)
    await salvaLocale()
  } finally {
    inCorso = false
  }
}

let scartate = 0

/** Controllo leggero: scarica la lista solo se l'altro telefono l'ha cambiata. */
async function scaricaSeCambiata() {
  const r = await leggiJsonSeCambiato<Lista>(PERCORSO, spesa.etag)
  // Subito dopo un salvataggio GitHub può restituire per qualche secondo la versione precedente:
  // se non contiene l'ultima operazione che conosciamo, è vecchia e la ignoriamo.
  const ultima = spesa.base.ops_applicate?.at(-1)
  // (dopo qualche controllo la si accetta comunque: es. file sistemato a mano su GitHub)
  const vecchia = r.cambiato && r.file && ultima && !(r.file.dati.ops_applicate ?? []).includes(ultima) && ++scartate <= 3
  if (r.cambiato && !vecchia) {
    scartate = 0
    spesa.base = r.file?.dati ?? listaVuota()
    spesa.sha = r.file?.sha ?? null
    spesa.etag = r.etag
    await salvaLocale()
  }
  spesa.stato = 'ok'
  spesa.errore = ''
}

function descrivi(ops: Operazione[]): string {
  if (ops.length === 1) {
    const o = ops[0]!
    if (o.tipo === 'aggiungi') return o.voci.length === 1 ? `Spesa: aggiunto ${o.voci[0]!.nome}` : `Spesa: aggiunte ${o.voci.length} voci`
    if (o.tipo === 'spunta') return `Spesa: ${o.valore ? 'preso' : 'da prendere'} ${o.chiave}`
    if (o.tipo === 'svuota') return o.solo_spuntate ? 'Spesa: tolte le voci prese' : 'Spesa: lista svuotata'
    return `Spesa: ${o.tipo} ${o.chiave}`
  }
  return `Spesa: ${ops.length} modifiche`
}

function esegui(op: Record<string, unknown>) {
  spesa.coda.push({ id: nuovoId(), autore: impostazioni.nome, ...op } as Operazione)
  void salvaLocale()
  void sincronizza()
}

// --- azioni usate dalle schermate ---

export const aggiungiVoci = (voci: VoceNuova[]) => voci.length && esegui({ tipo: 'aggiungi', voci })
const bersaglio = (v: Voce) => ({ voce: v.id, chiave: chiave(v.nome) })
export const spunta = (v: Voce, valore: boolean) => esegui({ tipo: 'spunta', valore, ...bersaglio(v) })
export const modificaVoce = (v: Voce, campi: Partial<Pick<Voce, 'nome' | 'quantita' | 'reparto' | 'qb' | 'nota'>>) =>
  esegui({ tipo: 'modifica', campi, ...bersaglio(v) })
export const eliminaVoce = (v: Voce) => esegui({ tipo: 'elimina', ...bersaglio(v) })
export const svuota = (solo_spuntate: boolean) => esegui({ tipo: 'svuota', solo_spuntate })

// --- controllo periodico mentre la lista è aperta ---

let timer: number | undefined
let attivi = 0

function controlla() {
  if (document.visibilityState === 'visible') void sincronizza()
}

/** Da chiamare quando si apre la schermata della lista; restituisce la funzione per fermare il controllo. */
export function avviaControllo(ogniMs = 5000): () => void {
  attivi++
  if (attivi === 1) {
    timer = window.setInterval(controlla, ogniMs)
    document.addEventListener('visibilitychange', controlla)
    window.addEventListener('online', controlla)
  }
  controlla()
  return () => {
    attivi--
    if (attivi === 0) {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', controlla)
      window.removeEventListener('online', controlla)
    }
  }
}

// le modifiche fatte offline partono appena torna la rete, anche se la lista non è aperta
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (spesa.coda.length) void sincronizza()
  })
}
