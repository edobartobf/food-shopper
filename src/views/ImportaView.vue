<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { eliminaCondiviso, leggiCondiviso, separaLink, tipoFonte, type ImmagineCondivisa } from '../lib/condivisi'
import { creaImportazione, elencaImportazioni, type Importazione } from '../lib/importazioni'
import { aggiornaRicettario, ricettario, trovaPerUrl, urlConfrontabile } from '../lib/ricette'

const route = useRoute()
const router = useRouter()

const url = ref('')
const testo = ref('')
const immagini = ref<ImmagineCondivisa[]>([])
const anteprime = ref<string[]>([])
const invio = ref(false)
const errore = ref('')
const idCondiviso = computed(() => (typeof route.params.id === 'string' ? route.params.id : ''))

const NOMI_FONTE = { tiktok: 'TikTok', instagram: 'Instagram', sito: 'Sito web', testo: 'Testo', screenshot: 'Screenshot' }
const fonte = computed(() => NOMI_FONTE[tipoFonte(url.value.trim(), immagini.value.length > 0)])
const inCoda = ref<Importazione[]>([])
const giaPresente = computed(() => trovaPerUrl(ricettario.ricette, separaLink(url.value, testo.value).url))
const giaInCoda = computed(() => {
  const u = separaLink(url.value, testo.value).url
  return !!u && inCoda.value.some((i) => i.stato !== 'errore' && i.url && urlConfrontabile(i.url) === urlConfrontabile(u))
})
const puoInviare = computed(
  () => !invio.value && !giaPresente.value && !giaInCoda.value && (url.value.trim() || testo.value.trim() || immagini.value.length),
)

function aggiornaAnteprime() {
  anteprime.value.forEach(URL.revokeObjectURL)
  anteprime.value = immagini.value.map((i) => URL.createObjectURL(new Blob([i.dati], { type: i.tipo })))
}

onMounted(async () => {
  void elencaImportazioni()
    .then((l) => (inCoda.value = l))
    .catch(() => {})
  const caricamentoRicette = ricettario.caricato ? Promise.resolve() : aggiornaRicettario()
  if (!idCondiviso.value) return
  const c = await leggiCondiviso(idCondiviso.value)
  if (!c) return
  const separati = separaLink(c.url, [c.titolo, c.testo].filter(Boolean).join('\n'))
  url.value = separati.url
  testo.value = separati.testo
  immagini.value = c.immagini
  aggiornaAnteprime()
  // Link già importato: apri direttamente la ricetta esistente
  await caricamentoRicette
  if (giaPresente.value && !immagini.value.length) {
    await eliminaCondiviso(idCondiviso.value)
    router.replace({ path: `/ricette/${giaPresente.value.id}`, query: { gia: '1' } })
  }
})
onUnmounted(() => anteprime.value.forEach(URL.revokeObjectURL))

async function scegliImmagini(e: Event) {
  const files = Array.from((e.target as HTMLInputElement).files ?? [])
  for (const f of files) immagini.value.push({ nome: f.name, tipo: f.type || 'image/jpeg', dati: await f.arrayBuffer() })
  aggiornaAnteprime()
}

function togliImmagine(i: number) {
  immagini.value.splice(i, 1)
  aggiornaAnteprime()
}

async function importa() {
  invio.value = true
  errore.value = ''
  try {
    const separati = separaLink(url.value, testo.value)
    await creaImportazione(separati.url, separati.testo, immagini.value)
    if (idCondiviso.value) await eliminaCondiviso(idCondiviso.value)
    router.replace({ path: '/ricette', query: { importata: '1' } })
  } catch (e) {
    errore.value = e instanceof Error ? e.message : String(e)
  } finally {
    invio.value = false
  }
}
</script>

<template>
  <h1>Importa una ricetta</h1>
  <p class="tenue">
    Il modo più veloce: da TikTok, Instagram o dal browser tocca <strong>Condividi → Dispensa</strong>. Qui puoi anche
    incollare un link o il testo di una ricetta, o allegare degli screenshot.
  </p>

  <div class="scheda-box">
    <label for="url">Link</label>
    <input id="url" v-model.trim="url" type="url" inputmode="url" placeholder="https://…" />

    <label for="testo">Testo (didascalia, ricetta scritta a mano, note)</label>
    <textarea id="testo" v-model="testo" placeholder="Incolla qui la didascalia o scrivi la ricetta"></textarea>

    <label for="immagini">Screenshot</label>
    <input id="immagini" type="file" accept="image/*" multiple @change="scegliImmagini" />
    <div v-if="anteprime.length" class="anteprime">
      <button
        v-for="(src, i) in anteprime"
        :key="src"
        class="secondario"
        style="padding: 0; min-height: 0; background: none"
        :aria-label="`Togli screenshot ${i + 1}`"
        @click="togliImmagine(i)"
      >
        <img :src="src" alt="" />
      </button>
    </div>
    <p v-if="anteprime.length" class="tenue" style="margin-top: 6px">Tocca uno screenshot per toglierlo.</p>

    <p class="tenue" style="margin-top: 12px">Tipo: <span class="etichetta">{{ fonte }}</span></p>

    <div v-if="giaPresente" class="messaggio avviso">
      Questo link è già nel ricettario: <RouterLink :to="`/ricette/${giaPresente.id}`">{{ giaPresente.titolo }}</RouterLink>
    </div>
    <div v-else-if="giaInCoda" class="messaggio avviso">Questo link è già in elaborazione.</div>

    <div class="azioni">
      <button :disabled="!puoInviare" @click="importa">{{ invio ? 'Invio…' : 'Importa' }}</button>
    </div>
    <div v-if="errore" class="messaggio errore">{{ errore }}</div>
  </div>
</template>
