<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import FotoRepo from '../components/FotoRepo.vue'
import { preparaOffline } from '../lib/foto'
import { aggiornaPreferiti, preferitoPerNome, preferiti, voceDaPreferito } from '../lib/preferiti'
import { CARRELLO, chiave, DISPENSA, formattaQuantitaVoce, leggiQuantita, leggiVoceLibera, raggruppa, testoDaCondividere, type Voce } from '../lib/lista'
import { aggiornaRicettario, ricettario } from '../lib/ricette'
import { aggiungiVoci, avviaControllo, caricaLocale, eliminaVoce, modificaVoce, spesa, spunta, svuota, testoStato, vista } from '../lib/spesa'

const nuova = ref('')
const inModifica = ref<string | null>(null)
const bozza = ref({ nome: '', quantita: '', reparto: '', nota: '' })
const confermaSvuota = ref(false)
const avviso = ref('')
let ferma: (() => void) | undefined

onMounted(async () => {
  await caricaLocale()
  ferma = avviaControllo()
  if (!ricettario.caricato) void aggiornaRicettario()
  if (!preferiti.caricato) void aggiornaPreferiti()
  // le foto dei prodotti in lista servono proprio al supermercato, dove spesso non c'è campo
  void preparaOffline(vista.value.voci.map((v) => v.foto).filter((f): f is string => !!f))
})
onUnmounted(() => ferma?.())

const gruppi = computed(() => raggruppa(vista.value.voci, ricettario.reparti))
const daComprare = computed(() => vista.value.voci.filter((v) => !v.spuntata).length)
const prese = computed(() => vista.value.voci.filter((v) => v.spuntata).length)

const statoTesto = testoStato

/** Reparto di un ingrediente: quello usato nelle ricette o in lista, altrimenti "altro". */
function indovinaReparto(nome: string): string {
  const k = chiave(nome)
  for (const r of ricettario.ricette) {
    const i = r.ingredienti.find((x) => chiave(x.nome) === k)
    if (i) return i.reparto
  }
  return vista.value.voci.find((v) => chiave(v.nome) === k)?.reparto ?? 'altro'
}

function aggiungi() {
  const testo = nuova.value.trim()
  if (!testo) return
  const { nome, quantita } = leggiVoceLibera(testo)
  // un prodotto di "Ci piace" con lo stesso nome porta con sé foto, nota e reparto
  const preferito = preferitoPerNome(preferiti.elenco, nome)
  aggiungiVoci([preferito ? { ...voceDaPreferito(preferito), quantita } : { nome, quantita, reparto: indovinaReparto(nome), qb: false }])
  nuova.value = ''
}

function apriModifica(v: Voce) {
  inModifica.value = v.id
  bozza.value = { nome: v.nome, quantita: formattaQuantitaVoce({ ...v, qb: false, stimata: false }), reparto: v.reparto, nota: v.nota ?? '' }
}

function salvaModifica(v: Voce) {
  const quantita = leggiQuantita(bozza.value.quantita)
  modificaVoce(v, {
    nome: bozza.value.nome.trim() || v.nome,
    quantita,
    qb: !quantita.length && v.qb,
    stimata: v.stimata && bozza.value.quantita === formattaQuantitaVoce({ ...v, qb: false, stimata: false }),
    reparto: bozza.value.reparto,
    nota: bozza.value.nota.trim(),
  })
  inModifica.value = null
}

function elimina(v: Voce) {
  eliminaVoce(v)
  inModifica.value = null
}

function svuotaTutto() {
  if (!confermaSvuota.value) {
    confermaSvuota.value = true
    setTimeout(() => (confermaSvuota.value = false), 4000)
    return
  }
  svuota(false)
  confermaSvuota.value = false
}

async function condividi() {
  const testo = testoDaCondividere(vista.value.voci, ricettario.reparti)
  if (navigator.share) {
    try {
      await navigator.share({ text: testo })
      return
    } catch {
      /* annullato */
    }
  }
  try {
    await navigator.clipboard.writeText(testo)
    avviso.value = 'Lista copiata: incollala dove vuoi.'
  } catch {
    avviso.value = 'Non riesco a condividere da questo browser.'
  }
}
</script>

