<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import FotoRepo from '../components/FotoRepo.vue'
import SceltaFoto from '../components/SceltaFoto.vue'
import { chiave } from '../lib/lista'
import { aggiornaPreferiti, eliminaPreferito, normalizzaPreferito, preferiti, salvaPreferito, voceDaPreferito, type Preferito } from '../lib/preferiti'
import { aggiornaRicettario, ricettario } from '../lib/ricette'
import { aggiungiVoci, caricaLocale, vista } from '../lib/spesa'

const route = useRoute()
const router = useRouter()
const nuovo = computed(() => !route.params.id)
const originale = computed(() => preferiti.elenco.find((p) => p.id === route.params.id))
const bozza = ref<Preferito | null>(nuovo.value ? { ...normalizzaPreferito({}), id: '', nome: '' } : null)
// undefined = foto invariata, null = da togliere, Blob = nuova
const fotoNuova = ref<Blob | null | undefined>(undefined)
const anteprima = ref('')
const errore = ref('')
const lavoro = ref(false)
const confermaElimina = ref(false)

function prepara() {
  if (bozza.value || !originale.value) return
  bozza.value = { ...originale.value }
}
onMounted(() => {
  prepara()
  if (!preferiti.caricato) void aggiornaPreferiti()
  if (!ricettario.caricato) void aggiornaRicettario()
  void caricaLocale()
})
watch(originale, prepara)

function scegliFoto(foto: Blob | null) {
  if (anteprima.value) URL.revokeObjectURL(anteprima.value)
  fotoNuova.value = foto
  anteprima.value = foto ? URL.createObjectURL(foto) : ''
}
onUnmounted(() => anteprima.value && URL.revokeObjectURL(anteprima.value))

const fotoVisibile = computed(() => fotoNuova.value !== null && (anteprima.value || bozza.value?.foto))
const inLista = computed(
  () => !!originale.value && vista.value.voci.some((v) => !v.spuntata && chiave(v.nome) === chiave(originale.value!.nome)),
)

async function salva() {
  if (!bozza.value) return
  if (!bozza.value.nome.trim()) {
    errore.value = 'Serve un nome, es. "Pesto Rana"'
    return
  }
  lavoro.value = true
  errore.value = ''
  try {
    await salvaPreferito(bozza.value, fotoNuova.value)
    router.replace('/preferiti')
  } catch (e) {
    errore.value = e instanceof Error ? e.message : String(e)
  } finally {
    lavoro.value = false
  }
}

async function elimina() {
  if (!originale.value) return
  if (!confermaElimina.value) {
    confermaElimina.value = true
    return
  }
  lavoro.value = true
  errore.value = ''
  try {
    await eliminaPreferito(originale.value)
    router.replace('/preferiti')
  } catch (e) {
    errore.value = e instanceof Error ? e.message : String(e)
    lavoro.value = false
  }
}
</script>

<template>
  <RouterLink to="/preferiti" class="indietro">‹ Ci piace</RouterLink>
  <h1>{{ nuovo ? 'Nuovo prodotto' : (originale?.nome ?? 'Prodotto') }}</h1>

  <p v-if="!bozza && !preferiti.caricato" class="tenue">Carico…</p>
  <div v-else-if="!bozza" class="messaggio avviso">Questo prodotto non c'è più.</div>

  <template v-else>
    <div v-if="fotoVisibile" class="foto-scheda">
      <img v-if="anteprima" :src="anteprima" alt="Foto scelta" class="copertina" />
      <FotoRepo v-else-if="bozza.foto" :percorso="bozza.foto" :alt="bozza.nome" class="copertina" ingrandibile />
    </div>
    <div class="azioni" style="margin-top: 0">
      <SceltaFoto :testo="fotoVisibile ? '📷 Cambia foto' : '📷 Scatta o scegli una foto'" :disabilitato="lavoro" @scelta="scegliFoto" />
      <button v-if="fotoVisibile" type="button" class="secondario" :disabled="lavoro" @click="scegliFoto(null)">Togli foto</button>
    </div>

    <div class="scheda-box" style="margin-top: 12px">
      <label for="nome" style="margin-top: 0">Nome</label>
      <input id="nome" v-model="bozza.nome" placeholder="Es. Pesto Rana" />
      <label for="nota">Nota</label>
      <input id="nota" v-model="bozza.nota" placeholder="Es. quello senza aglio, banco frigo" />
      <label for="reparto">Reparto</label>
      <select id="reparto" v-model="bozza.reparto">
        <option v-for="r in ricettario.reparti" :key="r" :value="r">{{ r }}</option>
      </select>
    </div>

    <div v-if="errore" class="messaggio errore">{{ errore }}</div>
    <div class="azioni">
      <button :disabled="lavoro" @click="salva">{{ lavoro ? 'Salvo…' : 'Salva' }}</button>
      <template v-if="originale">
        <button v-if="inLista" class="secondario" disabled>✓ In lista</button>
        <button v-else class="secondario" :disabled="lavoro" @click="aggiungiVoci([voceDaPreferito(originale)])">🛒 In lista</button>
        <button class="pericolo" :disabled="lavoro" @click="elimina">
          {{ confermaElimina ? 'Tocca di nuovo per eliminare' : 'Elimina' }}
        </button>
      </template>
    </div>
  </template>
</template>
