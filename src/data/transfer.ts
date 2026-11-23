import type {
  State,
  Section,
  Plan,
  Inventory,
  Packed,
  Entry,
  Food,
  Category,
  Child,
  Schedule,
  Preference,
  SchoolLunch,
} from '../domain/model'
import { addFruitPouchCategory, clone, packedKey, weekdays } from '../domain/model'
import { addDays, monday, noon } from '../domain/dates'
import { schemaFor, sections, validatePayload } from './schemas'
export const maxBytes = 5 * 1024 * 1024
type Payload = {
  section: Section
  formatVersion: number
  appState?: State
  categories?: Category[]
  foods?: Food[]
  children?: Child[]
  schedules?: Schedule[]
  preferences?: Preference[]
  weekStart?: string
  entries?: Entry[]
  updatedAt?: string
  packedSlots?: Packed[]
}
export function exportSection(state: State, section: Section, week: string) {
  let fields: Partial<Payload>
  switch (section) {
    case 'backup':
      fields = { appState: state }
      break
    case 'catalog':
      fields = { categories: state.categories, foods: state.foods }
      break
    case 'inventory':
      fields = state.weeklyInventories.find((w) => w.weekStart === week) ?? {
        weekStart: week,
        entries: [],
        updatedAt: week + 'T12:00:00Z',
      }
      break
    case 'packing':
      fields = {
        weekStart: week,
        packedSlots:
          state.weeklyPlans.find((w) => w.weekStart === week)?.packedSlots ??
          [],
      }
      break
    default:
      fields = { [section]: state[section] }
  }
  return {
    schema: schemaFor(section),
    data: clone({ section, formatVersion: 1, ...fields }),
  }
}
function unique<T>(rows: T[], key: (r: T) => string, path: string) {
  const seen = new Set<string>()
  rows.forEach((r, i) => {
    const k = key(r)
    if (seen.has(k)) throw Error(path + '[' + i + ']: duplicate key ' + k)
    seen.add(k)
  })
  return seen
}
const byId = (r: { id: string }) => r.id
const byFood = (r: { foodId: string }) => r.foodId
const byChild = (r: { childId: string }) => r.childId
const byWeek = (r: { weekStart: string }) => r.weekStart
const byPref = (p: Preference) => JSON.stringify([p.childId, p.foodId])
const byChildDate = (e: SchoolLunch) => JSON.stringify([e.childId, e.date])
function requireRef(ok: boolean, path: string) {
  if (!ok)
    throw Error(
      path + '. Check the referenced records or restore a full backup.',
    )
}
function planIntegrity(plan: Plan, path: string) {
  const realSlots = new Set<string>()
  plan.days.forEach((day, i) => {
    const d = path + '.days[' + i + ']'
    requireRef(
      day.date === addDays(plan.weekStart, i),
      d + '.date must be Monday + ' + i + ' days',
    )
    unique(day.children, byChild, d + '.children')
    day.children.forEach((c, j) => {
      const cp = d + '.children[' + j + ']'
      unique(c.meals, (m) => m.mealId, cp + '.meals')
      c.meals.forEach((meal, k) => {
        const mp = cp + '.meals[' + k + ']'
        unique(meal.slots, (s) => s.slotId, mp + '.slots')
        unique(
          meal.slots.filter((s) => s.foodId !== null),
          (s) => s.foodId!,
          mp + '.foods',
        )
        meal.slots.forEach((s, n) => {
          requireRef(
            (s.foodId === null) === (s.foodNameSnapshot === null),
            mp + '.slots[' + n + '] snapshot mismatch',
          )
          if (s.foodId)
            realSlots.add(
              packedKey({
                date: day.date,
                childId: c.childId,
                mealId: meal.mealId,
                slotId: s.slotId,
              }),
            )
        })
      })
    })
  })
  unique(plan.packedSlots, packedKey, path + '.packedSlots')
  plan.packedSlots.forEach((p, i) =>
    requireRef(
      realSlots.has(packedKey(p)),
      path + '.packedSlots[' + i + '] has no assigned slot',
    ),
  )
}
export function validateState(s: State) {
  validatePayload('backup', {
    section: 'backup',
    formatVersion: 1,
    appState: s,
  })
  const children = unique(s.children, byId, 'children'),
    cats = unique(s.categories, byId, 'categories'),
    foods = unique(s.foods, byId, 'foods')
  unique(s.schedules, byChild, 'schedules')
  unique(s.preferences, byPref, 'preferences')
  unique(s.weeklyPlans, byWeek, 'weeklyPlans')
  unique(s.weeklyInventories, byWeek, 'weeklyInventories')
  const exceptions = s.schoolLunches ?? []
  unique(exceptions, byChildDate, 'schoolLunches')
  for (const e of exceptions) {
    requireRef(children.has(e.childId), 'schoolLunches references unknown child')
    const weekday = noon(e.date).getDay()
    if (weekday === 0 || weekday === 6) throw Error('School lunch dates must be weekdays.')
  }
  const suppressed = new Map(exceptions.map(e => [byChildDate(e), e.mealId]))
  s.foods.forEach((f, i) =>
    f.categoryIds.forEach((c) =>
      requireRef(
        cats.has(c),
        'foods[' + i + '].categoryIds references unknown ' + c,
      ),
    ),
  )
  s.schedules.forEach((sch, i) => {
    requireRef(
      children.has(sch.childId),
      'schedules[' + i + '].childId unknown',
    )
    for (const d of weekdays) {
      const path = 'schedules[' + i + '].weekdays.' + d
      unique(sch.weekdays[d], byId, path)
      for (const [j, m] of sch.weekdays[d].entries())
        for (const [k, r] of m.requirements.entries())
          requireRef(
            cats.has(r.categoryId),
            path + '[' + j + '].requirements[' + k + '].categoryId unknown',
          )
    }
  })
  s.preferences.forEach((p, i) =>
    requireRef(
      children.has(p.childId) && foods.has(p.foodId),
      'preferences[' + i + '] references unknown child or food',
    ),
  )
  s.weeklyInventories.forEach((w, i) => {
    const path = 'weeklyInventories[' + i + ']'
    requireRef(
      monday(w.weekStart) === w.weekStart,
      path + '.weekStart must be Monday',
    )
    unique(w.entries, byFood, path + '.entries')
    w.entries.forEach((e, j) =>
      requireRef(
        foods.has(e.foodId),
        path + '.entries[' + j + '].foodId unknown',
      ),
    )
  })
  s.weeklyPlans.forEach((p, i) => {
    requireRef(
      monday(p.weekStart) === p.weekStart,
      'weeklyPlans[' + i + '].weekStart must be Monday',
    )
    planIntegrity(p, 'weeklyPlans[' + i + ']')
    for (const day of p.days)
      for (const child of day.children) {
        const target = suppressed.get(JSON.stringify([child.childId, day.date]))
        if (child.meals.some(m => m.mealId === target))
          throw Error('A school lunch cannot also have a packed meal on that date.')
      }
  })
}
export function migrateState(raw: unknown): State {
  const version = (raw as { stateVersion?: unknown } | null)?.stateVersion
  if (version !== 1 && version !== 2)
    throw Error(
      'Unsupported or missing stateVersion. Keep a copy and open it with a compatible version.',
    )
  validateState(raw as State)
  const state = clone(raw as State)
  if (version === 1) {
    addFruitPouchCategory(state.categories)
    state.stateVersion = 2
  }
  state.schoolLunches ??= []
  return state
}
export function parseImport(source: string, section: Section): Payload {
  if (new Blob([source]).size > maxBytes)
    throw Error('File exceeds the 5 MiB import limit.')
  let x
  try {
    x = JSON.parse(source)
  } catch {
    throw Error('Invalid JSON. Check the file syntax.')
  }
  if (!x || !x.data || !x.schema)
    throw Error('Expected top-level schema and data objects.')
  const d = x.data
  if (!sections.includes(d.section) || d.section !== section)
    throw Error(
      'data.section must be ' + section + '. Open the matching data screen.',
    )
  if (d.formatVersion !== 1)
    throw Error('Unsupported data.formatVersion. Use a compatible app version.')
  if (x.schema.$id !== schemaFor(section).$id)
    throw Error('schema.$id does not match this section and version.')
  validatePayload(section, d)
  return d
}
export interface Changes {
  added: number
  updated: number
  removed: number
  unchanged: number
}
export function previewImport(
  state: State,
  d: Payload,
  week: string,
  replace = false,
) {
  const next = clone(state),
    changes: Changes = { added: 0, updated: 0, removed: 0, unchanged: 0 }
  function merge<T>(
    old: T[],
    incoming: T[],
    key: (x: T) => string,
    path: string,
    overwrite = replace,
  ) {
    const keys = unique(incoming, key, path),
      map = new Map(old.map((x) => [key(x), x]))
    if (overwrite)
      for (const k of map.keys())
        if (!keys.has(k)) {
          map.delete(k)
          changes.removed++
        }
    for (const row of incoming) {
      const before = map.get(key(row))
      if (before === undefined) changes.added++
      else if (JSON.stringify(before) !== JSON.stringify(row)) changes.updated++
      else changes.unchanged++
      map.set(key(row), clone(row))
    }
    return [...map.values()]
  }
  if (d.weekStart && (d.weekStart !== week || monday(week) !== week))
    throw Error(
      'data.weekStart is ' +
        d.weekStart +
        '. Select that Monday before importing.',
    )
  switch (d.section) {
    case 'backup': {
      const restored = migrateState(d.appState)
      merge(state.children, restored.children, byId, 'children', true)
      merge(state.foods, restored.foods, byId, 'foods', true)
      merge(state.categories, restored.categories, byId, 'categories', true)
      merge(
        state.preferences,
        restored.preferences,
        byPref,
        'preferences',
        true,
      )
      merge(state.schedules, restored.schedules, byChild, 'schedules', true)
      merge(
        state.weeklyInventories,
        restored.weeklyInventories,
        byWeek,
        'inventory',
        true,
      )
      merge(state.weeklyPlans, restored.weeklyPlans, byWeek, 'plans', true)
      merge(state.schoolLunches, restored.schoolLunches, byChildDate, 'schoolLunches', true)
      return { next: restored, changes }
    }
    case 'catalog':
      next.foods = merge(next.foods, d.foods!, byId, 'foods')
      next.categories = merge(
        next.categories,
        d.categories!,
        byId,
        'categories',
      )
      break
    case 'children':
      next.children = merge(next.children, d.children!, byId, 'children')
      break
    case 'preferences':
      next.preferences = merge(
        next.preferences,
        d.preferences!,
        byPref,
        'preferences',
      )
      break
    case 'schedules':
      next.schedules = merge(next.schedules, d.schedules!, byChild, 'schedules')
      break
    case 'inventory': {
      const index = next.weeklyInventories.findIndex(
        (w) => w.weekStart === week,
      )
      const old = next.weeklyInventories[index]
      const value: Inventory = {
        weekStart: week,
        updatedAt: d.updatedAt!,
        entries: merge(old?.entries ?? [], d.entries!, byFood, 'entries'),
      }
      if (index >= 0) next.weeklyInventories[index] = value
      else if (value.entries.length || value.updatedAt !== week + 'T12:00:00Z')
        next.weeklyInventories.push(value)
      break
    }
    case 'packing': {
      const p = next.weeklyPlans.find((p) => p.weekStart === week)
      if (!p && d.packedSlots!.length)
        throw Error(
          'No plan exists for these packing records. Restore a full backup.',
        )
      if (p)
        p.packedSlots = merge(
          p.packedSlots,
          d.packedSlots!,
          packedKey,
          'packedSlots',
        )
    }
  }
  validateState(next)
  return { next, changes }
}
export function downloadJSON(value: unknown, filename: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  )
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}
