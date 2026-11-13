<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { consigliPasto } from '../lib/conservazione'
import { vociDaRicetta } from '../lib/daRicette'
import { aggiungiGiorni, fineSettimana, giornoBreve, giorniTra, oggi, pastiDaComprare, quandoPasto, titoloGiorno, type Pasto } from '../lib/piano'
import { aggiornaRicettario, ricettario } from '../lib/ricette'
import { aggiungiVoci, caricaLocale as caricaSpesa } from '../lib/spesa'
import { caricaLocale, segnaInLista, vista } from '../lib/settimana'

const router = useRouter()
const CHIAVE_PERIODO = 'dispensa:periodo-spesa'

type Periodo = '2' | '3' | 'domenica' | '7' | 'altro'
const PERIODI: Array<{ id: Periodo; nome: string }> = [
  { id: '2', nome: '2 giorni' },
  { id: '3', nome: '3 giorni' },
  { id: 'domenica', nome: 'Fino a domenica' },
  { id: '7', nome: 'Una settimana' },
  { id: 'altro', nome: 'Altro…' },
]

function periodoSalvato(): Periodo {
  try {
    const p = localStorage.getItem(CHIAVE_PERIODO)
    if (PERIODI.some((x) => x.id === p)) return p as Periodo
  } catch {
    /* niente */
  }
  return '7'
}

const spesaIl = ref(oggi())
const periodo = ref<Periodo>(periodoSalvato())
const alAMano = ref(aggiungiGiorni(oggi(), 6))
/** id pasto → incluso */
const esclusi = reactive<Record<string, boolean>>({})

watch(periodo, (p) => {
  try {
    if (p !== 'altro') localStorage.setItem(CHIAVE_PERIODO, p)
  } catch {
    /* niente */
  }
})

onMounted(() => {
  void caricaLocale()
  void caricaSpesa()
  if (!ricettario.caricato) void aggiornaRicettario()
})

const al = computed(() => {
  const da = spesaIl.value
  switch (periodo.value) {
    case '2':
      return aggiungiGiorni(da, 1)
    case '3':
      return aggiungiGiorni(da, 2)
    case 'domenica':
      return fineSettimana(da)
    case '7':
      return aggiungiGiorni(da, 6)
    default:
      return alAMano.value < da ? da : alAMano.value
  }
})

const ricette = computed(() => new Map(ricettario.ricette.map((r) => [r.id, r])))
/** si compra dal giorno della spesa in poi; i pasti di oggi contano solo se la spesa è oggi */
const candidati = computed(() => pastiDaComprare(vista.value.pasti, spesaIl.value, al.value))
const scelti = computed(() => candidati.value.filter((p) => !esclusi[p.id] && p.ricetta && ricette.value.get(p.ricetta)))
const giaInLista = computed(
  () => vista.value.pasti.filter((p) => p.ricetta && p.spesa_il && p.data >= spesaIl.value && p.data <= al.value).length,
)

const consigli = computed(() =>
  scelti.value.flatMap((p) => consigliPasto(p, ricette.value.get(p.ricetta!), spesaIl.value)).filter((c) => c.tipo !== 'scongela'),
)

const maiuscola = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const porzioni = (p: Pasto) => p.porzioni ?? ricette.value.get(p.ricetta!)?.porzioni ?? 2
const durata = computed(() => giorniTra(spesaIl.value, al.value) + 1)

async function aggiungi() {
  const pasti = scelti.value
  if (!pasti.length) return
  await caricaSpesa()
  aggiungiVoci(pasti.flatMap((p) => vociDaRicetta(ricette.value.get(p.ricetta!)!, porzioni(p))))
  segnaInLista(pasti, spesaIl.value)
  router.push('/spesa')
}
</script>

