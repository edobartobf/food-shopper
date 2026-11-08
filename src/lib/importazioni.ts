// Richieste di import: l'app le scrive in importazioni/, la Action del repo dati le trasforma in ricette.
import { bytesInBase64, elencaCartella, eliminaFile, leggiJson, scriviFile, scriviJson } from './github'
import { impostazioni } from './impostazioni'
import { nuovoId, tipoFonte, type ImmagineCondivisa, type TipoFonte } from './condivisi'

export interface Importazione {
  id: string
  stato: 'in_attesa' | 'in_corso' | 'errore'
  fonte: TipoFonte
  url: string
  testo: string
  allegati: string[]
  creata_da: string
  creata_il: string
  errore: string | null
  /** se la ricetta c'era già */
  ricetta_id?: string | null
}

const ESTENSIONI: Record<string, string> = { 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }

export async function creaImportazione(url: string, testo: string, immagini: ImmagineCondivisa[]): Promise<Importazione> {
  const id = `imp-${nuovoId()}`
  const allegati: string[] = []
  for (const [i, img] of immagini.entries()) {
    const percorso = `allegati/${id}-${i + 1}.${ESTENSIONI[img.tipo] ?? 'jpg'}`
    await scriviFile(percorso, bytesInBase64(new Uint8Array(img.dati)), `Screenshot per ${id}`)
    allegati.push(percorso)
  }
  const imp: Importazione = {
    id,
    stato: 'in_attesa',
    fonte: tipoFonte(url, immagini.length > 0),
    url,
    testo,
    allegati,
    creata_da: impostazioni.nome,
    creata_il: new Date().toISOString(),
    errore: null,
  }
  // Questo commit fa partire la Action di import nel repo dati
  await scriviJson(`importazioni/${id}.json`, imp, `Importa ${url || imp.fonte}`)
  return imp
}

export async function elencaImportazioni(): Promise<Importazione[]> {
  const voci = (await elencaCartella('importazioni')).filter((v) => v.type === 'file' && v.name.endsWith('.json'))
  const file = await Promise.all(voci.map((v) => leggiJson<Importazione>(v.path)))
  return file
    .filter((f): f is NonNullable<typeof f> => f !== null)
    .map((f) => f.dati)
    .sort((a, b) => b.creata_il.localeCompare(a.creata_il))
}

/** Rimette in coda una richiesta non riuscita: la Action riparte. */
export async function riprovaImportazione(imp: Importazione): Promise<void> {
  const file = await leggiJson<Importazione>(`importazioni/${imp.id}.json`)
  if (!file) return
  await scriviJson(
    `importazioni/${imp.id}.json`,
    { ...file.dati, stato: 'in_attesa', errore: null, ricetta_id: null },
    `Riprova import ${imp.url || imp.fonte}`,
    file.sha,
  )
}

/** Toglie una richiesta (e i suoi screenshot) dall'elenco. */
export async function togliImportazione(imp: Importazione): Promise<void> {
  for (const a of imp.allegati) {
    const voce = (await elencaCartella('allegati')).find((v) => v.path === a)
    if (voce) await eliminaFile(voce.path, voce.sha, `Togli screenshot di ${imp.id}`)
  }
  const file = await leggiJson<Importazione>(`importazioni/${imp.id}.json`)
  if (file) await eliminaFile(`importazioni/${imp.id}.json`, file.sha, `Togli import ${imp.url || imp.fonte}`)
}
