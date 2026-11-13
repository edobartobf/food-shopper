// Carrello Conad: il carrello lo riempie Claude (skill .claude/skills/carrello-conad), che ricorda in
// conad/abbinamenti.json quale prodotto Conad usa per ogni voce. All'app serve solo sapere quali voci online non ci
// sono, per segnarle in lista: quelle si prendono a parte.
import { get, set } from 'idb-keyval'
import { reactive } from 'vue'
import { leggiJson } from './github'
import { chiave } from './lista'

interface Abbinamenti {
  non_online?: Record<string, { nome: string; visto_il: string }>
}

const CHIAVE_CACHE = 'cache:conad-non-online'

export const conad = reactive({ nonOnline: [] as string[] })

let caricato = false

/** Legge gli abbinamenti una volta per sessione; senza rete resta la copia sul telefono. */
export async function aggiornaConad(): Promise<void> {
  if (caricato) return
  try {
    const salvati = await get<string[]>(CHIAVE_CACHE)
    if (salvati && !conad.nonOnline.length) conad.nonOnline = salvati
  } catch {
    /* niente copia locale */
  }
  try {
    const file = await leggiJson<Abbinamenti>('conad/abbinamenti.json')
    conad.nonOnline = Object.keys(file?.dati.non_online ?? {})
    caricato = true
    await set(CHIAVE_CACHE, [...conad.nonOnline])
  } catch {
    /* offline o senza token: va bene la copia */
  }
}

export const nonSuConad = (nome: string) => conad.nonOnline.includes(chiave(nome))
