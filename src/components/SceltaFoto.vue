<script setup lang="ts">
// Pulsante per scattare una foto o sceglierla dalla galleria (Android propone entrambe le cose).
// Restituisce la foto già ridotta, pronta da caricare.
import { ref } from 'vue'
import { riduciFoto } from '../lib/foto'

defineProps<{ testo?: string; disabilitato?: boolean }>()
const emit = defineEmits<{ scelta: [foto: Blob] }>()
const campo = ref<HTMLInputElement | null>(null)
const preparo = ref(false)
const errore = ref('')

async function scelta(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  preparo.value = true
  errore.value = ''
  try {
    emit('scelta', await riduciFoto(file))
  } catch (err) {
    errore.value = err instanceof Error ? err.message : String(err)
  } finally {
    preparo.value = false
  }
}
</script>

<template>
  <button type="button" class="secondario" :disabled="disabilitato || preparo" @click="campo?.click()">
    {{ preparo ? 'Preparo la foto…' : (testo ?? '📷 Scatta o scegli una foto') }}
  </button>
  <input ref="campo" type="file" accept="image/*" hidden @change="scelta" />
  <div v-if="errore" class="messaggio errore">{{ errore }}</div>
</template>
