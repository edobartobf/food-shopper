// Foto scattate o scelte dal telefono, salvate nel repo dati in foto/<id>.jpg.
// Prima di caricarle si riducono (lato lungo 1280 px, JPEG): restano sui 150–400 KB.
// Ogni foto vista si tiene anche in IndexedDB, così si vede offline (es. al supermercato senza campo).
import { del, get, set } from 'idb-keyval'
import { bytesInBase64, eliminaFile, leggiFileGrezzo, scriviFile, shaFile } from './github'
import { impostazioni } from './impostazioni'
import { nuovoId } from './condivisi'

const LATO_MASSIMO = 1280
const QUALITA = 0.8

const chiaveLocale = (percorso: string) => `foto:${impostazioni.repo}:${percorso}`

/** Lato lungo al massimo `lato` px, senza ingrandire. */
export function misureRidotte(larghezza: number, altezza: number, lato = LATO_MASSIMO): { larghezza: number; altezza: number } {
  const scala = Math.min(1, lato / Math.max(larghezza, altezza))
  return { larghezza: Math.round(larghezza * scala), altezza: Math.round(altezza * scala) }
}

async function apriImmagine(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    // rispetta la rotazione salvata dalla fotocamera (EXIF)
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      img.src = url
      await img.decode()
      return img
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}

/** Riduce una foto per il caricamento. */
export async function riduciFoto(file: Blob): Promise<Blob> {
  let img: ImageBitmap | HTMLImageElement
  try {
    img = await apriImmagine(file)
  } catch {
    throw new Error('Non riesco a leggere questa immagine: prova con un’altra foto')
  }
  const { larghezza, altezza } = misureRidotte(img.width, img.height)
  const tela = document.createElement('canvas')
  tela.width = larghezza
  tela.height = altezza
  tela.getContext('2d')!.drawImage(img, 0, 0, larghezza, altezza)
  if ('close' in img) img.close()
  const blob = await new Promise<Blob | null>((ok) => tela.toBlob(ok, 'image/jpeg', QUALITA))
  if (!blob) throw new Error('Non riesco a preparare la foto')
  return blob
}

/** Carica una foto già ridotta e restituisce il suo percorso nel repo dati. */
export async function caricaFoto(foto: Blob, descrizione: string): Promise<string> {
  const percorso = `foto/${nuovoId()}.jpg`
  await scriviFile(percorso, bytesInBase64(new Uint8Array(await foto.arrayBuffer())), `Foto: ${descrizione}`)
  await ricorda(percorso, foto)
  return percorso
}

/** Elimina una foto non più usata. Se non ci riesce pazienza: resta solo un file in più nel repo. */
export async function eliminaFoto(percorso: string | null | undefined, descrizione: string): Promise<void> {
  if (!percorso) return
  try {
    const sha = await shaFile(percorso)
    if (sha) await eliminaFile(percorso, sha, `Elimina foto: ${descrizione}`)
    await del(chiaveLocale(percorso))
  } catch {
    /* resta nel repo */
  }
  const url = urlInMemoria.get(percorso)
  if (url) {
    URL.revokeObjectURL(url)
    urlInMemoria.delete(percorso)
  }
}

async function ricorda(percorso: string, foto: Blob) {
  try {
    await set(chiaveLocale(percorso), foto)
  } catch {
    /* IndexedDB non disponibile: si riscarica ogni volta */
  }
}

const urlInMemoria = new Map<string, string>()
const inArrivo = new Map<string, Promise<string | null>>()

/** Indirizzo da mettere in un <img>: dalla copia sul telefono se c'è, altrimenti scaricata da GitHub. null se non c'è. */
export function urlFoto(percorso: string): Promise<string | null> {
  const pronto = urlInMemoria.get(percorso)
  if (pronto) return Promise.resolve(pronto)
  let p = inArrivo.get(percorso)
  if (!p) {
    p = (async () => {
      let foto: Blob | null | undefined
      try {
        foto = await get<Blob>(chiaveLocale(percorso))
      } catch {
        /* IndexedDB non disponibile */
      }
      if (!foto) {
        foto = await leggiFileGrezzo(percorso)
        if (!foto) return null
        await ricorda(percorso, foto)
      }
      const url = URL.createObjectURL(foto)
      urlInMemoria.set(percorso, url)
      return url
    })().finally(() => inArrivo.delete(percorso))
    inArrivo.set(percorso, p)
  }
  return p
}

/** Scarica in anticipo le foto che potrebbero servire offline (pochi alla volta). */
export async function preparaOffline(percorsi: string[]): Promise<void> {
  const daFare = [...new Set(percorsi)]
  const lavoratori = Array.from({ length: 3 }, async () => {
    for (let p = daFare.shift(); p; p = daFare.shift()) {
      try {
        if (!(await get(chiaveLocale(p)))) await urlFoto(p)
      } catch {
        /* offline o foto sparita: si riprova la prossima volta */
      }
    }
  })
  await Promise.all(lavoratori)
}
