<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { promemoriaDiOggi, consigliPasto, type Consiglio } from '../lib/conservazione'
import { aggiungiGiorni, MOMENTI, oggi, ordina, titoloGiorno, type Momento, type Pasto } from '../lib/piano'
import { aggiornaRicettario, ricettario } from '../lib/ricette'
import { avviaControllo, caricaLocale, eliminaPasto, modificaPasto, piano, segnaFatto, segnaInLista, testoStato, vista } from '../lib/settimana'

const giorniVisibili = ref(14)
const aperto = ref<string | null>(null)
const bozza = ref({ data: '', momento: 'cena' as Momento })
const oggiData = ref(oggi())
let ferma: (() => void) | undefined

function aggiornaOggi() {
  // l'app resta aperta anche per giorni: "oggi" va ricalcolato quando si torna a guardarla
  if (document.visibilityState === 'visible') oggiData.value = oggi()
}

onMounted(async () => {
  await caricaLocale()
  ferma = avviaControllo(8000)
  if (!ricettario.caricato) void aggiornaRicettario()
  document.addEventListener('visibilitychange', aggiornaOggi)
})
onUnmounted(() => {
  ferma?.()
  document.removeEventListener('visibilitychange', aggiornaOggi)
})

const ricette = computed(() => new Map(ricettario.ricette.map((r) => [r.id, r])))

const giorni = computed(() => Array.from({ length: giorniVisibili.value }, (_, n) => aggiungiGiorni(oggiData.value, n)))
const ultimoGiorno = computed(() => giorni.value.at(-1)!)

/** "2026-11-16|cena" → pasti */
const perCasella = computed(() => {
  const m = new Map<string, Pasto[]>()
  for (const p of ordina(vista.value.pasti)) {
    const k = `${p.data}|${p.momento}`
    m.set(k, [...(m.get(k) ?? []), p])
  }
  return m
})

const pastiOltre = computed(() => vista.value.pasti.filter((p) => p.data > ultimoGiorno.value).length)

const daFare = computed(() => promemoriaDiOggi(vista.value.pasti, ricettario.ricette, oggiData.value))

/** Ingredienti da congelare per un pasto già in lista (icona ❄ sulla scheda). */
function daCongelare(p: Pasto): Consiglio[] {
  if (!p.spesa_il || !p.ricetta) return []
  return consigliPasto(p, ricette.value.get(p.ricetta), p.spesa_il, oggiData.value).filter((c) => c.tipo === 'congela')
}

const nonInLista = computed(
  () => vista.value.pasti.filter((p) => p.ricetta && !p.spesa_il && p.data >= oggiData.value && p.data <= aggiungiGiorni(oggiData.value, 6)).length,
)

function apri(p: Pasto) {
  if (aperto.value === p.id) {
    aperto.value = null
    return
  }
  aperto.value = p.id
  bozza.value = { data: p.data, momento: p.momento }
}

function sposta(p: Pasto) {
  if (bozza.value.data && (bozza.value.data !== p.data || bozza.value.momento !== p.momento)) {
    modificaPasto(p, { data: bozza.value.data, momento: bozza.value.momento })
  }
  aperto.value = null
}

function cambiaPorzioni(p: Pasto, delta: number) {
  const attuali = p.porzioni ?? ricette.value.get(p.ricetta ?? '')?.porzioni ?? 2
  modificaPasto(p, { porzioni: Math.max(1, attuali + delta) })
}

function togli(p: Pasto) {
  eliminaPasto(p)
  aperto.value = null
}

const maiuscola = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const ICONE: Record<string, string> = { congela: '❄', scongela: '🧊' }
const ETICHETTE: Record<string, string> = { colazione: 'Colazione', pranzo: 'Pranzo', cena: 'Cena' }
</script>

