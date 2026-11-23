import { addDays, monday, noon } from './dates'
import { clone, weekdays } from './model'
import type {
  State,
  Scope,
  Plan,
  Slot,
  Food,
  PlannedMeal,
  ChildDay,
  Meal,
  SchoolLunch,
} from './model'

export const inScope = (scope: Scope, date: string, childId: string) =>
  (!scope.date || scope.date === date) &&
  (!scope.childId || scope.childId === childId)

export function schoolLunchFor(state: State, date: string, childId: string) {
  return state.schoolLunches.find(e => e.date === date && e.childId === childId)
}
export function scheduledMeals(state: State, date: string, childId: string) {
  const weekday = weekdays[noon(date).getDay() - 1]
  return state.schedules.find(s => s.childId === childId)?.weekdays[weekday] ?? []
}
export function lunchMealId(meals: Pick<Meal, 'id' | 'name'>[], selected?: string) {
  if (selected && meals.some(m => m.id === selected)) return selected
  const starter = meals.find(m => m.id === 'lunch')
  if (starter) return starter.id
  const named = meals.filter(m => /^(?:packed |school )?lunch(?:box)?$/i.test(m.name.trim()))
  return named.length === 1 ? named[0].id : undefined
}

export function setSchoolLunch(state: State, choice: SchoolLunch, buying: boolean) {
  const { date, childId } = choice
  const previous = schoolLunchFor(state, date, childId)
  if (buying === Boolean(previous)) return
  if (buying) state.schoolLunches.push({ ...choice })
  else state.schoolLunches = state.schoolLunches.filter(e => e !== previous)

  const plan = state.weeklyPlans.find(p => p.weekStart === monday(date))
  if (!plan) return
  const dayIndex = noon(date).getDay() - 1
  const day = plan.days[dayIndex]
  let child = day.children.find(c => c.childId === childId)
  if (buying) {
    if (!child) return
    const meals = child.meals.map(m => ({ id: m.mealId, name: m.mealNameSnapshot }))
    const target = lunchMealId(meals, choice.mealId)
    child.meals = child.meals.filter(m => m.mealId !== target)
    plan.packedSlots = plan.packedSlots.filter(p =>
      p.date !== date || p.childId !== childId || p.mealId !== target)
    return
  }
  const schedule = scheduledMeals(state, date, childId)
  const target = lunchMealId(schedule, previous!.mealId)
  const meal = schedule.find(m => m.id === target)
  if (!meal || child?.meals.some(m => m.mealId === meal.id)) return
  if (!child) {
    child = { childId, meals: [] }
    day.children.push(child)
  }
  const restored = mealGenerator(state, plan, plan.seed)(dayIndex, childId, meal)
  const following = child.meals.findIndex(m => m.sortOrder > meal.sortOrder)
  child.meals.splice(following < 0 ? child.meals.length : following, 0, restored)
}

function jitter(seed: string) {
  let hash = 2166136261
  for (const c of seed) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619)
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x85ebca6b)
  hash ^= hash >>> 13
  return (hash >>> 0) / 4294967296
}

