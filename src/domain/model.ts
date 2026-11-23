export const weekdays = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
] as const
export type Day = (typeof weekdays)[number]
export type Rating = 'liked' | 'neutral' | 'disliked'
export interface Child {
  id: string
  name: string
  sortOrder: number
}
export interface Category extends Child {
  varietyRole: 'main' | 'other'
}
export interface Food {
  id: string
  name: string
  categoryIds: string[]
  archived: boolean
  notes?: string
}
export function drinkCategory(categories: Category[]): Category {
  const matches = categories.filter(c => /^drinks?$/i.test(c.name.trim()))
  const existing = matches.find(c => c.id === 'cat-drink') ?? matches[0]
  if (existing) return existing
  // A restored catalog may already use the starter ID for a different category.
  const ids = new Set(categories.map(c => c.id))
  let id = 'cat-drink'
  for (let n = 2; ids.has(id); n++) id = 'cat-drink-' + n
  return { id, name: 'Drink', varietyRole: 'other', sortOrder: categories.length }
}
export interface Requirement {
  categoryId: string
  count: number
}
export interface Meal {
  id: string
  name: string
  sortOrder: number
  requirements: Requirement[]
}
export interface Schedule {
  childId: string
  weekdays: Record<Day, Meal[]>
}
export interface Preference {
  childId: string
  foodId: string
  rating: Rating
}
export interface Entry {
  foodId: string
  available: boolean
}
export interface Inventory {
  weekStart: string
  entries: Entry[]
  updatedAt: string
}
export interface Slot {
  slotId: string
  categoryId: string
  categoryNameSnapshot: string
  foodId: string | null
  foodNameSnapshot: string | null
}
export interface PlannedMeal {
  mealId: string
  mealNameSnapshot: string
  sortOrder: number
  slots: Slot[]
}
export interface ChildDay {
  childId: string
  meals: PlannedMeal[]
}
export interface PlannedDay {
  date: string
  children: ChildDay[]
}
export interface Packed {
  date: string
  childId: string
  mealId: string
  slotId: string
  packed: boolean
}
export interface Plan {
  weekStart: string
  generatedAt: string
  generatorVersion: number
  seed: string
  days: PlannedDay[]
  packedSlots: Packed[]
}
export interface SchoolLunch {
  date: string
  childId: string
  mealId: string
}
export interface State {
  stateVersion: 1
  children: Child[]
  categories: Category[]
  foods: Food[]
  schedules: Schedule[]
  preferences: Preference[]
  weeklyInventories: Inventory[]
  weeklyPlans: Plan[]
  schoolLunches: SchoolLunch[]
  setupComplete: boolean
}
export type Scope = { childId?: string; date?: string }
export type Section =
  | 'children'
  | 'catalog'
  | 'schedules'
  | 'preferences'
  | 'inventory'
  | 'packing'
  | 'backup'
export const uid = () =>
  crypto.randomUUID?.() ??
  Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) =>
    n.toString(36),
  ).join('-')
export const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x))
export const packedKey = (p: Omit<Packed, 'packed'>) =>
  JSON.stringify([p.date, p.childId, p.mealId, p.slotId])
export function template(childId: string): Schedule {
  const weekdaysMap = {} as Record<Day, Meal[]>
  for (const day of weekdays)
    weekdaysMap[day] = [
      {
        id: 'snack',
        name: 'Morning snack',
        sortOrder: 0,
        requirements: [{ categoryId: 'cat-snack', count: 1 }],
      },
      {
        id: 'lunch',
        name: 'Lunch',
        sortOrder: 1,
        requirements: [
          { categoryId: 'cat-main', count: 1 },
          { categoryId: 'cat-snack', count: 2 },
        ],
      },
    ]
  return { childId, weekdays: weekdaysMap }
}
export function seedState(): State {
  const children = ['Child 1', 'Child 2'].map((name, sortOrder) => ({
    id: 'child-' + (sortOrder + 1),
    name,
    sortOrder,
  }))
  return {
    stateVersion: 1,
    setupComplete: false,
    children,
    categories: ['Main', 'Snack', 'Fruit', 'Vegetable', 'Protein', 'Drink'].map(
      (name, sortOrder) => ({
        id: 'cat-' + name.toLowerCase(),
        name,
        sortOrder,
        varietyRole: sortOrder === 0 ? 'main' : 'other',
      }),
    ),
    foods: [],
    schedules: children.map((c) => template(c.id)),
    preferences: [],
    weeklyInventories: [],
    weeklyPlans: [],
    schoolLunches: [],
  }
}
