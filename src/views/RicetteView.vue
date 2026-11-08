<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { elencaImportazioni, riprovaImportazione, togliImportazione, type Importazione } from '../lib/importazioni'
import { aggiornaRicettario, filtraRicette, ricettario, tuttiITag } from '../lib/ricette'

const route = useRoute()
const importazioni = ref<Importazione[]>([])
const erroreImport = ref('')
const cerca = ref('')
const tagScelti = ref<string[]>([])
const soloDaRicontrollare = ref(false)
let timer: number | undefined

const tag = computed(() => tuttiITag(ricettario.ricette))
const daRicontrollare = computed(() => ricettario.ricette.filter((r) => r.da_ricontrollare).length)
const risultati = computed(() =>
  filtraRicette(ricettario.ricette, cerca.value, tagScelti.value).filter((r) => !soloDaRicontrollare.value || r.da_ricontrollare),
)

async function caricaImportazioni() {
  try {
    const prima = importazioni.value.length
    importazioni.value = await elencaImportazioni()
    erroreImport.value = ''
    // un import è finito: la ricetta nuova è nel repo
    if (importazioni.value.length < prima) await aggiornaRicettario()
  } catch (e) {
    erroreImport.value = e instanceof Error ? e.message : String(e)
  }
  clearTimeout(timer)
  if (importazioni.value.some((i) => i.stato !== 'errore')) timer = window.setTimeout(caricaImportazioni, 15000)
}

const inLavoro = ref<string | null>(null)

async function agisci(imp: Importazione, azione: 'riprova' | 'togli') {
  inLavoro.value = imp.id
  erroreImport.value = ''
  try {
    if (azione === 'riprova') {
      await riprovaImportazione(imp)
      imp.stato = 'in_attesa'
      imp.errore = null
      clearTimeout(timer)
      timer = window.setTimeout(caricaImportazioni, 15000)
    } else {
      await togliImportazione(imp)
      importazioni.value = importazioni.value.filter((i) => i.id !== imp.id)
    }
  } catch (e) {
    erroreImport.value = e instanceof Error ? e.message : String(e)
  } finally {
    inLavoro.value = null
  }
}

function scegliTag(t: string) {
  tagScelti.value = tagScelti.value.includes(t) ? tagScelti.value.filter((x) => x !== t) : [...tagScelti.value, t]
}

onMounted(() => {
  void aggiornaRicettario()
  void caricaImportazioni()
})
onUnmounted(() => clearTimeout(timer))

const data = (iso: string) =>
  new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <div class="intestazione">
    <h1>Ricette</h1>
    <RouterLink to="/ricette/nuova" class="pulsante-link">＋ Nuova</RouterLink>
  </div>

  <div v-if="route.query.importata" class="messaggio ok">
    Richiesta di import inviata. La ricetta comparirà qui quando sarà pronta, di solito entro un paio di minuti.
  </div>

  <template v-if="importazioni.length || erroreImport">
    <h2>In elaborazione</h2>
    <div v-if="erroreImport" class="messaggio errore">{{ erroreImport }}</div>
    <div v-for="imp in importazioni" :key="imp.id" class="scheda-box compatta">
      <div class="spezza titolo-voce">{{ imp.url || imp.testo.slice(0, 80) || 'Screenshot' }}</div>
      <div class="tenue">
        <span class="etichetta" :class="imp.stato === 'errore' ? 'errore' : 'avviso'">
          {{ imp.stato === 'errore' ? 'Non riuscito' : 'In elaborazione' }}
        </span>
        · {{ imp.creata_da }} · {{ data(imp.creata_il) }}
      </div>
      <div v-if="imp.errore" class="messaggio errore">
        {{ imp.errore }}
        <RouterLink v-if="imp.ricetta_id" :to="`/ricette/${imp.ricetta_id}`"> Apri la ricetta</RouterLink>
      </div>
      <div v-if="imp.stato === 'errore'" class="azioni" style="margin-top: 8px">
        <button v-if="!imp.ricetta_id" class="secondario" :disabled="inLavoro === imp.id" @click="agisci(imp, 'riprova')">Riprova</button>
        <RouterLink v-if="!imp.ricetta_id && !imp.url" to="/importa" class="pulsante-link secondario">Importa a mano</RouterLink>
        <button class="secondario" :disabled="inLavoro === imp.id" @click="agisci(imp, 'togli')">Togli</button>
      </div>
    </div>
  </template>

  <input v-model="cerca" type="search" class="cerca" placeholder="Cerca per nome, ingrediente o tag" aria-label="Cerca" />

  <div v-if="tag.length || daRicontrollare" class="chips">
    <button v-if="daRicontrollare" class="chip" :class="{ attivo: soloDaRicontrollare }" @click="soloDaRicontrollare = !soloDaRicontrollare">
      Da ricontrollare ({{ daRicontrollare }})
    </button>
    <button v-for="t in tag" :key="t" class="chip" :class="{ attivo: tagScelti.includes(t) }" @click="scegliTag(t)">{{ t }}</button>
  </div>

  <div v-if="ricettario.errore" class="messaggio avviso">{{ ricettario.errore }}</div>
  <p v-if="!ricettario.caricato" class="tenue">Carico il ricettario…</p>
  <div v-else-if="!ricettario.ricette.length" class="scheda-box">
    <p style="margin: 0">Il ricettario è vuoto.</p>
    <p class="tenue" style="margin: 8px 0 0">
      Condividi una ricetta da TikTok, Instagram o dal browser con <strong>Condividi → Dispensa</strong>, oppure scrivine una
      con <strong>＋ Nuova</strong>.
    </p>
  </div>
  <p v-else-if="!risultati.length" class="tenue">Nessuna ricetta corrisponde alla ricerca.</p>

  <RouterLink v-for="r in risultati" :key="r.id" :to="`/ricette/${r.id}`" class="scheda-box voce-ricetta">
    <img v-if="r.immagine_url" :src="r.immagine_url" alt="" loading="lazy" referrerpolicy="no-referrer" @error="($event.target as HTMLImageElement).remove()" />
    <div class="testo-voce">
      <div class="titolo-voce">{{ r.titolo }}</div>
      <div class="tenue">
        {{ r.porzioni }} porz.<template v-if="r.tempo_minuti"> · {{ r.tempo_minuti }} min</template>
        · {{ r.ingredienti.length }} ingredienti
      </div>
      <div v-if="r.tag.length || r.da_ricontrollare" class="mini-tag">
        <span v-if="r.da_ricontrollare" class="etichetta avviso">da ricontrollare</span>
        <span v-for="t in r.tag" :key="t" class="etichetta">{{ t }}</span>
      </div>
    </div>
  </RouterLink>
</template>
