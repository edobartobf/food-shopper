<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { configurata, impostazioni, linkConfigurazione } from '../lib/impostazioni'
import { verificaAccesso } from '../lib/github'

const route = useRoute()
const router = useRouter()

const mostraToken = ref(false)
const verifica = ref<{ ok: boolean; messaggio: string } | null>(null)
const inVerifica = ref(false)
const linkCopiato = ref(false)

async function verificaEContinua() {
  inVerifica.value = true
  verifica.value = await verificaAccesso()
  inVerifica.value = false
  if (verifica.value.ok && configurata.value && typeof route.query.poi === 'string') {
    router.replace(route.query.poi)
  }
}

async function condividiLink() {
  const link = linkConfigurazione()
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Configura Dispensa', text: 'Apri questo link sul tuo telefono per configurare Dispensa', url: link })
      return
    } catch {
      /* annullato: proviamo a copiarlo */
    }
  }
  await navigator.clipboard.writeText(link)
  linkCopiato.value = true
}
</script>

<template>
  <h1>Impostazioni</h1>

  <div v-if="!configurata" class="messaggio avviso">
    Prima di usare l'app scrivi il tuo nome e il token. Se ti hanno mandato un link di configurazione, aprilo da questo
    telefono e il token si inserisce da solo.
  </div>

  <div class="scheda-box">
    <label for="nome">Chi sei?</label>
    <input id="nome" v-model.trim="impostazioni.nome" placeholder="Il tuo nome" autocomplete="given-name" />
    <p class="tenue" style="margin-top: 6px">Compare accanto a ogni modifica, così sapete chi ha fatto cosa.</p>

    <label for="token">Token GitHub</label>
    <input
      id="token"
      v-model.trim="impostazioni.token"
      :type="mostraToken ? 'text' : 'password'"
      placeholder="github_pat_…"
      autocomplete="off"
      spellcheck="false"
    />
    <button class="secondario" style="margin-top: 6px; min-height: 36px; padding: 6px 12px" @click="mostraToken = !mostraToken">
      {{ mostraToken ? 'Nascondi' : 'Mostra' }}
    </button>

    <label for="repo">Repo dei dati</label>
    <input id="repo" v-model.trim="impostazioni.repo" spellcheck="false" />

    <div class="azioni">
      <button :disabled="!impostazioni.token || inVerifica" @click="verificaEContinua">
        {{ inVerifica ? 'Controllo…' : 'Controlla il collegamento' }}
      </button>
    </div>
    <div v-if="verifica" class="messaggio" :class="verifica.ok ? 'ok' : 'errore'">{{ verifica.messaggio }}</div>
  </div>

  <div v-if="impostazioni.token" class="scheda-box">
    <h2 style="margin-top: 0">Configura l'altro telefono</h2>
    <p class="tenue">
      Manda questo link all'altro telefono: contiene il token, quindi mandalo solo a chi deve usare l'app. Il nome lo
      sceglie chi apre il link.
    </p>
    <div class="azioni">
      <button class="secondario" @click="condividiLink">Condividi il link di configurazione</button>
    </div>
    <div v-if="linkCopiato" class="messaggio ok">Link copiato.</div>
  </div>
</template>
