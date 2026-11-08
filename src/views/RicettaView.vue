<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { aggiornaRicettario, eliminaRicetta, formattaQuantita, ricettario, salvaRicetta } from '../lib/ricette'
import { aggiungiVoci, caricaLocale } from '../lib/spesa'
import { vociDaRicetta } from '../lib/daRicette'

const route = useRoute()
const router = useRouter()
const ricetta = computed(() => ricettario.ricette.find((r) => r.id === route.params.id))
const porzioni = ref(0)
const errore = ref('')
const lavoro = ref(false)
const confermaElimina = ref(false)
const aggiunta = ref(false)

async function aggiungiAllaSpesa() {
  if (!ricetta.value) return
  await caricaLocale()
  aggiungiVoci(vociDaRicetta(ricetta.value, porzioni.value))
  aggiunta.value = true
}

watch(
  ricetta,
  (r) => {
    if (r && !porzioni.value) porzioni.value = r.porzioni
  },
  { immediate: true },
)
onMounted(() => {
  if (!ricettario.caricato) void aggiornaRicettario()
})

const fattore = computed(() => (ricetta.value ? porzioni.value / ricetta.value.porzioni : 1))
const NOMI_FONTE: Record<string, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  sito: 'Sito web',
  testo: 'Testo',
  screenshot: 'Screenshot',
  manuale: 'Scritta a mano',
}

async function conferma() {
  if (!ricetta.value) return
  lavoro.value = true
  errore.value = ''
  try {
    await salvaRicetta({ ...ricetta.value, da_ricontrollare: false })
  } catch (e) {
    errore.value = e instanceof Error ? e.message : String(e)
  } finally {
    lavoro.value = false
  }
}

async function elimina() {
  if (!ricetta.value) return
  if (!confermaElimina.value) {
    confermaElimina.value = true
    return
  }
  lavoro.value = true
  errore.value = ''
  try {
    await eliminaRicetta(ricetta.value)
    router.replace('/ricette')
  } catch (e) {
    errore.value = e instanceof Error ? e.message : String(e)
    lavoro.value = false
  }
}
</script>

<template>
  <RouterLink to="/ricette" class="indietro">‹ Ricette</RouterLink>

  <p v-if="!ricetta && !ricettario.caricato" class="tenue">Carico…</p>
  <div v-else-if="!ricetta" class="messaggio avviso">Questa ricetta non esiste più.</div>

  <template v-else>
    <img
      v-if="ricetta.immagine_url"
      :src="ricetta.immagine_url"
      alt=""
      class="copertina"
      referrerpolicy="no-referrer"
      @error="($event.target as HTMLImageElement).remove()"
    />
    <h1>{{ ricetta.titolo }}</h1>
    <div v-if="route.query.gia" class="messaggio ok">Questa ricetta era già nel ricettario.</div>

    <div v-if="ricetta.da_ricontrollare" class="messaggio avviso">
      Importata automaticamente: controlla ingredienti e quantità, poi conferma.
      <div class="azioni">
        <RouterLink :to="`/ricette/${ricetta.id}/modifica`" class="pulsante-link secondario">Correggi</RouterLink>
        <button :disabled="lavoro" @click="conferma">È giusta, conferma</button>
      </div>
    </div>

    <div class="tenue">
      <template v-if="ricetta.tempo_minuti">{{ ricetta.tempo_minuti }} min · </template>
      {{ NOMI_FONTE[ricetta.fonte.tipo] ?? ricetta.fonte.tipo }}
      <template v-if="ricetta.creata_da"> · aggiunta da {{ ricetta.creata_da }}</template>
    </div>
    <div v-if="ricetta.tag.length" class="mini-tag" style="margin-top: 8px">
      <span v-for="t in ricetta.tag" :key="t" class="etichetta">{{ t }}</span>
    </div>
    <p v-if="ricetta.fonte.url" class="spezza" style="margin-top: 8px">
      <a :href="ricetta.fonte.url" target="_blank" rel="noopener">Apri la fonte originale ↗</a>
    </p>

    <div class="intestazione" style="margin-top: 16px">
      <h2 style="margin: 0">Ingredienti</h2>
      <div class="contatore" aria-label="Porzioni">
        <button class="secondario" :disabled="porzioni <= 1" aria-label="Meno porzioni" @click="porzioni--">−</button>
        <span>{{ porzioni }} porz.</span>
        <button class="secondario" aria-label="Più porzioni" @click="porzioni++">＋</button>
      </div>
    </div>
    <ul class="ingredienti scheda-box">
      <li v-for="(i, n) in ricetta.ingredienti" :key="n">
        <span>{{ i.nome }}<span v-if="i.nota" class="tenue"> ({{ i.nota }})</span></span>
        <span class="quantita">{{ formattaQuantita(i, fattore) }}</span>
      </li>
      <li v-if="!ricetta.ingredienti.length" class="tenue">Nessun ingrediente</li>
    </ul>

    <div class="azioni" style="margin-top: 0">
      <button :disabled="!ricetta.ingredienti.length" @click="aggiungiAllaSpesa">🛒 Aggiungi alla spesa ({{ porzioni }} porz.)</button>
    </div>
    <div v-if="aggiunta" class="messaggio ok">
      Ingredienti aggiunti alla lista. <RouterLink to="/spesa">Apri la spesa</RouterLink>
    </div>

    <h2>Procedimento</h2>
    <ol v-if="ricetta.passaggi.length" class="passaggi">
      <li v-for="(p, n) in ricetta.passaggi" :key="n">{{ p }}</li>
    </ol>
    <p v-else class="tenue">Nessun passaggio scritto.</p>

    <template v-if="ricetta.note">
      <h2>Note</h2>
      <p style="white-space: pre-line">{{ ricetta.note }}</p>
    </template>

    <div v-if="errore" class="messaggio errore">{{ errore }}</div>
    <div class="azioni">
      <RouterLink :to="`/ricette/${ricetta.id}/modifica`" class="pulsante-link secondario">Modifica</RouterLink>
      <button class="pericolo" :disabled="lavoro" @click="elimina">
        {{ confermaElimina ? 'Tocca di nuovo per eliminare' : 'Elimina' }}
      </button>
    </div>
  </template>
</template>
