<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { elencaImportazioni, type Importazione } from '../lib/importazioni'

const route = useRoute()
const importazioni = ref<Importazione[]>([])
const caricamento = ref(true)
const errore = ref('')

async function carica() {
  caricamento.value = true
  errore.value = ''
  try {
    importazioni.value = await elencaImportazioni()
  } catch (e) {
    errore.value = e instanceof Error ? e.message : String(e)
  } finally {
    caricamento.value = false
  }
}

onMounted(carica)

const data = (iso: string) =>
  new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <h1>Ricette</h1>

  <div v-if="route.query.importata" class="messaggio ok">
    Richiesta di import inviata. La ricetta comparirà qui quando sarà pronta.
  </div>

  <h2>In elaborazione</h2>
  <p v-if="caricamento" class="tenue">Carico…</p>
  <div v-else-if="errore" class="messaggio errore">
    {{ errore }}
    <div class="azioni"><button class="secondario" @click="carica">Riprova</button></div>
  </div>
  <p v-else-if="!importazioni.length" class="tenue">Nessun import in corso.</p>
  <div v-for="imp in importazioni" :key="imp.id" class="scheda-box">
    <div class="spezza" style="font-weight: 600">{{ imp.url || imp.testo.slice(0, 80) || 'Screenshot' }}</div>
    <div class="tenue" style="margin-top: 4px">
      <span class="etichetta" :class="{ errore: imp.stato === 'errore', avviso: imp.stato !== 'errore' }">
        {{ imp.stato === 'errore' ? 'Errore' : 'In elaborazione' }}
      </span>
      · {{ imp.creata_da }} · {{ data(imp.creata_il) }}
    </div>
    <div v-if="imp.errore" class="messaggio errore">{{ imp.errore }}</div>
  </div>

  <h2>Ricettario</h2>
  <p class="tenue">Il ricettario arriva nella prossima tappa.</p>
</template>
