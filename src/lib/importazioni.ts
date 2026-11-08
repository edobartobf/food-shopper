// Richieste di import: l'app le scrive in importazioni/, la Action del repo dati le trasforma in ricette.
import { bytesInBase64, elencaCartella, leggiJson, scriviFile, scriviJson } from './github'
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
