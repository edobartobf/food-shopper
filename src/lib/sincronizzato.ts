// Un file JSON del repo dati modificato da due telefoni insieme (lista della spesa, piano dei pasti).
//
// - "base" è l'ultima versione letta da GitHub; "coda" sono le operazioni fatte su questo telefono e non ancora salvate.
// - Quello che si vede è base + coda: funziona anche offline.
// - Per salvare si rilegge GitHub, si riapplica la coda sulla versione appena letta e si scrive con lo sha:
//   se nel frattempo l'altro telefono ha salvato, GitHub rifiuta e si riprova sulla versione nuova.
import { get, set } from 'idb-keyval'
import { computed, reactive, type ComputedRef } from 'vue'
import { ErroreGitHub, leggiJson, leggiJsonSeCambiato, scriviJson } from './github'
import { impostazioni } from './impostazioni'
import { nuovoId } from './condivisi'

export interface Documento {
  /** id delle ultime operazioni applicate: evita di applicarne una due volte */
  ops_applicate?: string[]
}

export type OperazioneBase = { id: string; autore: string }

interface Configurazione<D extends Documento, O extends OperazioneBase> {
  percorso: string
  chiaveLocale: string
  vuoto: () => D
  applicaTutte: (doc: D, ops: O[]) => D
  /** messaggio del commit */
  descrivi: (ops: O[]) => string
}

export interface StatoDocumento<D, O> {
  base: D
  sha: string | null
  etag: string | null
  coda: O[]
  stato: 'ok' | 'invio' | 'offline' | 'errore'
  errore: string
  pronta: boolean
}

export interface DocumentoSincronizzato<D extends Documento, O extends OperazioneBase> {
  stato: StatoDocumento<D, O>
  vista: ComputedRef<D>
  caricaLocale: () => Promise<void>
  sincronizza: () => Promise<void>
  /** Mette in coda un'operazione (id e autore li aggiunge da sé) e prova a salvarla. */
  esegui: (op: Record<string, unknown>) => void
  /** Da chiamare quando si apre la schermata; restituisce la funzione per fermare il controllo. */
  avviaControllo: (ogniMs?: number) => () => void
  testoStato: ComputedRef<string>
}

