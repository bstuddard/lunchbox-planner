import { ref, shallowRef, computed } from 'vue'
import {
  clone,
  drinkCategory,
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
export const drink = computed(() => drinkCategory(state.value.categories))
export const categoryChoices = computed(() => {
  const categories = state.value.categories
  return categories.includes(drink.value) ? categories : [...categories, drink.value]
})
export function saveDrinkCategory(draft: State, selectedIds: string[]) {
  const category = drinkCategory(draft.categories)
  if (selectedIds.includes(category.id) && !draft.categories.includes(category))
    draft.categories.push(category)
}
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
  const written = tail.then(async () => {
    if (restore && db.recovery !== undefined) {
      savedAt.value = await db.restoreCorrupt(snapshot)
    } else {
      if (!db.writeAllowed) throw Error(saveError.value || 'Device database is unavailable.')
      savedAt.value = await db.save(snapshot)
    }
    saveError.value = ''
  })
  // Return this operation's outcome to its caller. The queue itself must
  // remain usable after a failed write, including when the user retries.
  tail = written
    .catch((e) => {
      saveError.value = (e as Error).message
    })
    .finally(() => {
      pending--
      saving.value = pending > 0
    })
  return written
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
export function replaceState(next: State, restore = false) {
  validateState(next)
  // Editors own their drafts. Keep the live state and its queued revision
  // detached from any mutable form or import-preview values.
  const snapshot = clone(next)
  state.value = snapshot
  return enqueue(snapshot, restore)
}
export function change(edit: (draft: State) => void) {
  try {
    const next = clone(state.value)
    edit(next)
    void replaceState(next)
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
