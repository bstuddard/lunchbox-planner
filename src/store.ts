import { ref, shallowRef, computed } from 'vue'
import {
  clone,
  seedState,
  type State,
  type Section,
  type Scope,
  type Inventory,
} from './domain/model'
import { localDate, monday } from './domain/dates'
import { Database } from './data/database'
import { validateState, downloadJSON, exportSection } from './data/transfer'
export const state = shallowRef(seedState()),
  ready = ref(false),
  saving = ref(false),
  saveError = ref(''),
  savedAt = ref(''),
  lastExport = ref('')
export const today = ref(localDate()),
  week = ref(monday(today.value, true))
export const page = ref<'Today' | 'Week' | 'Inventory' | 'Foods' | 'Setup'>(
  'Today',
)
export const subsection = ref<
  'Children' | 'Schedules' | 'Preferences' | 'Data'
>('Children')
export const guide = ref(-1),
  notice = ref(''),
  selectedDay = ref(''),
  generation = ref<Scope | null>(null)
export const plan = computed(() =>
  state.value.weeklyPlans.find((p) => p.weekStart === week.value),
)
const db = new Database((message) => {
  saveError.value = message
})
export const recovery = () => db.recovery
let tail: Promise<void> = Promise.resolve(),
  pending = 0,
  toastTimer: ReturnType<typeof setTimeout>
export function toast(message: string) {
  notice.value = message
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (notice.value = ''), 4500)
}
function enqueue(snapshot: State, restore = false) {
  pending++
  saving.value = true
  tail = tail.then(async () => {
    try {
      savedAt.value =
        restore && db.recovery !== undefined
          ? await db.restoreCorrupt(snapshot)
          : await db.save(snapshot)
      saveError.value = ''
    } catch (e) {
      saveError.value = (e as Error).message
    } finally {
      pending--
      saving.value = pending > 0
    }
  })
  return tail
}
export const settled = () => tail
export async function initialize() {
  try {
    const existing = await db.open()
    if (existing) {
      state.value = existing.state
      savedAt.value = existing.savedAt
    } else await enqueue(state.value)
  } catch (e) {
    saveError.value = (e as Error).message
  }
  try {
    lastExport.value = localStorage.getItem('last-export') ?? ''
  } catch {
    /* metadata is optional */
  }
  ready.value = true
}
export function change(edit: (draft: State) => void, restore = false) {
  try {
    const next = clone(state.value)
    edit(next)
    validateState(next)
    state.value = next
    if (db.writeAllowed || (restore && db.recovery !== undefined))
      void enqueue(next, restore)
    return true
  } catch (e) {
    toast((e as Error).message)
    return false
  }
}
export function inventory(draft: State): Inventory {
  let inv = draft.weeklyInventories.find((w) => w.weekStart === week.value)
  if (!inv) {
    inv = { weekStart: week.value, entries: [], updatedAt: '' }
    draft.weeklyInventories.push(inv)
  }
  inv.updatedAt = new Date().toISOString()
  return inv
}
export function download(section: Section) {
  const date =
    section === 'inventory' || section === 'packing' ? week.value : localDate()
  downloadJSON(
    exportSection(state.value, section, week.value),
    'lunchbox-' +
      (section === 'backup' ? 'full-backup' : section) +
      '-' +
      date +
      '.json',
  )
  lastExport.value = new Date().toISOString()
  try {
    localStorage.setItem('last-export', lastExport.value)
  } catch {
    /* optional */
  }
  toast('Export downloaded')
}
const guideSteps = [
  ['Setup', 'Children'],
  ['Foods', ''],
  ['Setup', 'Schedules'],
  ['Inventory', ''],
  ['Week', ''],
] as const
export const guideTitles = [
  'Confirm child names',
  'Build your food catalog',
  'Review weekday schedules',
  'Choose available foods',
  'Generate your week',
]
export function goStep(index: number) {
  guide.value = index
  page.value = guideSteps[index][0]
  const sub = guideSteps[index][1]
  if (sub) subsection.value = sub
}
export function refreshDate() {
  const old = today.value
  today.value = localDate()
  if (old !== today.value && week.value === monday(old, true))
    week.value = monday(today.value, true)
}
