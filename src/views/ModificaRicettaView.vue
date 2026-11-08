<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { aggiornaRicettario, nuovaRicetta, ricettario, salvaRicetta, senzaStime, UNITA, type Ricetta } from '../lib/ricette'

const route = useRoute()
const router = useRouter()
const nuova = computed(() => !route.params.id)
const bozza = ref<Ricetta | null>(nuova.value ? nuovaRicetta() : null)
const tagTesto = ref('')
const errore = ref('')
const salvataggio = ref(false)

function prepara() {
  if (bozza.value) return
  const r = ricettario.ricette.find((x) => x.id === route.params.id)
  if (!r) return
  bozza.value = JSON.parse(JSON.stringify(r))
  tagTesto.value = r.tag.join(', ')
}

onMounted(() => {
  prepara()
  if (!ricettario.caricato) void aggiornaRicettario()
  if (nuova.value && bozza.value) {
    bozza.value.ingredienti.push({ nome: '', quantita: null, unita: 'g', reparto: 'dispensa' })
    bozza.value.passaggi.push('')
  }
})
watch(() => ricettario.ricette, prepara)

function aggiungiIngrediente() {
  bozza.value?.ingredienti.push({ nome: '', quantita: null, unita: 'g', reparto: 'dispensa' })
}
function aggiungiPassaggio() {
  bozza.value?.passaggi.push('')
}
function sposta<T>(lista: T[], i: number, d: number) {
  const j = i + d
  if (j < 0 || j >= lista.length) return
  ;[lista[i], lista[j]] = [lista[j]!, lista[i]!]
}

async function salva() {
  if (!bozza.value) return
  if (!bozza.value.titolo.trim()) {
    errore.value = 'Serve un titolo'
    return
  }
  salvataggio.value = true
  errore.value = ''
  try {
    const salvata = await salvaRicetta({
      ...bozza.value,
      tag: tagTesto.value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
      tempo_minuti: bozza.value.tempo_minuti || null,
      // salvando a mano la ricetta si considera controllata, dosi comprese
      da_ricontrollare: false,
      ingredienti: senzaStime(bozza.value.ingredienti),
    })
    router.replace(`/ricette/${salvata.id}`)
  } catch (e) {
    errore.value = e instanceof Error ? e.message : String(e)
  } finally {
    salvataggio.value = false
  }
}
</script>

<template>
  <RouterLink :to="nuova ? '/ricette' : `/ricette/${route.params.id}`" class="indietro">‹ Annulla</RouterLink>
  <h1>{{ nuova ? 'Nuova ricetta' : 'Modifica ricetta' }}</h1>

  <p v-if="!bozza" class="tenue">Carico…</p>
  <template v-else>
    <div class="scheda-box">
      <label for="titolo">Titolo</label>
      <input id="titolo" v-model="bozza.titolo" placeholder="Es. Pasta alla norma" />
      <div class="riga-campi">
        <div>
          <label for="porzioni">Porzioni</label>
          <input id="porzioni" v-model.number="bozza.porzioni" type="number" min="1" inputmode="numeric" />
        </div>
        <div>
          <label for="tempo">Tempo (min)</label>
          <input id="tempo" v-model.number="bozza.tempo_minuti" type="number" min="0" inputmode="numeric" />
        </div>
      </div>
      <label for="tag">Tag, separati da virgola</label>
      <input id="tag" v-model="tagTesto" placeholder="primi, veloce, vegetariano" />
    </div>

    <h2>Ingredienti</h2>
    <div v-for="(i, n) in bozza.ingredienti" :key="n" class="scheda-box compatta riga-ingrediente">
      <input v-model="i.nome" placeholder="Ingrediente" :aria-label="`Ingrediente ${n + 1}`" class="nome" />
      <div class="riga-campi tre">
        <input
          v-model.number="i.quantita"
          type="number"
          step="any"
          min="0"
          inputmode="decimal"
          placeholder="Qtà"
          :disabled="i.qb"
          aria-label="Quantità"
        />
        <select v-model="i.unita" :disabled="i.qb" aria-label="Unità">
          <option :value="null">—</option>
          <option v-for="u in UNITA" :key="u" :value="u">{{ u }}</option>
        </select>
        <select v-model="i.reparto" aria-label="Reparto">
          <option v-for="r in ricettario.reparti" :key="r" :value="r">{{ r }}</option>
        </select>
      </div>
      <div class="riga-comandi">
        <label class="spunta"><input v-model="i.qb" type="checkbox" /> q.b.</label>
        <span v-if="i.stimata" class="etichetta avviso" title="La fonte non indicava la dose">≈ stimata</span>
        <input v-model.trim="i.gruppo" class="gruppo-campo" placeholder="sezione (es. salsa)" aria-label="Sezione" />
        <button class="secondario piccolo" aria-label="Sposta su" @click="sposta(bozza.ingredienti, n, -1)">↑</button>
        <button class="secondario piccolo" aria-label="Sposta giù" @click="sposta(bozza.ingredienti, n, 1)">↓</button>
        <button class="secondario piccolo" aria-label="Togli ingrediente" @click="bozza.ingredienti.splice(n, 1)">✕</button>
      </div>
    </div>
    <button class="secondario" @click="aggiungiIngrediente">＋ Ingrediente</button>

    <h2>Procedimento</h2>
    <div v-for="(_, n) in bozza.passaggi" :key="n" class="scheda-box compatta">
      <label :for="`passo-${n}`" style="margin-top: 0">Passaggio {{ n + 1 }}</label>
      <textarea :id="`passo-${n}`" v-model="bozza.passaggi[n]" rows="3" style="min-height: 72px"></textarea>
      <div class="riga-comandi">
        <span class="spazio"></span>
        <button class="secondario piccolo" aria-label="Sposta su" @click="sposta(bozza.passaggi, n, -1)">↑</button>
        <button class="secondario piccolo" aria-label="Sposta giù" @click="sposta(bozza.passaggi, n, 1)">↓</button>
        <button class="secondario piccolo" aria-label="Togli passaggio" @click="bozza.passaggi.splice(n, 1)">✕</button>
      </div>
    </div>
    <button class="secondario" @click="aggiungiPassaggio">＋ Passaggio</button>

    <h2>Altro</h2>
    <div class="scheda-box">
      <label for="note" style="margin-top: 0">Note</label>
      <textarea id="note" v-model="bozza.note" rows="3" style="min-height: 72px"></textarea>
      <label for="fonte">Link della fonte</label>
      <input id="fonte" v-model.trim="bozza.fonte.url" type="url" inputmode="url" placeholder="https://…" />
      <label for="immagine">Link di un'immagine</label>
      <input id="immagine" v-model.trim="bozza.immagine_url" type="url" inputmode="url" placeholder="https://…" />
    </div>

    <div v-if="errore" class="messaggio errore">{{ errore }}</div>
    <div class="azioni barra-salva">
      <button :disabled="salvataggio" @click="salva">{{ salvataggio ? 'Salvo…' : 'Salva ricetta' }}</button>
    </div>
  </template>
</template>
