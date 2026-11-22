<script setup lang="ts">
import { computed } from 'vue'
import { TriangleAlert } from '@lucide/vue'
import { state, plan, generation } from '../store'
import { warnings } from '../domain/planner'
import { formatDate } from '../domain/dates'
const props = defineProps<{ date?: string; childId?: string }>()
const items = computed(() =>
  plan.value
    ? warnings(state.value, plan.value).filter(
        (w) =>
          (!props.date || props.date === w.date) &&
          (!props.childId || props.childId === w.childId),
      )
    : [],
)
</script>
<template>
  <details v-if="items.length" class="warning-list">
    <summary>
      <TriangleAlert />{{ items.length }} plan
      {{ items.length === 1 ? 'warning' : 'warnings' }} to review
    </summary>
    <ul>
      <li v-for="(w, i) in items" :key="i">
        <strong
          >{{
            state.children.find((c) => c.id === w.childId)?.name ??
            'Former child'
          }}
          ·
          {{
            formatDate(w.date, {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            })
          }}
          · {{ w.meal }}</strong
        >
        <p>{{ w.message }}</p>
        <button class="link" @click="generation = { date: w.date }">
          Regenerate affected day
        </button>
      </li>
    </ul>
  </details>
</template>
