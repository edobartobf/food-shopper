// Impostazioni del telefono: token GitHub, repo dei dati, nome di chi usa l'app.
// Restano solo su questo telefono (localStorage).
import { computed, reactive, watch } from 'vue'

export const REPO_PREDEFINITO = 'edobartobf/food-shopper-data'
const CHIAVE = 'dispensa:impostazioni'

interface Impostazioni {
  token: string
  repo: string
  nome: string
}

function carica(): Impostazioni {
  try {
    const salvate = JSON.parse(localStorage.getItem(CHIAVE) ?? '{}')
    return { token: '', repo: REPO_PREDEFINITO, nome: '', ...salvate }
  } catch {
    return { token: '', repo: REPO_PREDEFINITO, nome: '' }
  }
}

export const impostazioni = reactive<Impostazioni>(carica())

watch(impostazioni, (v) => {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(v))
  } catch {
    /* modalità privata: le impostazioni durano solo questa sessione */
  }
})

export const configurata = computed(() => !!impostazioni.token && !!impostazioni.repo && !!impostazioni.nome)

/** Link da aprire sull'altro telefono: il token sta dopo il "#", quindi non arriva a nessun server. */
export function linkConfigurazione(): string {
  const base = `${location.origin}${import.meta.env.BASE_URL}`
  const q = new URLSearchParams({ t: impostazioni.token, r: impostazioni.repo })
  return `${base}#/configura?${q}`
}
