<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <div class="app">
    <main class="contenuto">
      <RouterView />
    </main>
    <nav class="barra">
      <RouterLink to="/ricette" class="scheda">
        <span class="icona" aria-hidden="true">📖</span><span>Ricette</span>
      </RouterLink>
      <RouterLink to="/importa" class="scheda">
        <span class="icona" aria-hidden="true">＋</span><span>Importa</span>
      </RouterLink>
      <RouterLink to="/settimana" class="scheda">
        <span class="icona" aria-hidden="true">📅</span><span>Settimana</span>
      </RouterLink>
      <RouterLink to="/spesa" class="scheda">
        <span class="icona" aria-hidden="true">🛒</span><span>Spesa</span>
      </RouterLink>
      <RouterLink to="/preferiti" class="scheda">
        <span class="icona" aria-hidden="true">♥</span><span>Ci piace</span>
      </RouterLink>
    </nav>
  </div>
</template>
