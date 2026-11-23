<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { School } from '@lucide/vue'
import { state, saveSchoolLunch, toast } from '../store'
import { formatDate } from '../domain/dates'
import { lunchMealId, scheduledMeals } from '../domain/planner'
import type { ChildDay, SchoolLunch } from '../domain/model'

const props = defineProps<{
  childId: string
  date: string
  record?: ChildDay
  exception?: SchoolLunch
  editable: boolean
}>()
const dateLabel = useId()
const meals = computed(() => {
  const options = new Map(scheduledMeals(state.value, props.date, props.childId).map(m => [m.id, m.name]))
  for (const m of props.record?.meals ?? [])
    if (!options.has(m.mealId)) options.set(m.mealId, m.mealNameSnapshot)
  return Array.from(options, ([id, name]) => ({ id, name }))
})
const suggested = computed(() => lunchMealId(meals.value))
const selected = ref('')
const target = computed(() => props.exception?.mealId || suggested.value || selected.value ||
  (meals.value.length ? '' : 'lunch'))
const pending = ref(false)
const failed = ref<boolean | null>(null)
async function toggle(buying: boolean) {
  if (pending.value) return
  pending.value = true
  failed.value = null
  try {
    await saveSchoolLunch({ childId: props.childId, date: props.date, mealId: target.value }, buying)
    toast('Lunch choice saved for ' + formatDate(props.date))
  } catch {
    failed.value = buying
  } finally {
    pending.value = false
  }
}
</script>
<template>
  <div v-if="editable || exception" class="school-lunch" :class="{ buying: exception }">
    <label v-if="editable && !exception && !suggested && meals.length">
      Packed meal to replace
      <select v-model="selected" :disabled="pending">
        <option disabled value="">Choose a meal</option>
        <option v-for="meal in meals" :key="meal.id" :value="meal.id">{{ meal.name }}</option>
        <option value="lunch">No packed lunch scheduled</option>
      </select>
    </label>
    <label v-if="editable" class="checklabel">
      <input type="checkbox" :checked="Boolean(exception)" :disabled="pending || !target" :aria-describedby="dateLabel"
        @change="toggle(($event.target as HTMLInputElement).checked)" />
      Buying School Lunch
    </label>
    <strong v-else class="inline"><School :size="18" />Buying School Lunch</strong>
    <small :id="dateLabel">{{ formatDate(date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) }} only</small>
    <div v-if="failed !== null" role="alert">
      Lunch choice hasn’t been saved.
      <button class="link" @click="toggle(failed)">Retry save</button>
    </div>
  </div>
</template>
