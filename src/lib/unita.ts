// Unità di misura: plurali per mostrare le quantità.
const PLURALI: Record<string, string> = {
  cucchiaio: 'cucchiai',
  cucchiaino: 'cucchiaini',
  spicchio: 'spicchi',
  fetta: 'fette',
  mazzetto: 'mazzetti',
  pizzico: 'pizzichi',
  tazza: 'tazze',
  confezione: 'confezioni',
}

/** "2 spicchi", "1 spicchio", "0,5 spicchio" */
export function unitaPerQuantita(unita: string, quantita: number): string {
  return quantita > 1 && PLURALI[unita] ? PLURALI[unita] : unita
}
