<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import FotoRepo from '../components/FotoRepo.vue'
import { chiave } from '../lib/lista'
import { aggiornaPreferiti, filtraPreferiti, preferiti, voceDaPreferito, type Preferito } from '../lib/preferiti'
import { aggiungiVoci, caricaLocale, vista } from '../lib/spesa'

const cerca = ref('')
const risultati = computed(() => filtraPreferiti(preferiti.elenco, cerca.value))
const inLista = computed(() => new Set(vista.value.voci.filter((v) => !v.spuntata).map((v) => chiave(v.nome))))

onMounted(() => {
  void caricaLocale()
  void aggiornaPreferiti()
})

function mettiInLista(p: Preferito) {
  aggiungiVoci([voceDaPreferito(p)])
}
</script>

<template>
  <div class="intestazione">
    <h1>Ci piace</h1>
    <RouterLink to="/preferiti/nuovo" class="pulsante-link">＋ Nuovo</RouterLink>
  </div>

  <input v-if="preferiti.elenco.length > 6" v-model="cerca" type="search" class="cerca" placeholder="Cerca" aria-label="Cerca" />
  <div v-if="preferiti.errore" class="messaggio avviso">{{ preferiti.errore }}</div>

  <p v-if="!preferiti.caricato" class="tenue">Carico…</p>
  <div v-else-if="!preferiti.elenco.length" class="scheda-box">
    <p style="margin: 0">Qui vi segnate i prodotti precisi che vi piacciono: quel pesto, quella marca di yogurt, il pane di quel forno.</p>
    <p class="tenue" style="margin: 8px 0 0">
      Con <strong>＋ Nuovo</strong> scattate una foto alla confezione e aggiungete una nota. Poi un tocco su <strong>🛒</strong> lo mette nella
      lista della spesa, con la foto: al supermercato sapete cosa prendere.
    </p>
  </div>
  <p v-else-if="!risultati.length" class="tenue">Nessun prodotto corrisponde alla ricerca.</p>

  <div class="griglia-preferiti">
    <div v-for="p in risultati" :key="p.id" class="scheda-box preferito">
      <RouterLink :to="`/preferiti/${p.id}`" class="apri-preferito">
        <FotoRepo v-if="p.foto" :percorso="p.foto" :alt="p.nome" class="foto-preferito" />
        <span v-else class="foto-preferito senza-foto" aria-hidden="true">❤</span>
        <span class="titolo-voce">{{ p.nome }}</span>
        <span v-if="p.nota" class="tenue nota-preferito">{{ p.nota }}</span>
      </RouterLink>
      <button v-if="inLista.has(chiave(p.nome))" class="secondario piccolo" disabled>✓ In lista</button>
      <button v-else class="secondario piccolo" :aria-label="`Metti ${p.nome} nella lista della spesa`" @click="mettiInLista(p)">
        🛒 In lista
      </button>
    </div>
  </div>
</template>
