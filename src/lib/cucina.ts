// Modalità cucina: schermo sempre acceso e spunte su ingredienti e passaggi già fatti.
// Le spunte restano finché l'app è aperta (si può andare alla lista e tornare), non vengono salvate su GitHub.
import { reactive } from 'vue'

const fatti = reactive<Record<string, string[]>>({})

export const eFatto = (ricetta: string, chiave: string) => fatti[ricetta]?.includes(chiave) ?? false
export const quantiFatti = (ricetta: string) => fatti[ricetta]?.length ?? 0

export function alterna(ricetta: string, chiave: string) {
  const elenco = fatti[ricetta] ?? []
  fatti[ricetta] = elenco.includes(chiave) ? elenco.filter((k) => k !== chiave) : [...elenco, chiave]
}

export function ricomincia(ricetta: string) {
  delete fatti[ricetta]
}

// --- schermo acceso (Screen Wake Lock: Chrome per Android lo supporta) ---

let blocco: WakeLockSentinel | null = null
let voluto = false

async function chiedi(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return false
  try {
    blocco = await navigator.wakeLock.request('screen')
    return true
  } catch {
    return false
  }
}

/** Accende o spegne il blocco dello schermo; restituisce false se il telefono non lo permette. */
export async function schermoAcceso(acceso: boolean): Promise<boolean> {
  voluto = acceso
  if (acceso) return chiedi()
  const b = blocco
  blocco = null
  await b?.release().catch(() => {})
  return true
}

// Il sistema toglie il blocco quando si cambia app: lo si richiede al ritorno
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (voluto && document.visibilityState === 'visible' && (!blocco || blocco.released)) void chiedi()
  })
}
