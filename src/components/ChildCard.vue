<script setup lang="ts">
import { computed } from 'vue'
import { Apple, Carrot, Utensils } from '@lucide/vue'
import { plan, change } from '../store'
import {
  packedKey,
  type Child,
  type ChildDay,
  type Packed,
} from '../domain/model'
const props = defineProps<{
  child: Child
  index: number
  date: string
  record?: ChildDay
  packing?: boolean
}>()
const slots = computed(
  () =>
    props.record?.meals.flatMap((m) => m.slots.filter((s) => s.foodId)) ?? [],
)
const packed = computed(
  () =>
    plan.value?.packedSlots.filter(
      (p) => p.date === props.date && p.childId === props.child.id && p.packed,
    ) ?? [],
)
const key = (mealId: string, slotId: string) => ({
  date: props.date,
  childId: props.child.id,
  mealId,
  slotId,
})
const isPacked = (mealId: string, slotId: string) =>
  packed.value.some((p) => packedKey(p) === packedKey(key(mealId, slotId)))
function toggle(mealId: string, slotId: string) {
  const item: Packed = {
      ...key(mealId, slotId),
      packed: !isPacked(mealId, slotId),
    },
    w = plan.value!.weekStart
  change((s) => {
    const p = s.weeklyPlans.find((x) => x.weekStart === w)!
    p.packedSlots = p.packedSlots.filter(
      (x) => packedKey(x) !== packedKey(item),
    )
    if (item.packed) p.packedSlots.push(item)
  })
}
</script>
<template>
  <article class="child-card">
    <header class="child-head">
      <span class="avatar" :class="index % 2 ? 'orange' : 'green'"
        ><component :is="index % 2 ? Carrot : Apple"
      /></span>
      <h3>{{ child.name }}</h3>
      <span class="count">{{
        record ? record.meals.length + ' meals' : 'No plan'
      }}</span>
    </header>
    <div v-if="!record" class="child-empty">
      <Utensils />
      <p>No meals planned yet</p>
    </div>
    <p v-else-if="!record.meals.length" class="quiet">
      No meals scheduled for this day.
    </p>
    <section v-for="meal in record?.meals" :key="meal.mealId" class="meal">
      <h4>{{ meal.mealNameSnapshot }}</h4>
      <div
        v-for="slot in meal.slots"
        :key="slot.slotId"
        class="foodline"
        :class="{
          missing: !slot.foodId,
          packed: packing && isPacked(meal.mealId, slot.slotId),
        }"
      >
        <label v-if="packing && slot.foodId"
          ><input
            type="checkbox"
            :checked="isPacked(meal.mealId, slot.slotId)"
            @change="toggle(meal.mealId, slot.slotId)"
          /><span>{{ slot.foodNameSnapshot }}</span></label
        ><span v-else>{{
          slot.foodNameSnapshot ?? 'Missing ' + slot.categoryNameSnapshot
        }}</span
        ><small>{{ slot.categoryNameSnapshot }}</small>
      </div>
    </section>
    <footer v-if="packing" class="child-foot">
      <span class="track"
        ><i
          :style="{
            width:
              (slots.length ? (packed.length / slots.length) * 100 : 0) + '%',
          }"
        ></i></span
      ><span>{{ packed.length }} of {{ slots.length }} packed</span>
    </footer>
  </article>
</template>
