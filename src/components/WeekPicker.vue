<script setup lang="ts">
import { CalendarDays, ChevronLeft, ChevronRight } from '@lucide/vue'
import { week } from '../store'
import { addDays, weekRange } from '../domain/dates'
</script>
<template>
  <div class="weekpicker">
    <button
      class="iconbtn"
      aria-label="Previous week"
      @click="week = addDays(week, -7)"
    >
      <ChevronLeft /></button
    ><span><CalendarDays />{{ weekRange(week) }}</span
    ><button
      class="iconbtn"
      aria-label="Next week"
      @click="week = addDays(week, 7)"
    >
      <ChevronRight />
    </button>
  </div>
</template>