export function documentoSincronizzato<D extends Documento, O extends OperazioneBase>(
  cfg: Configurazione<D, O>,
): DocumentoSincronizzato<D, O> {
  interface StatoSalvato {
    repo: string
    base: D
    sha: string | null
    etag: string | null
    coda: O[]
  }

  const stato = reactive({
    base: cfg.vuoto(),
    sha: null,
    etag: null,
    coda: [],
    stato: 'ok',
    errore: '',
    pronta: false,
  }) as StatoDocumento<D, O>

  const vista = computed(() => cfg.applicaTutte(stato.base, stato.coda))

  let caricamento: Promise<void> | null = null

  /** Carica la copia salvata sul telefono (una volta sola). */
  function caricaLocale(): Promise<void> {
    caricamento ??= (async () => {
      try {
        const s = await get<StatoSalvato>(cfg.chiaveLocale)
        if (s && s.repo === impostazioni.repo) Object.assign(stato, { base: s.base, sha: s.sha, etag: s.etag, coda: s.coda })
      } catch {
        /* IndexedDB non disponibile: si parte da GitHub */
      }
      stato.pronta = true
    })()
    return caricamento
  }

  async function salvaLocale() {
    try {
      const s: StatoSalvato = { repo: impostazioni.repo, base: stato.base, sha: stato.sha, etag: stato.etag, coda: stato.coda }
      await set(cfg.chiaveLocale, JSON.parse(JSON.stringify(s)))
    } catch {
      /* pazienza */
    }
  }

  function gestisciErrore(e: unknown) {
    if (e instanceof ErroreGitHub && e.stato === 0) {
      stato.stato = 'offline'
      stato.errore = ''
    } else {
      stato.stato = 'errore'
      stato.errore = e instanceof Error ? e.message : String(e)
    }
  }

  let inCorso = false
  let ripeti = false

  /** Salva la coda su GitHub, unendola alla versione più recente. */
  async function sincronizza(): Promise<void> {
    if (inCorso) {
      ripeti = true
      return
    }
    inCorso = true
    try {
      do {
        ripeti = false
        await caricaLocale()
        if (!stato.coda.length) {
          await scaricaSeCambiato()
          continue
        }
        stato.stato = 'invio'
        for (let tentativo = 0; ; tentativo++) {
          // Primo tentativo sulla versione che conosciamo già (una richiesta in meno); se è cambiata, si rilegge
          const remoto = tentativo === 0 && stato.sha ? { dati: stato.base, sha: stato.sha } : await leggiJson<D>(cfg.percorso)
          const daInviare = [...stato.coda]
          const nuovo = cfg.applicaTutte(remoto?.dati ?? cfg.vuoto(), daInviare)
          try {
            const sha = await scriviJson(cfg.percorso, nuovo, cfg.descrivi(daInviare), remoto?.sha)
            stato.base = nuovo
            stato.sha = sha
            stato.etag = null
            // le operazioni fatte mentre si salvava restano in coda per il giro dopo
            stato.coda = stato.coda.filter((o) => !daInviare.includes(o))
            if (stato.coda.length) ripeti = true
            break
          } catch (e) {
            if (!(e instanceof ErroreGitHub && e.conflitto) || tentativo >= 5) throw e
            // l'altro telefono ha salvato nel frattempo: si riprova sulla sua versione
            await new Promise((r) => setTimeout(r, 300 + Math.random() * 700))
          }
        }
        stato.stato = 'ok'
        stato.errore = ''
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

  /** Controllo leggero: scarica il file solo se l'altro telefono l'ha cambiato. */
  async function scaricaSeCambiato() {
    const r = await leggiJsonSeCambiato<D>(cfg.percorso, stato.etag)
    // Subito dopo un salvataggio GitHub può restituire per qualche secondo la versione precedente:
    // se non contiene l'ultima operazione che conosciamo, è vecchia e la ignoriamo.
    const ultima = stato.base.ops_applicate?.at(-1)
    // (dopo qualche controllo la si accetta comunque: es. file sistemato a mano su GitHub)
    const vecchia = r.cambiato && r.file && ultima && !(r.file.dati.ops_applicate ?? []).includes(ultima) && ++scartate <= 3
    if (r.cambiato && !vecchia) {
      scartate = 0
      stato.base = r.file?.dati ?? cfg.vuoto()
      stato.sha = r.file?.sha ?? null
      stato.etag = r.etag
      await salvaLocale()
    }
    stato.stato = 'ok'
    stato.errore = ''
  }

  function esegui(op: Record<string, unknown>) {
    stato.coda.push({ id: nuovoId(), autore: impostazioni.nome, ...op } as unknown as O)
    void salvaLocale()
    void sincronizza()
  }

  let timer: number | undefined
  let attivi = 0

  function controlla() {
    if (document.visibilityState === 'visible') void sincronizza()
  }

  function avviaControllo(ogniMs = 5000): () => void {
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

  // le modifiche fatte offline partono appena torna la rete, anche se la schermata non è aperta
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      if (stato.coda.length) void sincronizza()
    })
  }

  const testoStato = computed(() => {
    const n = stato.coda.length
    if (stato.stato === 'invio') return 'Salvo…'
    if (stato.stato === 'offline') return n ? `Offline · ${n} ${n === 1 ? 'modifica' : 'modifiche'} da inviare` : 'Offline'
    if (stato.stato === 'errore') return 'Non salvata'
    return n ? 'Salvo…' : 'Aggiornata'
  })

  return { stato, vista, caricaLocale, sincronizza, esegui, avviaControllo, testoStato }
}
