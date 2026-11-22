<script setup lang="ts">
import { ref } from 'vue'
import type { Food } from '../domain/model'
import { uid } from '../domain/model'
import { categoryChoices, change, inventory, saveDrinkCategory } from '../store'
import Modal from './Modal.vue'
const props = defineProps<{ food?: Food; quick?: boolean }>(),
  emit = defineEmits<{ close: [] }>()
const name = ref(props.food?.name ?? ''),
  cats = ref([...(props.food?.categoryIds ?? [])]),
  notes = ref(props.food?.notes ?? ''),
  error = ref('')
function save() {
  if (!name.value.trim() || !cats.value.length) {
    error.value = 'Enter a name and select at least one category.'
    return
  }
  const food: Food = {
    id: props.food?.id ?? uid(),
    name: name.value.trim(),
    categoryIds: [...cats.value],
    archived: props.food?.archived ?? false,
    notes: notes.value.trim(),
  }
  if (
    change((s) => {
      saveDrinkCategory(s, food.categoryIds)
      const i = s.foods.findIndex((f) => f.id === food.id)
      if (i < 0) s.foods.push(food)
      else s.foods[i] = food
      if (props.quick)
        inventory(s).entries.push({ foodId: food.id, available: true })
    })
  )
    emit('close')
}
</script>
<template>
  <Modal
    :title="
      food ? 'Edit food' : quick ? 'Quick add available food' : 'Add food'
    "
    @close="emit('close')"
    ><form @submit.prevent="save">
      <label
        >Food name<input
          v-model="name"
          required
          autofocus
          placeholder="e.g. Apple slices"
      /></label>
      <fieldset>
        <legend>Categories</legend>
        <div class="choices">
          <label v-for="c in categoryChoices" :key="c.id"
            ><input v-model="cats" type="checkbox" :value="c.id" />{{
              c.name
            }}</label
          >
        </div>
      </fieldset>
      <label>Notes (optional)<textarea v-model="notes" rows="2" /></label>
      <p v-if="error" class="alert">{{ error }}</p>
      <div class="actions end">
        <button type="button" class="secondary" @click="emit('close')">
          Cancel</button
        ><button class="primary">Save food</button>
      </div>
    </form></Modal
  >
</template>