<template>
  <div class="intestazione">
    <h1>Spesa</h1>
    <span class="etichetta" :class="{ avviso: spesa.stato === 'offline' || spesa.coda.length, errore: spesa.stato === 'errore' }">
      {{ statoTesto }}
    </span>
  </div>
  <div v-if="spesa.stato === 'errore'" class="messaggio errore">
    {{ spesa.errore }} Le modifiche restano sul telefono e riprovo da solo.
  </div>

  <form class="riga-aggiungi" @submit.prevent="aggiungi">
    <input v-model="nuova" placeholder="Aggiungi, es. 2 l latte" aria-label="Aggiungi alla lista" enterkeyhint="done" />
    <button type="submit" :disabled="!nuova.trim()" aria-label="Aggiungi">＋</button>
  </form>

  <div class="azioni" style="margin-top: 10px">
    <RouterLink to="/spesa/ricette" class="pulsante-link secondario">📖 Da ricette</RouterLink>
    <RouterLink to="/preferiti" class="pulsante-link secondario">♥ Ci piace</RouterLink>
    <button class="secondario" :disabled="!daComprare" @click="condividi">Condividi</button>
  </div>
  <div v-if="avviso" class="messaggio ok">{{ avviso }}</div>

  <p v-if="!spesa.pronta" class="tenue">Carico…</p>
  <div v-else-if="!vista.voci.length" class="scheda-box" style="margin-top: 16px">
    <p style="margin: 0">La lista è vuota.</p>
    <p class="tenue" style="margin: 8px 0 0">
      Scrivi qui sopra cosa serve, oppure scegli le ricette che volete cucinare con <strong>Da ricette</strong>.
    </p>
  </div>

  <section v-for="g in gruppi" :key="g.titolo" class="gruppo" :class="{ carrello: g.titolo === CARRELLO }">
    <h2>
      {{ g.titolo }}
      <span v-if="g.titolo === DISPENSA" class="tenue"> · quanto basta, controlla se c'è</span>
    </h2>
    <div class="scheda-box voci">
      <template v-for="v in g.voci" :key="v.id">
        <div class="voce" :class="{ presa: v.spuntata }">
          <button
            class="spunta-voce"
            role="checkbox"
            :aria-checked="v.spuntata"
            :aria-label="`${v.nome}${v.spuntata ? ', preso' : ''}`"
            @click="spunta(v, !v.spuntata)"
          >
            <span class="cerchio" aria-hidden="true">{{ v.spuntata ? '✓' : '' }}</span>
            <span class="nome-voce">
              {{ v.nome }}
              <span v-if="v.nota" class="tenue"> · {{ v.nota }}</span>
            </span>
            <span class="quantita">{{ g.titolo === DISPENSA ? '' : formattaQuantitaVoce(v) }}</span>
          </button>
          <FotoRepo v-if="v.foto" :percorso="v.foto" :alt="v.nome" class="miniatura-voce" ingrandibile />
          <button class="secondario piccolo" :aria-label="`Modifica ${v.nome}`" @click="inModifica === v.id ? (inModifica = null) : apriModifica(v)">
            ✎
          </button>
        </div>
        <div v-if="inModifica === v.id" class="modifica-voce">
          <label :for="`nome-${v.id}`" style="margin-top: 0">Nome</label>
          <input :id="`nome-${v.id}`" v-model="bozza.nome" />
          <div class="riga-campi">
            <div>
              <label :for="`q-${v.id}`">Quantità</label>
              <input :id="`q-${v.id}`" v-model="bozza.quantita" placeholder="es. 500 g" />
            </div>
            <div>
              <label :for="`r-${v.id}`">Reparto</label>
              <select :id="`r-${v.id}`" v-model="bozza.reparto">
                <option v-for="r in ricettario.reparti" :key="r" :value="r">{{ r }}</option>
              </select>
            </div>
          </div>
          <label :for="`n-${v.id}`">Nota</label>
          <input :id="`n-${v.id}`" v-model="bozza.nota" placeholder="es. quelli in offerta" />
          <div class="azioni">
            <button @click="salvaModifica(v)">Salva</button>
            <button class="pericolo" @click="elimina(v)">Togli</button>
          </div>
        </div>
      </template>
    </div>
  </section>

  <div v-if="vista.voci.length" class="azioni" style="margin-top: 20px">
    <button v-if="prese" class="secondario" @click="svuota(true)">Togli le voci prese ({{ prese }})</button>
    <button class="pericolo" @click="svuotaTutto">{{ confermaSvuota ? 'Tocca di nuovo per svuotare' : 'Svuota la lista' }}</button>
  </div>
</template>
