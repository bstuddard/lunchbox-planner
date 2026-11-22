<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Plus, Trash2, Pencil, ChevronUp, ChevronDown, Copy } from '@lucide/vue'
import { state, change, categoryChoices, drink, saveDrinkCategory } from '../store'
import {
  weekdays,
  uid,
  clone,
  type Day,
  type Meal,
  type Schedule,
  type State,
} from '../domain/model'
import Modal from '../components/Modal.vue'
import Transfer from '../components/Transfer.vue'
const props = defineProps<{ childId: string }>(),
  day = ref<Day>('Monday'),
  edit = ref<Meal>(),
  copying = ref(false),
  targets = ref<Day[]>([]),
  err = ref('')
const meals = computed(
  () =>
    state.value.schedules.find((s) => s.childId === props.childId)?.weekdays[
      day.value
    ] ?? [],
)
const includesDrink = computed({
  get: () => edit.value?.requirements.some(r => r.categoryId === drink.value.id) ?? false,
  set(include: boolean) {
    const meal = edit.value
    if (!meal) return
    if (include) meal.requirements.push({ categoryId: drink.value.id, count: 1 })
    else meal.requirements = meal.requirements.filter(r => r.categoryId !== drink.value.id)
  },
})
function mutate(fn: (s: Schedule, draft: State) => void) {
  return change((d) => {
    let s = d.schedules.find((s) => s.childId === props.childId)
    if (!s) {
      s = {
        childId: props.childId,
        weekdays: {
          Monday: [],
          Tuesday: [],
          Wednesday: [],
          Thursday: [],
          Friday: [],
        },
      }
      d.schedules.push(s)
    }
    fn(s, d)
  })
}
function open(m?: Meal) {
  err.value = ''
  const first = state.value.categories.find(c => c.id !== drink.value.id)
  edit.value = m
    ? clone(m)
    : {
        id: uid(),
        name: '',
        sortOrder: meals.value.length,
        requirements: first ? [{ categoryId: first.id, count: 1 }] : [],
      }
}
function save() {
  const m = edit.value!
  m.name = m.name.trim()
  if (
    !m.name ||
    !m.requirements.length ||
    m.requirements.some(
      (r) =>
        !r.categoryId ||
        !Number.isInteger(r.count) ||
        r.count < 1 ||
        r.count > 10,
    )
  ) {
    err.value =
      'Enter a name and at least one category with a count from 1 to 10.'
    return
  }
  if (
    mutate((s, draft) => {
      saveDrinkCategory(draft, m.requirements.map(r => r.categoryId))
      const rows = s.weekdays[day.value],
        i = rows.findIndex((x) => x.id === m.id)
      if (i < 0) rows.push(clone(m))
      else rows[i] = clone(m)
    })
  )
    edit.value = undefined
}
function move(i: number, delta: number) {
  mutate((s) => {
    const rows = s.weekdays[day.value]
    ;[rows[i], rows[i + delta]] = [rows[i + delta], rows[i]]
    rows.forEach((m, j) => (m.sortOrder = j))
  })
}
function remove(m: Meal) {
  if (confirm('Remove ' + m.name + ' from this weekday’s schedule?'))
    mutate((s) => {
      s.weekdays[day.value] = s.weekdays[day.value].filter((x) => x.id !== m.id)
      s.weekdays[day.value].forEach((x, i) => (x.sortOrder = i))
    })
}
function chooseCopyDays() {
  targets.value = weekdays.filter((dayName) => dayName !== day.value)
  copying.value = true
}
function copy() {
  if (!targets.value.length) return
  mutate((s) => {
    for (const t of targets.value) s.weekdays[t] = clone(s.weekdays[day.value])
  })
  copying.value = false
}
watch(
  () => props.childId,
  () => {
    edit.value = undefined
    copying.value = false
  },
)
</script>
<template>
  <div class="days">
    <button
      v-for="d in weekdays"
      :class="{ selected: d === day }"
      @click="day = d"
    >
      {{ d.slice(0, 3) }}
    </button>
  </div>
  <section class="panel">
    <div class="spread wrap">
      <h2>{{ day }} meals</h2>
      <button class="primary" @click="open()"><Plus />Add meal</button>
    </div>
    <p v-if="!meals.length">No meals scheduled for this weekday.</p>
    <div v-for="(m, i) in meals" :key="m.id" class="list-row">
      <div>
        <strong>{{ m.name }}</strong
        ><small>{{
          m.requirements
            .map(
              (r) =>
                r.count +
                ' × ' +
                state.categories.find((c) => c.id === r.categoryId)?.name,
            )
            .join(' · ')
        }}</small>
      </div>
      <div class="actions compact">
        <button
          class="iconbtn"
          :disabled="i === 0"
          :aria-label="'Move ' + m.name + ' earlier'"
          @click="move(i, -1)"
        >
          <ChevronUp /></button
        ><button
          class="iconbtn"
          :disabled="i === meals.length - 1"
          :aria-label="'Move ' + m.name + ' later'"
          @click="move(i, 1)"
        >
          <ChevronDown /></button
        ><button
          class="iconbtn"
          :aria-label="'Edit ' + m.name"
          @click="open(m)"
        >
          <Pencil /></button
        ><button
          class="iconbtn"
          :aria-label="'Remove ' + m.name"
          @click="remove(m)"
        >
          <Trash2 />
        </button>
      </div>
    </div>
    <button
      class="secondary"
        @click="chooseCopyDays"
    >
      <Copy />{{
        day === 'Monday' ? 'Copy Monday to weekdays' : 'Copy day to…'
      }}
    </button>
  </section>
  <Transfer section="schedules" />
  <Modal v-if="edit" title="Meal requirements" @close="edit = undefined"
    ><form @submit.prevent="save">
      <label>Meal name<input v-model="edit.name" required autofocus /></label>
      <fieldset>
        <legend>Required foods</legend>
        <div class="choices">
          <label><input v-model="includesDrink" type="checkbox" />Include a drink</label>
        </div>
        <div v-for="(r, i) in edit.requirements" :key="i" class="req">
          <select v-model="r.categoryId" aria-label="Required category">
            <option v-for="c in categoryChoices" :key="c.id" :value="c.id">
              {{ c.name }}
            </option></select
          ><input
            aria-label="Quantity"
            type="number"
            min="1"
            max="10"
            step="1"
            v-model.number="r.count"
            required
          /><button
            type="button"
            class="iconbtn"
            aria-label="Remove requirement"
            @click="edit.requirements.splice(i, 1)"
          >
            <Trash2 />
          </button>
        </div>
      </fieldset>
      <button
        type="button"
        class="secondary"
        @click="
          edit.requirements.push({
            categoryId: categoryChoices[0].id,
            count: 1,
          })
        "
      >
        <Plus />Add requirement
      </button>
      <p v-if="err" class="alert">{{ err }}</p>
      <div class="actions end">
        <button type="button" class="secondary" @click="edit = undefined">
          Cancel</button
        ><button class="primary">Save meal</button>
      </div>
    </form></Modal
  >
  <Modal
    v-if="copying"
    :title="'Copy ' + day + ' meals'"
    @close="copying = false"
    ><p>Replace this child’s schedule on the selected weekdays.</p>
    <div class="choices">
      <label v-for="d in weekdays.filter((d) => d !== day)"
        ><input type="checkbox" v-model="targets" :value="d" />{{ d }}</label
      >
    </div>
    <div class="actions end">
      <button class="secondary" @click="copying = false">Cancel</button
      ><button class="primary" :disabled="!targets.length" @click="copy">
        Replace selected days
      </button>
    </div></Modal
  >
</template>
