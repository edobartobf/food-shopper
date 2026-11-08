<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { impostazioni } from '../lib/impostazioni'

// Aperto dal link di configurazione: #/configura?t=<token>&r=<repo>
const route = useRoute()
const router = useRouter()

onMounted(() => {
  const { t, r } = route.query
  if (typeof t === 'string' && t) impostazioni.token = t
  if (typeof r === 'string' && r) impostazioni.repo = r
  // Toglie il token dall'indirizzo e dalla cronologia
  router.replace('/impostazioni')
})
</script>

<template>
  <p>Configurazione in corso…</p>
</template>
