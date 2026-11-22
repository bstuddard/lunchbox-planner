<script setup lang="ts">
import { computed } from 'vue'
import { state, week, generation, plan, change, guide, toast } from '../store'
import { uid } from '../domain/model'
import { formatDate, weekRange } from '../domain/dates'
import { generatePlan, inScope, warnings } from '../domain/planner'
import Modal from './Modal.vue'
const scope = computed(() => (plan.value ? (generation.value ?? {}) : {}))
const desc = computed(
  () =>
    (scope.value.childId
      ? state.value.children.find((c) => c.id === scope.value.childId)?.name
      : 'All children') +
    ' · ' +
    (scope.value.date
      ? formatDate(scope.value.date, {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
        })
      : weekRange(week.value)),
)
const checked = computed(
  () =>
    plan.value?.packedSlots.filter(
      (p) => p.packed && inScope(scope.value, p.date, p.childId),
    ).length ?? 0,
)
function run() {
  const prior = plan.value,
    target = scope.value
  const next = generatePlan(
    state.value,
    week.value,
    target,
    uid(),
    new Date().toISOString(),
  )
  let filled = 0,
    empty = 0,
    same = 0
  for (const d of next.days)
    for (const c of d.children)
      if (inScope(target, d.date, c.childId))
        for (const m of c.meals)
          for (const s of m.slots) {
            if (s.foodId) {
              filled++
              const old = prior?.days
                .find((o) => o.date === d.date)
                ?.children.find((o) => o.childId === c.childId)
                ?.meals.find((o) => o.mealId === m.mealId)
                ?.slots.find((o) => o.slotId === s.slotId)
              if (s.foodId === old?.foodId) same++
            } else empty++
          }
  if (
    change((d) => {
      const i = d.weeklyPlans.findIndex((p) => p.weekStart === week.value)
      if (i < 0) d.weeklyPlans.push(next)
      else d.weeklyPlans[i] = next
      if (guide.value === 4) d.setupComplete = true
    })
  ) {
    if (guide.value === 4) guide.value = -1
    generation.value = null
    toast(
      filled +
        ' slots filled · ' +
        empty +
        ' missing' +
        (prior ? ' · ' + same + ' unchanged' : '') +
        (warnings(state.value, next).length ? ' · Review plan warnings' : ''),
    )
  }
}
</script>
<template>
  <Modal
    v-if="generation"
    :title="plan ? 'Regenerate plan?' : 'Generate your plan?'"
    @close="generation = null"
    ><p class="summary">
      <strong>{{ desc }}</strong>
    </p>
    <p>
      {{
        plan
          ? 'This replaces the meal assignments in the selected scope.'
          : 'This creates a five-day plan from each child’s schedule and the foods available this week.'
      }}
    </p>
    <p v-if="checked" class="alert">
      {{ checked }} checked packing
      {{ checked === 1 ? 'item will' : 'items will' }} be cleared.
    </p>
    <div class="actions end">
      <button class="secondary" @click="generation = null">Cancel</button
      ><button class="primary" @click="run">
        {{ plan ? 'Regenerate' : 'Generate plan' }}
      </button>
    </div></Modal
  >
</template>
