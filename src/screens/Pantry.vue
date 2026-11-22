<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  ShoppingBasket,
  Carrot,
  Plus,
  Search,
  Tags,
  Check,
  Minus,
  Copy,
  Archive,
  Trash2,
  Pencil,
  ArchiveRestore,
} from '@lucide/vue'
import { week, state, change, inventory, toast } from '../store'
import { addDays } from '../domain/dates'
import { uid, type Food, type Category } from '../domain/model'
import FoodEditor from '../components/FoodEditor.vue'
import Transfer from '../components/Transfer.vue'
import WeekPicker from '../components/WeekPicker.vue'
import WarningList from '../components/WarningList.vue'
import Modal from '../components/Modal.vue'
const props = defineProps<{ stock: boolean }>()
const search = ref(''),
  category = ref(''),
  status = ref(''),
  editing = ref<Food | null | undefined>(undefined),
  manage = ref(false)
const catName = ref(''),
  catId = ref(''),
  role = ref<'other' | 'main'>('other')
watch(
  () => props.stock,
  () => {
    search.value = ''
    category.value = ''
    status.value = ''
    manage.value = false
  },
)
const entries = computed(
  () =>
    state.value.weeklyInventories.find((w) => w.weekStart === week.value)
      ?.entries ?? [],
)
const available = computed(
  () => new Set(entries.value.filter((e) => e.available).map((e) => e.foodId)),
)
const active = computed(() => state.value.foods.filter((f) => !f.archived))
const groups = computed(() => {
  const filtered = state.value.foods.filter(
    (f) =>
      f.name.toLocaleLowerCase().includes(search.value.toLocaleLowerCase()) &&
      (!category.value || f.categoryIds.includes(category.value)) &&
      (props.stock
        ? !f.archived &&
          (!status.value ||
            available.value.has(f.id) === (status.value === 'yes'))
        : status.value === 'archived'
          ? f.archived
          : !f.archived),
  )
  return state.value.categories
    .map((c) => ({
      category: c,
      foods: filtered
        .filter((f) => (category.value || f.categoryIds[0]) === c.id)
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .filter((g) => g.foods.length)
})
function toggle(f: Food) {
  change((s) => {
    const w = inventory(s),
      e = w.entries.find((x) => x.foodId === f.id)
    if (e) e.available = !e.available
    else w.entries.push({ foodId: f.id, available: true })
  })
}
function bulk(copy: boolean) {
  const prev = state.value.weeklyInventories.find(
    (w) => w.weekStart === addDays(week.value, -7),
  )
  if (copy && !prev) {
    toast('No saved inventory for the previous week.')
    return
  }
  if (
    !confirm(
      copy
        ? 'Replace this week’s inventory with last week’s availability?'
        : 'Mark all foods unavailable for this week?',
    )
  )
    return
  change((s) => {
    inventory(s).entries = copy
      ? prev!.entries.map((e) => ({ ...e }))
      : s.foods.map((f) => ({ foodId: f.id, available: false }))
  })
}
function erase(f: Food) {
  const used = state.value.weeklyPlans.filter((p) =>
    p.days.some((d) =>
      d.children.some((c) =>
        c.meals.some((m) => m.slots.some((s) => s.foodId === f.id)),
      ),
    ),
  ).length
  if (
    !confirm(
      'Delete ' +
        f.name +
        ' and its preferences and weekly inventory entries? ' +
        used +
        ' saved week(s) retain their original meal snapshots.',
    )
  )
    return
  change((s) => {
    s.foods = s.foods.filter((x) => x.id !== f.id)
    s.preferences = s.preferences.filter((x) => x.foodId !== f.id)
    for (const w of s.weeklyInventories)
      w.entries = w.entries.filter((x) => x.foodId !== f.id)
  })
}
function archive(f: Food) {
  if (
    f.archived ||
    confirm('Archive ' + f.name + '? Existing plans retain their selections.')
  )
    change((s) => {
      s.foods.find((x) => x.id === f.id)!.archived = !f.archived
    })
}
function openCategories() {
  editCat()
  manage.value = true
}
function editCat(c?: Category) {
  catId.value = c?.id ?? ''
  catName.value = c?.name ?? ''
  role.value = c?.varietyRole ?? 'other'
}
function saveCat() {
  const name = catName.value.trim()
  if (!name) return
  change((s) => {
    const c = s.categories.find((c) => c.id === catId.value)
    if (c) Object.assign(c, { name, varietyRole: role.value })
    else
      s.categories.push({
        id: uid(),
        name,
        sortOrder: s.categories.length,
        varietyRole: role.value,
      })
  })
  editCat()
}
function removeCat(c: Category) {
  const used =
    state.value.foods.some((f) => f.categoryIds.includes(c.id)) ||
    state.value.schedules.some((s) =>
      Object.values(s.weekdays)
        .flat()
        .some((m) => m.requirements.some((r) => r.categoryId === c.id)),
    )
  if (used) {
    toast(
      'Change foods and schedule requirements using this category before deleting it.',
    )
    return
  }
  if (
    confirm('Delete ' + c.name + '? Historical plans keep its name snapshot.')
  ) {
    change((s) => {
      s.categories = s.categories.filter((x) => x.id !== c.id)
    })
    editCat()
  }
}
</script>
<template>
  <div class="page-head">
    <div>
      <div class="eyebrow">
        <component :is="stock ? ShoppingBasket : Carrot" />{{
          stock ? 'WEEKLY STOCK' : 'FOOD LIBRARY'
        }}
      </div>
      <h1>{{ stock ? 'Inventory' : 'Food catalog' }}</h1>
    </div>
    <WeekPicker v-if="stock" />
  </div>
  <div class="panel">
    <div class="spread wrap">
      <div>
        <h2>{{ stock ? 'Available this week' : 'Your foods' }}</h2>
        <p>
          {{
            stock
              ? active.filter((f) => available.has(f.id)).length +
                ' of ' +
                active.length +
                ' active foods available'
              : active.length +
                ' active foods · ' +
                state.categories.length +
                ' categories'
          }}
        </p>
      </div>
      <div class="actions">
        <button
          v-if="!stock"
          class="secondary"
          @click="openCategories"
        >
          <Tags />Categories</button
        ><button class="primary" @click="editing = null">
          <Plus />{{ stock ? 'Quick add food' : 'Add food' }}
        </button>
      </div>
    </div>
    <div class="filters">
      <label class="search"
        ><Search /><input
          v-model="search"
          type="search"
          placeholder="Search foods"
          aria-label="Search foods" /></label
      ><select v-model="category" aria-label="Filter by category">
        <option value="">All categories</option>
        <option v-for="c in state.categories" :key="c.id" :value="c.id">
          {{ c.name }}
        </option></select
      ><select v-model="status" aria-label="Filter foods">
        <option value="">
          {{ stock ? 'All availability' : 'Active foods' }}
        </option>
        <template v-if="stock"
          ><option value="yes">Available</option>
          <option value="no">Unavailable</option></template
        >
        <option v-else value="archived">Archived foods</option>
      </select>
    </div>
    <div v-for="g in groups" :key="g.category.id">
      <h3 class="group-label">{{ g.category.name }}</h3>
      <div v-for="f in g.foods" :key="f.id" class="list-row">
        <div>
          <strong>{{ f.name }}</strong
          ><small>{{
            f.categoryIds
              .map((id) => state.categories.find((c) => c.id === id)?.name)
              .join(' · ')
          }}</small>
        </div>
        <button
          v-if="stock"
          class="toggle"
          :class="{ on: available.has(f.id) }"
          :aria-label="f.name + ' availability'"
          :aria-pressed="available.has(f.id)"
          @click="toggle(f)"
        >
          <component :is="available.has(f.id) ? Check : Minus" />{{
            available.has(f.id) ? 'Available' : 'Unavailable'
          }}
        </button>
        <div v-else class="actions compact">
          <button
            class="iconbtn"
            :aria-label="'Edit ' + f.name"
            @click="editing = f"
          >
            <Pencil /></button
          ><button
            class="iconbtn"
            :aria-label="(f.archived ? 'Unarchive ' : 'Archive ') + f.name"
            @click="archive(f)"
          >
            <component :is="f.archived ? ArchiveRestore : Archive" /></button
          ><button
            class="iconbtn danger"
            :aria-label="'Delete ' + f.name"
            @click="erase(f)"
          >
            <Trash2 />
          </button>
        </div>
      </div>
    </div>
    <div v-if="!groups.length" class="empty-state">
      <span class="big-icon"
        ><component :is="stock ? ShoppingBasket : Carrot"
      /></span>
      <h3>
        {{
          state.foods.length
            ? 'No matching foods'
            : 'Your catalog is ready to fill'
        }}
      </h3>
      <p>
        {{
          state.foods.length
            ? 'Try a different search or filter.'
            : 'Add a food and choose its categories to get started.'
        }}
      </p>
    </div>
    <div v-if="stock" class="actions">
      <button class="secondary" @click="bulk(true)">
        <Copy />Copy last week</button
      ><button class="subtle" @click="bulk(false)">All unavailable</button>
    </div>
  </div>
  <WarningList /><Transfer :section="stock ? 'inventory' : 'catalog'" />
  <FoodEditor
    v-if="editing !== undefined"
    :food="editing ?? undefined"
    :quick="stock"
    @close="editing = undefined"
  />
  <Modal v-if="manage" title="Food categories" @close="manage = false"
    ><div v-for="c in state.categories" :key="c.id" class="list-row">
      <span
        >{{ c.name }}
        <small v-if="c.varietyRole === 'main'">Main role</small></span
      >
      <div class="inline">
        <button
          class="iconbtn"
          :aria-label="'Edit ' + c.name"
          @click="editCat(c)"
        >
          <Pencil /></button
        ><button
          class="iconbtn"
          :aria-label="'Delete ' + c.name"
          @click="removeCat(c)"
        >
          <Trash2 />
        </button>
      </div>
    </div>
    <form @submit.prevent="saveCat">
      <label>Category name<input required v-model="catName" /></label
      ><label
        >Variety role<select v-model="role">
          <option value="other">Standard variety</option>
          <option value="main">Avoid consecutive main dishes</option>
        </select></label
      >
      <div class="actions">
        <button class="primary">
          {{ catId ? 'Save category' : 'Add category' }}</button
        ><button
          v-if="catId"
          type="button"
          class="secondary"
          @click="editCat()"
        >
          Cancel edit
        </button>
      </div>
    </form></Modal
  >
</template>
