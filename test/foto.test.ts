import { describe, expect, it } from 'vitest'
import { misureRidotte } from '../src/lib/foto'
import { applica, listaVuota, type Operazione } from '../src/lib/lista'
import { filtraPreferiti, normalizzaPreferito, preferitoPerNome, voceDaPreferito } from '../src/lib/preferiti'

let n = 0
const op = (o: Record<string, unknown>) => ({ id: `f${++n}`, autore: 'Edo', ...o }) as Operazione

describe('misureRidotte', () => {
  it('riduce il lato lungo a 1280 mantenendo le proporzioni', () => {
    expect(misureRidotte(4000, 3000)).toEqual({ larghezza: 1280, altezza: 960 })
    expect(misureRidotte(3000, 4000)).toEqual({ larghezza: 960, altezza: 1280 })
  })
  it('non ingrandisce le foto piccole', () => {
    expect(misureRidotte(800, 600)).toEqual({ larghezza: 800, altezza: 600 })
  })
})

describe('prodotti "Ci piace" nella lista', () => {
  const pesto = normalizzaPreferito({ id: 'p1', nome: 'Pesto Rana', nota: 'senza aglio', reparto: 'latticini e uova', foto: 'foto/a.jpg' })

  it('la voce aggiunta porta foto, nota e reparto', () => {
    const l = applica(listaVuota(), op({ tipo: 'aggiungi', voci: [voceDaPreferito(pesto)] }))
    expect(l.voci[0]).toMatchObject({ nome: 'Pesto Rana', foto: 'foto/a.jpg', nota: 'senza aglio', reparto: 'latticini e uova', quantita: [] })
  })

  it('una voce già in lista prende la foto senza perdere la sua nota', () => {
    let l = applica(listaVuota(), op({ tipo: 'aggiungi', voci: [{ nome: 'pesto rana', quantita: [], reparto: 'altro', qb: false, nota: 'due vasetti' }] }))
    l = applica(l, op({ tipo: 'aggiungi', voci: [voceDaPreferito(pesto)] }))
    expect(l.voci).toHaveLength(1)
    expect(l.voci[0]).toMatchObject({ foto: 'foto/a.jpg', nota: 'due vasetti' })
  })

  it('senza foto la voce resta come prima', () => {
    const l = applica(listaVuota(), op({ tipo: 'aggiungi', voci: [voceDaPreferito(normalizzaPreferito({ nome: 'Yogurt' }))] }))
    expect(l.voci[0]).not.toHaveProperty('foto')
    expect(l.voci[0]).not.toHaveProperty('nota')
  })

  it('riconosce il prodotto dal nome scritto a mano', () => {
    expect(preferitoPerNome([pesto], '  pesto  RANA ')?.id).toBe('p1')
    expect(preferitoPerNome([pesto], 'pesto')).toBeUndefined()
  })

  it('cerca in nome, nota e reparto, senza badare agli accenti', () => {
    const caffe = normalizzaPreferito({ nome: 'Caffè Lavazza', reparto: 'dispensa' })
    expect(filtraPreferiti([pesto, caffe], 'caffe').map((p) => p.nome)).toEqual(['Caffè Lavazza'])
    expect(filtraPreferiti([pesto, caffe], 'aglio').map((p) => p.nome)).toEqual(['Pesto Rana'])
  })
})
