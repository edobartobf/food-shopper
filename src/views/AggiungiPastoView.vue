<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { aggiungiGiorni, giornoBreve, MOMENTI, oggi, quandoPasto, titoloGiorno, type Momento } from '../lib/piano'
import { aggiornaRicettario, filtraRicette, ricettario } from '../lib/ricette'
import { aggiungiPasto, caricaLocale } from '../lib/settimana'

const route = useRoute()
const router = useRouter()

const q = (nome: string) => (typeof route.query[nome] === 'string' ? (route.query[nome] as string) : '')
const valido = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d)

const data = ref(valido(q('data')) ? q('data') : oggi())
const momento = ref<Momento>(MOMENTI.includes(q('momento') as Momento) ? (q('momento') as Momento) : 'cena')
const ricettaScelta = ref<string | null>(q('ricetta') || null)
const porzioni = ref(Number(q('porzioni')) > 0 ? Number(q('porzioni')) : 2)
const cerca = ref('')
const aMano = ref('')

onMounted(() => {
  void caricaLocale()
  if (!ricettario.caricato) void aggiornaRicettario()
})

const prossimiGiorni = computed(() => Array.from({ length: 7 }, (_, n) => aggiungiGiorni(oggi(), n)))
const risultati = computed(() => filtraRicette(ricettario.ricette, cerca.value, []))
const scelta = computed(() => ricettario.ricette.find((r) => r.id === ricettaScelta.value))
const pronto = computed(() => !!data.value && (!!scelta.value || !!aMano.value.trim()))
const ETICHETTE: Record<Momento, string> = { colazione: 'Colazione', pranzo: 'Pranzo', cena: 'Cena' }

function scegli(id: string) {
  ricettaScelta.value = ricettaScelta.value === id ? null : id
  aMano.value = ''
}

function aggiungi() {
  if (!pronto.value) return
  if (scelta.value) {
    aggiungiPasto({ data: data.value, momento: momento.value, ricetta: scelta.value.id, titolo: scelta.value.titolo, porzioni: porzioni.value })
  } else {
    aggiungiPasto({ data: data.value, momento: momento.value, ricetta: null, titolo: aMano.value.trim(), porzioni: null })
  }
  // tornando indietro si ritrova la settimana dove la si era lasciata
  if (window.history.state?.back?.startsWith('/settimana')) router.back()
  else router.replace('/settimana')
}
</script>

<template>
  <RouterLink to="/settimana" class="indietro">‹ Settimana</RouterLink>
  <h1>Cosa mangiate?</h1>

  <div class="chips" role="group" aria-label="Giorno">
    <button v-for="g in prossimiGiorni" :key="g" class="chip" :class="{ attivo: data === g }" @click="data = g">
      {{ giornoBreve(g) }}
    </button>
  </div>
  <div v-if="!prossimiGiorni.includes(data)" class="tenue" style="margin-bottom: 8px">{{ titoloGiorno(data) }}</div>
  <label for="altro-giorno" class="tenue" style="font-weight: 500; margin-top: 0">Un altro giorno</label>
  <input id="altro-giorno" v-model="data" type="date" />

  <div class="chips" role="group" aria-label="Pasto" style="margin-top: 12px">
    <button v-for="m in MOMENTI" :key="m" class="chip" :class="{ attivo: momento === m }" @click="momento = m">{{ ETICHETTE[m] }}</button>
  </div>

  <h2>Ricetta</h2>
  <div v-if="scelta" class="scheda-box compatta scelta-ricetta scelta">
    <button class="spunta-voce" role="checkbox" aria-checked="true" @click="ricettaScelta = null">
      <span class="cerchio" aria-hidden="true">✓</span>
      <span class="nome-voce"><span class="titolo-voce">{{ scelta.titolo }}</span></span>
    </button>
    <div class="contatore" aria-label="Porzioni">
      <button class="secondario" :disabled="porzioni <= 1" aria-label="Meno porzioni" @click="porzioni--">−</button>
      <span>{{ porzioni }} porz.</span>
      <button class="secondario" aria-label="Più porzioni" @click="porzioni++">＋</button>
    </div>
  </div>

  <template v-else>
    <input v-model="cerca" type="search" class="cerca" placeholder="Cerca una ricetta" aria-label="Cerca una ricetta" />
    <p v-if="!ricettario.caricato" class="tenue">Carico il ricettario…</p>
    <div class="elenco-scelta">
      <button v-for="r in risultati" :key="r.id" class="scheda-box compatta riga-ricetta" @click="scegli(r.id)">
        <span class="titolo-voce">{{ r.titolo }}</span>
        <span v-if="r.tempo_minuti" class="tenue"> · {{ r.tempo_minuti }} min</span>
      </button>
      <p v-if="ricettario.caricato && !risultati.length" class="tenue">Nessuna ricetta trovata.</p>
    </div>

    <label for="a-mano">Oppure scrivilo tu</label>
    <input id="a-mano" v-model="aMano" placeholder="es. pizza fuori, avanzi, dai genitori" enterkeyhint="done" @keydown.enter="aggiungi" />
    <p class="tenue" style="margin-top: 6px">Senza ricetta non aggiunge niente alla spesa: serve solo a ricordare.</p>
  </template>

  <div class="azioni barra-salva">
    <button :disabled="!pronto" @click="aggiungi">
      {{ pronto ? `Aggiungi a ${quandoPasto({ data, momento })}` : 'Scegli una ricetta o scrivi cosa mangiate' }}
    </button>
  </div>
</template>