<template>
  <div class="intestazione">
    <h1>Settimana</h1>
    <span class="etichetta" :class="{ avviso: piano.stato === 'offline' || piano.coda.length, errore: piano.stato === 'errore' }">
      {{ testoStato }}
    </span>
  </div>
  <div v-if="piano.stato === 'errore'" class="messaggio errore">
    {{ piano.errore }} Le modifiche restano sul telefono e riprovo da solo.
  </div>

  <div class="azioni" style="margin-top: 0">
    <RouterLink to="/settimana/spesa" class="pulsante-link">
      🛒 Fai la spesa{{ nonInLista ? ` · ${nonInLista} ${nonInLista === 1 ? 'pasto' : 'pasti'} da comprare` : '' }}
    </RouterLink>
  </div>

  <section v-if="daFare.length" class="scheda-box da-fare">
    <h2>Da fare oggi</h2>
    <p class="tenue" style="margin: 0">Tocca quando è fatto.</p>
    <button
      v-for="c in daFare"
      :key="`${c.pasto.id}-${c.promemoria}`"
      class="spunta-voce"
      role="checkbox"
      :aria-checked="false"
      @click="segnaFatto(c.pasto, c.promemoria, true)"
    >
      <span class="cerchio" aria-hidden="true"></span>
      <span class="nome-voce">
        <span class="titolo-voce">{{ ICONE[c.tipo] }} {{ maiuscola(c.ingrediente) }}</span>
        <span class="tenue" style="display: block">{{ c.testo }}</span>
      </span>
    </button>
  </section>

  <p v-if="!piano.pronta" class="tenue">Carico…</p>

  <section v-for="g in giorni" :key="g" class="scheda-box compatta giorno" :class="{ oggi: g === oggiData }">
    <h2>{{ titoloGiorno(g, oggiData) }}</h2>
    <template v-for="m in MOMENTI" :key="m">
      <div v-if="perCasella.get(`${g}|${m}`)" class="momento">
        <span class="nome-momento">{{ ETICHETTE[m] }}</span>
        <div class="pasti">
          <template v-for="p in perCasella.get(`${g}|${m}`)" :key="p.id">
            <button class="pasto" :class="{ aperto: aperto === p.id, libero: !p.ricetta }" @click="apri(p)">
              <span class="titolo-voce">{{ ricette.get(p.ricetta ?? '')?.titolo ?? p.titolo }}</span>
              <span class="dettagli-pasto">
                <span v-if="p.ricetta">{{ p.porzioni ?? ricette.get(p.ricetta)?.porzioni ?? '?' }} porz.</span>
                <span v-if="p.spesa_il" class="in-lista">✓ in lista</span>
                <span v-if="daCongelare(p).length">❄ {{ daCongelare(p).map((c) => c.ingrediente).join(', ') }}</span>
              </span>
            </button>
            <div v-if="aperto === p.id" class="modifica-pasto">
              <div class="azioni" style="margin-top: 0">
                <RouterLink v-if="p.ricetta && ricette.get(p.ricetta)" :to="`/ricette/${p.ricetta}`" class="pulsante-link secondario">
                  Apri la ricetta
                </RouterLink>
                <div v-if="p.ricetta" class="contatore" aria-label="Porzioni">
                  <button class="secondario" :disabled="(p.porzioni ?? 2) <= 1" aria-label="Meno porzioni" @click="cambiaPorzioni(p, -1)">−</button>
                  <span>{{ p.porzioni ?? ricette.get(p.ricetta)?.porzioni ?? '?' }} porz.</span>
                  <button class="secondario" aria-label="Più porzioni" @click="cambiaPorzioni(p, 1)">＋</button>
                </div>
              </div>
              <div class="riga-campi">
                <div>
                  <label :for="`d-${p.id}`">Giorno</label>
                  <input :id="`d-${p.id}`" v-model="bozza.data" type="date" />
                </div>
                <div>
                  <label :for="`m-${p.id}`">Pasto</label>
                  <select :id="`m-${p.id}`" v-model="bozza.momento">
                    <option v-for="x in MOMENTI" :key="x" :value="x">{{ ETICHETTE[x] }}</option>
                  </select>
                </div>
              </div>
              <p v-if="p.spesa_il" class="tenue" style="margin: 10px 0 0">
                Ingredienti già in lista per la spesa di {{ titoloGiorno(p.spesa_il, oggiData).toLowerCase() }}.
                <button class="link" @click="segnaInLista([p], null)">Non li abbiamo comprati</button>
              </p>
              <div class="azioni">
                <button @click="sposta(p)">Salva</button>
                <button class="pericolo" @click="togli(p)">Togli dal piano</button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </template>
    <div class="aggiungi-momenti">
      <RouterLink
        v-for="m in MOMENTI"
        :key="m"
        :to="{ path: '/settimana/aggiungi', query: { data: g, momento: m } }"
        class="chip"
        :aria-label="`Aggiungi a ${titoloGiorno(g, oggiData)}, ${m}`"
      >
        ＋ {{ ETICHETTE[m] }}
      </RouterLink>
    </div>
  </section>

  <div class="azioni">
    <button class="secondario" @click="giorniVisibili += 7">
      Mostra altri 7 giorni{{ pastiOltre ? ` (${pastiOltre} ${pastiOltre === 1 ? 'pasto' : 'pasti'} più avanti)` : '' }}
    </button>
  </div>
</template>
