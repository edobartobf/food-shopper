<script setup lang="ts">
// Una foto salvata nel repo dati (foto/<id>.jpg). Con "ingrandibile" un tocco la apre a tutto schermo.
import { ref, watch } from 'vue'
import { urlFoto } from '../lib/foto'

// la classe passata da fuori (copertina, miniatura…) va sull'immagine, non sul Teleport
defineOptions({ inheritAttrs: false })
const props = defineProps<{ percorso: string; alt?: string; ingrandibile?: boolean }>()
const url = ref<string | null>(null)
const mancante = ref(false)
const grande = ref(false)

function apri(e: Event) {
  if (!props.ingrandibile) return // es. miniatura dentro un link: il tocco deve aprire il link
  e.stopPropagation()
  e.preventDefault()
  grande.value = true
}

watch(
  () => props.percorso,
  async (p) => {
    url.value = null
    mancante.value = false
    try {
      url.value = await urlFoto(p)
      mancante.value = !url.value
    } catch {
      mancante.value = true
    }
  },
  { immediate: true },
)
</script>

<template>
  <img
    v-if="url"
    v-bind="$attrs"
    :src="url"
    :alt="alt ?? ''"
    :class="{ ingrandibile }"
    :role="ingrandibile ? 'button' : undefined"
    :tabindex="ingrandibile ? 0 : undefined"
    @click="apri"
    @keydown.enter="apri"
  />
  <span v-else-if="!mancante" v-bind="$attrs" class="foto-in-arrivo" aria-hidden="true"></span>
  <Teleport v-if="grande && url" to="body">
    <div class="foto-grande" role="dialog" aria-label="Foto" @click="grande = false">
      <img :src="url" :alt="alt ?? ''" />
      <button class="secondario" aria-label="Chiudi" @click.stop="grande = false">✕</button>
    </div>
  </Teleport>
</template>