// Maximum-cardinality matching. Keep the best free option, then try an
// augmenting path before declaring a shortage in a multi-category meal.
function match(options: Food[][]) {
  const assigned = new Map<string, number>(),
    result: (Food | null)[] = options.map(() => null)
  const place = (slot: number, seen: Set<string>): boolean => {
    for (const food of options[slot])
      if (!assigned.has(food.id)) {
        assigned.set(food.id, slot)
        result[slot] = food
        return true
      }
    for (const food of options[slot]) {
      if (seen.has(food.id)) continue
      seen.add(food.id)
      if (place(assigned.get(food.id)!, seen)) {
        assigned.set(food.id, slot)
        result[slot] = food
        return true
      }
    }
    return false
  }
  options
    .map((_, i) => i)
    .sort((a, b) => options[a].length - options[b].length)
    .forEach((i) => place(i, new Set()))
  return result
}
function mealGenerator(state: State, plan: Plan, seed: string) {
  const stock = new Set(
    state.weeklyInventories
      .find((i) => i.weekStart === plan.weekStart)
      ?.entries.filter((e) => e.available)
      .map((e) => e.foodId),
  )
  const foods = state.foods.filter((f) => stock.has(f.id) && !f.archived)
  const ratings = new Map(
    state.preferences.map((p) => [
      JSON.stringify([p.childId, p.foodId]),
      p.rating,
    ]),
  )
  const category = new Map(state.categories.map((c) => [c.id, c]))
  return (di: number, childId: string, meal: Meal): PlannedMeal => {
    const slots: Slot[] = meal.requirements.flatMap((r) =>
      Array.from({ length: r.count }, () => ({
        slotId: '',
        categoryId: r.categoryId,
        categoryNameSnapshot: category.get(r.categoryId)!.name,
        foodId: null,
        foodNameSnapshot: null,
      })),
    )
    const uses = new Map<string, number>(),
      same = new Set<string>(),
      shared = new Set<string>(),
      adjacent = new Set<string>()
    for (const [index, other] of plan.days.entries())
      for (const c of other.children)
        for (const m of c.meals)
          for (const s of m.slots) {
            if (!s.foodId) continue
            if (c.childId === childId) {
              uses.set(s.foodId, (uses.get(s.foodId) ?? 0) + 1)
              if (index === di) same.add(s.foodId)
              if (
                Math.abs(index - di) === 1 &&
                category.get(s.categoryId)?.varietyRole === 'main'
              )
                adjacent.add(s.foodId)
            } else if (index === di) shared.add(s.foodId)
          }
    const options = slots.map((s, i) => {
      s.slotId = 'slot-' + (i + 1)
      const scored = foods.flatMap((f) => {
        const rating = ratings.get(JSON.stringify([childId, f.id]))
        if (!f.categoryIds.includes(s.categoryId) || rating === 'disliked')
          return []
        const score =
          jitter(
            JSON.stringify([seed, plan.days[di].date, childId, meal.id, i, f.id]),
          ) *
            4 +
          (rating === 'liked' ? 3 : 0) -
          (uses.get(f.id) ?? 0) * 1.1 -
          (same.has(f.id) ? 2 : 0) +
          (shared.has(f.id) ? 2.6 : 0) -
          (category.get(s.categoryId)?.varietyRole === 'main' &&
          adjacent.has(f.id)
            ? 1000
            : 0)
        return [{ food: f, score }]
      })
      return scored
        .sort(
          (a, b) => b.score - a.score || a.food.id.localeCompare(b.food.id),
        )
        .map((x) => x.food)
    })
    match(options).forEach((food, i) => {
      slots[i].foodId = food?.id ?? null
      slots[i].foodNameSnapshot = food?.name ?? null
    })
    return {
      mealId: meal.id,
      mealNameSnapshot: meal.name,
      sortOrder: meal.sortOrder,
      slots,
    }
  }
}
export function generatePlan(
  state: State,
  week: string,
  requested: Scope,
  seed: string,
  generatedAt = week + 'T12:00:00Z',
): Plan {
  const prior = state.weeklyPlans.find((p) => p.weekStart === week)
  const scope = prior ? requested : {}
  const plan: Plan = prior
    ? clone(prior)
    : {
        weekStart: week,
        generatedAt,
        seed,
        generatorVersion: 1,
        days: weekdays.map((_, i) => ({
          date: addDays(week, i),
          children: [],
        })),
        packedSlots: [],
      }
  Object.assign(plan, { seed, generatedAt, generatorVersion: 1 })
  plan.packedSlots = plan.packedSlots.filter(
    (p) => !inScope(scope, p.date, p.childId),
  )
  const assignMeal = mealGenerator(state, plan, seed)
  for (const day of plan.days)
    day.children = day.children.filter(
      (c) => !inScope(scope, day.date, c.childId),
    )
  for (const [di, day] of plan.days.entries()) {
    for (const child of [...state.children].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    )) {
      if (!inScope(scope, day.date, child.id)) continue
      const result: ChildDay = { childId: child.id, meals: [] }
      day.children.push(result)
      const schedule =
        state.schedules.find((s) => s.childId === child.id)?.weekdays[
          weekdays[di]
        ] ?? []
      const exception = schoolLunchFor(state, day.date, child.id)
      const suppressed = exception && lunchMealId(schedule, exception.mealId)
      for (const meal of [...schedule].sort(
        (a, b) => a.sortOrder - b.sortOrder,
      )) {
        if (meal.id !== suppressed) result.meals.push(assignMeal(di, child.id, meal))
      }
    }
    if (scope.date && day.date !== scope.date) continue
    const previousOrder = prior?.days[di].children.map((c) => c.childId) ?? []
    const order = (id: string) => {
      const index = previousOrder.indexOf(id)
      return index >= 0
        ? index
        : previousOrder.length +
            (state.children.find((c) => c.id === id)?.sortOrder ?? 0)
    }
    day.children.sort((a, b) => order(a.childId) - order(b.childId))
  }
  return plan
}
export interface Warning {
  date: string
  childId: string
  meal: string
  message: string
}
export function warnings(state: State, plan: Plan): Warning[] {
  const list: Warning[] = []
  const available = new Set(
    state.weeklyInventories
      .find((w) => w.weekStart === plan.weekStart)
      ?.entries.filter((e) => e.available)
      .map((e) => e.foodId),
  )
  const foods = new Map(state.foods.map((f) => [f.id, f]))
  const dislikes = new Set(
    state.preferences
      .filter((p) => p.rating === 'disliked')
      .map((p) => JSON.stringify([p.childId, p.foodId])),
  )
  const structure = (m: PlannedMeal) => [
    m.mealId,
    m.mealNameSnapshot,
    m.sortOrder,
    m.slots.map((s) => s.categoryId),
  ]
  const definition = (m: Meal) => [
    m.id,
    m.name,
    m.sortOrder,
    m.requirements.flatMap((r) => Array(r.count).fill(r.categoryId)),
  ]
  for (const [i, day] of plan.days.entries()) {
    for (const child of state.children) {
      const current =
        state.schedules.find((s) => s.childId === child.id)?.weekdays[
          weekdays[i]
        ] ?? []
      const exception = schoolLunchFor(state, day.date, child.id)
      const suppressed = exception && lunchMealId(current, exception.mealId)
      const saved =
        day.children.find((c) => c.childId === child.id)?.meals ?? []
      if (
        JSON.stringify(
          current.filter(m => m.id !== suppressed)
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map(definition),
        ) !== JSON.stringify(saved.map(structure))
      )
        list.push({
          date: day.date,
          childId: child.id,
          meal: 'Schedule',
          message: 'Meal requirements have changed.',
        })
    }
    for (const c of day.children)
      for (const meal of c.meals) {
        const add = (message: string) =>
          list.push({
            date: day.date,
            childId: c.childId,
            meal: meal.mealNameSnapshot,
            message,
          })
        const missing = new Map<string, number>()
        for (const s of meal.slots) {
          if (!s.foodId) {
            missing.set(
              s.categoryNameSnapshot,
              (missing.get(s.categoryNameSnapshot) ?? 0) + 1,
            )
            continue
          }
          const f = foods.get(s.foodId),
            name = s.foodNameSnapshot
          if (!f) add(name + ' was deleted.')
          else if (f.archived) add(name + ' is archived.')
          else if (dislikes.has(JSON.stringify([c.childId, f.id])))
            add(name + ' is now disliked.')
          else if (!available.has(f.id)) add(name + ' is unavailable.')
          else if (!f.categoryIds.includes(s.categoryId))
            add(name + ' no longer belongs to ' + s.categoryNameSnapshot + '.')
        }
        for (const [cat, n] of missing)
          add(
            n +
              ' ' +
              cat +
              ' slot' +
              (n === 1 ? '' : 's') +
              ' missing. Add an available, accepted food.',
          )
      }
  }
  return list
}
export function prepSummary(plan: Plan) {
  const seen = new Set<string>(),
    groups = new Map<string, string[]>()
  for (const d of plan.days)
    for (const c of d.children)
      for (const m of c.meals)
        for (const s of m.slots) {
          if (!s.foodId || seen.has(s.foodId)) continue
          seen.add(s.foodId)
          const names = groups.get(s.categoryNameSnapshot) ?? []
          names.push(s.foodNameSnapshot!)
          groups.set(s.categoryNameSnapshot, names)
        }
  return groups
}
