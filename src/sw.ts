/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { salvaCondiviso, type ImmagineCondivisa } from './lib/condivisi'

declare let self: ServiceWorkerGlobalScope

self.skipWaiting()
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Menu "Condividi" di Android: arriva un POST multipart su <scope>condividi.
// Salviamo quello che è arrivato in IndexedDB e apriamo la schermata di import.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'POST' || !url.pathname.endsWith('/condividi')) return

  event.respondWith(
    (async () => {
      const form = await event.request.formData()
      const testo = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '')
      const immagini: ImmagineCondivisa[] = []
      for (const voce of form.getAll('immagini')) {
        if (voce instanceof File && voce.size > 0) {
          immagini.push({ nome: voce.name, tipo: voce.type || 'image/jpeg', dati: await voce.arrayBuffer() })
        }
      }
      const id = await salvaCondiviso({
        titolo: testo(form.get('title')),
        testo: testo(form.get('text')),
        url: testo(form.get('url')),
        immagini,
      })
      return Response.redirect(`${self.registration.scope}#/importa/${id}`, 303)
    })(),
  )
})
