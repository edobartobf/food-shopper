<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { aggiornaRicettario, filtraRicette, ricettario, type Ricetta } from '../lib/ricette'
import { aggiungiVoci, caricaLocale } from '../lib/spesa'
import { vociDaRicetta } from '../lib/daRicette'

const router = useRouter()
const cerca = ref('')
/** id ricetta → porzioni scelte */
const scelte = reactive<Record<string, number>>({})

onMounted(() => {
  void caricaLocale()
  if (!ricettario.caricato) void aggiornaRicettario()
})

const risultati = computed(() => filtraRicette(ricettario.ricette, cerca.value, []))
const numeroScelte = computed(() => Object.keys(scelte).length)

function scegli(r: Ricetta) {
  if (scelte[r.id]) delete scelte[r.id]
  else scelte[r.id] = r.porzioni
}

function aggiungi() {
  const voci = ricettario.ricette.filter((r) => scelte[r.id]).flatMap((r) => vociDaRicetta(r, scelte[r.id]!))
  aggiungiVoci(voci)
  router.replace('/spesa')
}
</script>

<template>
  <RouterLink to="/spesa" class="indietro">‹ Spesa</RouterLink>
  <h1>Cosa cucinate?</h1>
  <p class="tenue">Scegli le ricette e le porzioni: gli ingredienti si sommano a quelli già in lista.</p>

  <input v-model="cerca" type="search" class="cerca" placeholder="Cerca una ricetta" aria-label="Cerca una ricetta" />

  <p v-if="!ricettario.caricato" class="tenue">Carico il ricettario…</p>
  <p v-else-if="!ricettario.ricette.length" class="tenue">Il ricettario è vuoto: aggiungi prima qualche ricetta.</p>

  <div v-for="r in risultati" :key="r.id" class="scheda-box compatta scelta-ricetta" :class="{ scelta: scelte[r.id] }">
    <button class="spunta-voce" role="checkbox" :aria-checked="!!scelte[r.id]" @click="scegli(r)">
      <span class="cerchio" aria-hidden="true">{{ scelte[r.id] ? '✓' : '' }}</span>
      <span class="nome-voce">
        <span class="titolo-voce">{{ r.titolo }}</span>
        <span class="tenue" style="display: block">{{ r.ingredienti.length }} ingredienti</span>
      </span>
    </button>
    <div v-if="scelte[r.id]" class="contatore" aria-label="Porzioni">
      <button class="secondario" :disabled="scelte[r.id]! <= 1" aria-label="Meno porzioni" @click="scelte[r.id]!--">−</button>
      <span>{{ scelte[r.id] }} porz.</span>
      <button class="secondario" aria-label="Più porzioni" @click="scelte[r.id]!++">＋</button>
    </div>
  </div>

  <div class="azioni barra-salva">
    <button :disabled="!numeroScelte" @click="aggiungi">
      {{ numeroScelte ? `Aggiungi ${numeroScelte} ${numeroScelte === 1 ? 'ricetta' : 'ricette'} alla lista` : 'Scegli almeno una ricetta' }}
    </button>
  </div>
</template>
