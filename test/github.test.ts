import { afterEach, describe, expect, it, vi } from 'vitest'
import { leggiJsonSeCambiato } from '../src/lib/github'
import { impostazioni } from '../src/lib/impostazioni'

describe('leggiJsonSeCambiato', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('una risposta 304 vuol dire "non cambiato", non è un errore', async () => {
    impostazioni.token = 'prova'
    const fetchFinto = vi.fn(async () => new Response(null, { status: 304 }))
    vi.stubGlobal('fetch', fetchFinto)
    await expect(leggiJsonSeCambiato('spesa/lista.json', '"abc"')).resolves.toEqual({ cambiato: false })
    const init = fetchFinto.mock.calls[0]![1] as RequestInit
    expect((init.headers as Record<string, string>)['If-None-Match']).toBe('"abc"')
  })
})
