import { createRouter, createWebHashHistory } from 'vue-router'
import { configurata } from './lib/impostazioni'

export const router = createRouter({
  // Hash: GitHub Pages non sa servire index.html per percorsi come /food-shopper/ricette/123
  history: createWebHashHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    { path: '/', redirect: '/ricette' },
    { path: '/ricette', component: () => import('./views/RicetteView.vue') },
    { path: '/ricette/nuova', component: () => import('./views/ModificaRicettaView.vue') },
    { path: '/ricette/:id', component: () => import('./views/RicettaView.vue') },
    { path: '/ricette/:id/modifica', component: () => import('./views/ModificaRicettaView.vue') },
    { path: '/settimana', component: () => import('./views/SettimanaView.vue') },
    { path: '/settimana/aggiungi', component: () => import('./views/AggiungiPastoView.vue') },
    { path: '/settimana/spesa', component: () => import('./views/SpesaSettimanaView.vue') },
    { path: '/spesa', component: () => import('./views/SpesaView.vue') },
    { path: '/spesa/ricette', component: () => import('./views/ScegliRicetteView.vue') },
    { path: '/preferiti', component: () => import('./views/PreferitiView.vue') },
    { path: '/preferiti/nuovo', component: () => import('./views/ModificaPreferitoView.vue') },
    { path: '/preferiti/:id', component: () => import('./views/ModificaPreferitoView.vue') },
    { path: '/importa/:id?', component: () => import('./views/ImportaView.vue') },
    { path: '/impostazioni', component: () => import('./views/ImpostazioniView.vue') },
    { path: '/configura', component: () => import('./views/ConfiguraView.vue') },
  ],
})

router.beforeEach((to) => {
  const libere = ['/impostazioni', '/configura']
  if (!configurata.value && !libere.includes(to.path)) {
    return { path: '/impostazioni', query: { poi: to.fullPath } }
  }
})
