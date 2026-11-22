<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { X } from '@lucide/vue'
defineProps<{ title: string }>()
const emit = defineEmits<{ close: [] }>(),
  el = ref<HTMLDialogElement>()
onMounted(() => el.value?.showModal())
onBeforeUnmount(() => el.value?.close())
</script>
<template>
  <dialog
    ref="el"
    class="modal"
    @cancel.prevent="emit('close')"
    aria-labelledby="dialog-title"
  >
    <div class="spread">
      <h2 id="dialog-title">{{ title }}</h2>
      <button class="iconbtn" aria-label="Close dialog" @click="emit('close')">
        <X />
      </button>
    </div>
    <slot />
  </dialog>
</template>