<template>
  <RouterLink to="/settimana" class="indietro">‹ Settimana</RouterLink>
  <h1>Fai la spesa</h1>

  <h2 style="margin-top: 0">Quando la fate?</h2>
  <div class="chips" role="group" aria-label="Giorno della spesa">
    <button v-for="n in [0, 1, 2]" :key="n" class="chip" :class="{ attivo: spesaIl === aggiungiGiorni(oggi(), n) }" @click="spesaIl = aggiungiGiorni(oggi(), n)">
      {{ giornoBreve(aggiungiGiorni(oggi(), n)) }}
    </button>
  </div>

  <h2>Per quanti giorni?</h2>
  <div class="chips" role="group" aria-label="Periodo">
    <button v-for="p in PERIODI" :key="p.id" class="chip" :class="{ attivo: periodo === p.id }" @click="periodo = p.id">{{ p.nome }}</button>
  </div>
  <div v-if="periodo === 'altro'">
    <label for="fino-a">Fino a</label>
    <input id="fino-a" v-model="alAMano" type="date" :min="spesaIl" />
  </div>
  <p class="tenue">
    Da {{ titoloGiorno(spesaIl).toLowerCase() }} a {{ titoloGiorno(al).toLowerCase() }} ({{ durata }} {{ durata === 1 ? 'giorno' : 'giorni' }}).
  </p>

  <div v-if="!candidati.length" class="scheda-box">
    <p style="margin: 0">Nessun pasto da comprare in questi giorni.</p>
    <p class="tenue" style="margin: 8px 0 0">
      <template v-if="giaInLista">{{ giaInLista }} {{ giaInLista === 1 ? 'pasto è' : 'pasti sono' }} già in lista. </template>
      Aggiungi le ricette ai giorni nella <RouterLink to="/settimana">Settimana</RouterLink>.
    </p>
  </div>

  <template v-else>
    <h2>Pasti</h2>
    <div
      v-for="p in candidati"
      :key="p.id"
      class="scheda-box compatta scelta-ricetta"
      :class="{ scelta: !esclusi[p.id] && ricette.get(p.ricetta!) }"
    >
      <button
        class="spunta-voce"
        role="checkbox"
        :aria-checked="!esclusi[p.id]"
        :disabled="!ricette.get(p.ricetta!)"
        @click="esclusi[p.id] = !esclusi[p.id]"
      >
        <span class="cerchio" aria-hidden="true">{{ !esclusi[p.id] && ricette.get(p.ricetta!) ? '✓' : '' }}</span>
        <span class="nome-voce">
          <span class="titolo-voce">{{ ricette.get(p.ricetta!)?.titolo ?? p.titolo }}</span>
          <span class="tenue" style="display: block">
            {{ quandoPasto(p) }} · {{ porzioni(p) }} porz.
            <template v-if="!ricette.get(p.ricetta!)"> · ricetta non più nel ricettario</template>
          </span>
        </span>
      </button>
    </div>
    <p v-if="giaInLista" class="tenue">
      {{ giaInLista }} {{ giaInLista === 1 ? 'altro pasto di questi giorni è' : 'altri pasti di questi giorni sono' }} già in lista.
    </p>

    <section v-if="consigli.length" class="scheda-box da-fare">
      <h2>Freschi da tenere d'occhio</h2>
      <div v-for="c in consigli" :key="`${c.pasto.id}-${c.promemoria}`" class="consiglio">
        <span class="titolo-voce">{{ c.tipo === 'congela' ? '❄' : '⏳' }} {{ maiuscola(c.ingrediente) }}</span>
        <span class="tenue" style="display: block">{{ c.testo }}</span>
      </div>
      <p class="tenue" style="margin: 10px 0 0">
        Quello da congelare te lo ricordo nella Settimana, insieme a quando spostarlo in frigo. Quello da comprare dopo resta in
        lista: toglilo pure se lo prenderete più avanti.
      </p>
    </section>
  </template>

  <div class="azioni barra-salva">
    <button :disabled="!scelti.length" @click="aggiungi">
      {{ scelti.length ? `Metti in lista ${scelti.length} ${scelti.length === 1 ? 'pasto' : 'pasti'}` : 'Nessun pasto scelto' }}
    </button>
  </div>
</template>
