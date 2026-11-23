<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  CalendarDays,
  CalendarPlus,
  RefreshCw,
  ShoppingBasket,
} from '@lucide/vue'
import { state, plan, week, selectedDay, generation, page } from '../store'
import { weekdays, type Child } from '../domain/model'
import { addDays, formatDate } from '../domain/dates'
import { prepSummary, warnings } from '../domain/planner'
import WeekPicker from '../components/WeekPicker.vue'
import ChildCard from '../components/ChildCard.vue'
import WarningList from '../components/WarningList.vue'
const child = ref('')
watch(
  week,
  () => {
    if (!weekdays.some((_, i) => addDays(week.value, i) === selectedDay.value))
      selectedDay.value = week.value
  },
  { immediate: true },
)
const day = computed(() =>
  plan.value?.days.find((d) => d.date === selectedDay.value),
)
const children = computed(() => {
  const list: Child[] = [...state.value.children]
  for (const c of day.value?.children ?? [])
    if (!list.some((x) => x.id === c.childId))
      list.push({ id: c.childId, name: 'Former child', sortOrder: list.length })
  return list.filter((c) => !plan.value || !child.value || c.id === child.value)
})
const issues = computed(() =>
  plan.value ? warnings(state.value, plan.value) : [],
)
</script>
<template>
  <div class="page-head">
    <div>
      <div class="eyebrow"><CalendarDays />MEAL PLANNING</div>
      <h1>Weekly plan</h1>
    </div>
    <WeekPicker />
  </div>
  <div class="panel empty-state" v-if="!plan">
    <span class="big-icon"><CalendarPlus /></span>
    <h2>Your week starts here</h2>
    <p>
      Choose available foods, then generate five weekdays of meals for your
      family.
    </p>
    <div class="actions">
      <button class="primary" @click="generation = {}">
        <CalendarPlus />Generate week</button
      ><button class="secondary" @click="page = 'Inventory'">
        Review inventory
      </button>
    </div>
  </div>
  <div v-if="plan" class="toolbar">
    <label
      >Show children<select v-model="child">
        <option value="">All children</option>
        <option v-for="c in state.children" :key="c.id" :value="c.id">
          {{ c.name }}
        </option>
      </select></label
    ><button class="secondary" @click="generation = {}">
      <RefreshCw />Regenerate week
    </button>
  </div>
  <div class="days">
    <button
      v-for="(d, i) in weekdays"
      :key="d"
      :class="{ selected: selectedDay === addDays(week, i) }"
      @click="selectedDay = addDays(week, i)"
    >
      <strong>{{ d.slice(0, 3) }}</strong
      ><small>{{ formatDate(addDays(week, i)) }}</small
      ><small v-if="issues.some((w) => w.date === addDays(week, i))"
        >{{
          issues.filter((w) => w.date === addDays(week, i)).length
        }}
        alerts</small
      >
    </button>
  </div>
  <div class="child-grid">
    <ChildCard
      v-for="(c, i) in children"
      :key="c.id"
      :child="c"
      :index="i"
      :record="day?.children.find((x) => x.childId === c.id)"
      :date="selectedDay"
    />
  </div>
  <template v-if="plan">
    <WarningList :date="selectedDay" :child-id="child" />
    <div class="actions scope-actions">
      <button class="secondary" @click="generation = { date: selectedDay }">
        Regenerate day for all</button
      ><template v-if="child"
        ><button class="secondary" @click="generation = { childId: child }">
          Regenerate child’s week</button
        ><button
          class="secondary"
          @click="generation = { childId: child, date: selectedDay }"
        >
          Regenerate child’s day
        </button></template
      >
    </div>
    <section class="panel">
      <div class="inline">
        <ShoppingBasket />
        <h2>Weekly prep</h2>
      </div>
      <p>
        Foods to have ready for the week, grouped by their first planned
        category.
      </p>
      <div v-for="[cat, names] in prepSummary(plan)" :key="cat" class="prep">
        <strong>{{ cat }}</strong
        ><span v-for="name in names" :key="name" class="chip">{{ name }}</span>
      </div>
      <p v-if="!prepSummary(plan).size">No foods assigned this week.</p>
    </section>
  </template>
</template>
