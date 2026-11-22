<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  CalendarDays,
  CalendarCheck,
  ClipboardCheck,
  ShoppingBasket,
  ChevronRight,
  RotateCcw,
  Sun,
} from '@lucide/vue'
import {
  today,
  week,
  plan,
  state,
  page,
  goStep,
  change,
  selectedDay,
} from '../store'
import { formatDate, monday, noon, weekRange } from '../domain/dates'
import ChildCard from '../components/ChildCard.vue'
import Transfer from '../components/Transfer.vue'
import WarningList from '../components/WarningList.vue'
import Modal from '../components/Modal.vue'
const weekend = computed(() => [0, 6].includes(noon(today.value).getDay()))
const date = computed(() =>
  weekend.value ? monday(today.value, true) : today.value,
)
const day = computed(() => plan.value?.days.find((d) => d.date === date.value)),
  reset = ref(false)
const checked = computed(
  () =>
    plan.value?.packedSlots.filter((p) => p.date === date.value && p.packed)
      .length ?? 0,
)
function review() {
  selectedDay.value = date.value
  page.value = 'Week'
}
function clear() {
  change((s) => {
    const p = s.weeklyPlans.find((p) => p.weekStart === week.value)!
    p.packedSlots = p.packedSlots.filter((c) => c.date !== date.value)
  })
  reset.value = false
}
</script>
<template>
  <div class="page-head">
    <div>
      <div class="eyebrow">
        <Sun />{{
          formatDate(today, { weekday: 'long', month: 'long', day: 'numeric' })
        }}
      </div>
      <h1>Today’s lunchbox</h1>
    </div>
  </div>
  <section class="hero">
    <div class="hero-copy">
      <div class="ribbon">
        <i></i>{{ weekend ? 'WEEKEND PREP' : 'DAILY PLANNER' }}
      </div>
      <h2>{{ weekend ? 'A fresh week ahead.' : 'Ready, set, pack.' }}</h2>
      <p>
        {{
          weekend
            ? 'Get your lunchboxes ready for the week of ' +
              formatDate(week, { month: 'long', day: 'numeric' }) +
              '.'
            : plan
              ? 'Your meals are planned. Check off each item as you pack.'
              : 'Plan the week’s meals and get your packing checklist ready.'
        }}
      </p>
      <div class="actions">
        <button
          class="primary"
          @click="!state.setupComplete && !plan ? goStep(0) : review()"
        >
          <CalendarDays />{{
            !state.setupComplete && !plan
              ? 'Set up planner'
              : weekend
                ? 'Prepare next week'
                : 'View weekly plan'
          }}
        </button>
      </div>
    </div>
    <div class="hero-art">
      <img
        :src="'./art/lunchbox.png'"
        alt="An open green lunchbox with sandwiches, strawberries and vegetables"
      />
    </div>
  </section>
  <div class="section-head">
    <div>
      <div class="eyebrow"><ClipboardCheck />PACKING CHECKLIST</div>
      <h2>{{ weekend ? 'Monday’s lunchboxes' : 'Today’s checklist' }}</h2>
    </div>
    <span class="date-tag"><CalendarDays />{{ formatDate(date) }}</span>
  </div>
  <div class="child-grid">
    <ChildCard
      v-for="(c, i) in state.children"
      :key="c.id"
      :child="c"
      :index="i"
      :record="day?.children.find((x) => x.childId === c.id)"
      :date="date"
      packing
    />
  </div>
  <WarningList :date="date" /><button
    v-if="checked"
    class="subtle"
    @click="reset = true"
  >
    <RotateCcw />Reset day’s packing
  </button>
  <div class="section-head"><h2>Planner shortcuts</h2></div>
  <div class="shortcuts">
    <button @click="review">
      <span class="shortcut-icon butter"><CalendarCheck /></span
      ><span
        ><strong>Weekly plan</strong><small>{{ weekRange(week) }}</small></span
      ><ChevronRight /></button
    ><button @click="page = 'Inventory'">
      <span class="shortcut-icon peach"><ShoppingBasket /></span
      ><span
        ><strong>Weekly inventory</strong
        ><small>Choose available foods</small></span
      ><ChevronRight />
    </button>
  </div>
  <Transfer section="packing" />
  <Modal v-if="reset" title="Reset packing for this day?" @close="reset = false"
    ><p>Clear {{ checked }} packing checks for {{ formatDate(date) }}?</p>
    <div class="actions end">
      <button class="secondary" @click="reset = false">Cancel</button
      ><button class="primary" @click="clear">Reset packing</button>
    </div></Modal
  >
</template>
