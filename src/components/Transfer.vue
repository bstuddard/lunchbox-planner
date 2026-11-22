<script setup lang="ts">
import { ref, shallowRef, computed, watch } from 'vue'
import { Upload, Download, FileJson } from '@lucide/vue'
import { state, week, download, replaceState, toast } from '../store'
import { previewImport, parseImport, maxBytes } from '../data/transfer'
import type { Section } from '../domain/model'
import { formatDate } from '../domain/dates'
import Modal from './Modal.vue'
const props = defineProps<{ section: Section }>(),
  file = ref<HTMLInputElement>(),
  opened = ref(false),
  mode = ref('merge'),
  error = ref(''),
  applying = ref(false),
  parsed = shallowRef<ReturnType<typeof parseImport>>()
const label = computed(() =>
  props.section === 'backup'
    ? 'Full backup'
    : props.section.charAt(0).toUpperCase() + props.section.slice(1),
)
const scope = computed(() =>
  ['packing', 'inventory'].includes(props.section)
    ? ' · Week of ' + formatDate(week.value)
    : '',
)
function reset() {
  opened.value = false
  error.value = ''
  parsed.value = undefined
  mode.value = 'merge'
}
watch(() => [props.section, week.value], reset)
async function read(event: Event) {
  const input = event.target as HTMLInputElement,
    f = input.files?.[0]
  if (!f) return
  reset()
  opened.value = true
  try {
    if (f.size > maxBytes) throw Error('File exceeds the 5 MiB import limit.')
    parsed.value = parseImport(await f.text(), props.section)
  } catch (e) {
    error.value = (e as Error).message
  }
  input.value = ''
}
const preview = computed(() => {
  if (!parsed.value) return null
  try {
    return previewImport(
      state.value,
      parsed.value,
      week.value,
      mode.value === 'replace',
    )
  } catch (e) {
    return { error: (e as Error).message }
  }
})
async function apply() {
  const p = preview.value
  if (applying.value || !p || 'error' in p) return
  applying.value = true
  error.value = ''
  try {
    await replaceState(p.next, props.section === 'backup')
    toast('Import applied')
    reset()
  } catch (e) {
    error.value = 'Import was not saved. ' + (e as Error).message
  } finally {
    applying.value = false
  }
}
</script>
<template>
  <section class="transfer">
    <div class="inline">
      <FileJson :size="20" /><strong>{{ label }} JSON{{ scope }}</strong>
    </div>
    <div class="actions">
      <button class="subtle" @click="download(section)">
        <Download />Export</button
      ><button class="subtle" @click="file?.click()"><Upload />Import</button>
    </div>
    <input
      ref="file"
      class="hidden"
      type="file"
      accept=".json,application/json"
      :aria-label="'Import ' + label + ' JSON'"
      @change="read"
    />
  </section>
  <Modal v-if="opened" :title="'Import ' + label" @close="!applying && reset()"
    ><p v-if="error" class="alert" role="alert">{{ error }}</p>
    <template v-if="parsed"
      ><p>{{ label }}{{ scope }} · Format version {{ parsed.formatVersion }}</p>
      <label v-if="section !== 'backup'"
        >Import method<select v-model="mode" :disabled="applying">
          <option value="merge">Merge / update by stable ID</option>
          <option value="replace">Replace this section</option>
        </select></label
      >
      <p v-if="section === 'backup'" class="alert">
        This replaces all children, foods, weeks, plans and packing checks on
        this device.
        <button class="link" @click="download('backup')">
          Export existing full backup
        </button>
      </p>
      <p v-else-if="mode === 'replace'" class="alert">
        Records absent from the file will be removed from this section.
      </p>
      <p class="alert" v-if="preview && 'error' in preview">
        {{ preview.error }}
      </p>
      <div v-else-if="preview" class="summary">
        <strong
          >{{
            Object.values(preview.changes).reduce((a, b) => a + b, 0)
          }}
          records compared</strong
        >
        <p>
          {{ preview.changes.added }} added ·
          {{ preview.changes.updated }} updated ·
          {{ preview.changes.removed }} removed ·
          {{ preview.changes.unchanged }} unchanged
        </p>
        <p>All required references resolve.</p>
      </div></template
    >
    <div class="actions end">
      <button class="secondary" :disabled="applying" @click="reset">{{ error ? 'Close' : 'Cancel' }}</button
      ><button
        class="primary"
        :disabled="applying || !preview || 'error' in preview"
        @click="apply"
      >
        {{ applying ? 'Saving…' : section === 'backup' ? 'Replace all data' : 'Apply import' }}
      </button>
    </div></Modal
  >
</template>
