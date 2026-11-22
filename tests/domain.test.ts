import { describe, it, expect } from 'vitest'
import { addDays, localDate, monday, noon } from '../src/domain/dates'
import {
  seedState,
  clone,
  drinkCategory,
  weekdays,
  type State,
  type Scope,
} from '../src/domain/model'
import {
  generatePlan,
  warnings,
  prepSummary,
  inScope,
} from '../src/domain/planner'
const week = '2026-11-23'
function fixture(n = 6) {
  const s = seedState()
  s.foods = Array.from({ length: n }, (_, i) => ({
    id: 'f' + i,
    name: 'Food ' + i,
    archived: false,
    categoryIds: ['cat-main', 'cat-snack'],
  }))
  s.weeklyInventories = [
    {
      weekStart: week,
      updatedAt: week + 'T12:00:00Z',
      entries: s.foods.map((f) => ({ foodId: f.id, available: true })),
    },
  ]
  return s
}
const fills = (s: State, seed = 'A') =>
  generatePlan(s, week, {}, seed).days.flatMap((d) =>
    d.children.flatMap((c) => c.meals.flatMap((m) => m.slots)),
  )
describe('local calendar', () => {
  it.each([
    ['2023-01-01', '2023-01-02'],
    ['2024-02-29', '2024-02-26'],
    ['2026-03-08', '2026-03-09'],
    ['2026-11-01', '2026-11-02'],
    ['2026-11-21', '2026-11-23'],
  ])('selects the weekday planning week for %s', (d, w) =>
    expect(monday(d, true)).toBe(w),
  )
  it('crosses calendar boundaries without UTC shifts', () => {
    expect(monday('2023-01-01')).toBe('2022-12-26')
    expect(addDays('2024-02-28', 2)).toBe('2024-03-01')
    expect(localDate(noon(addDays('2026-03-07', 2)))).toBe('2026-03-09')
  })
})
describe('planner', () => {
  it('uses a catalog’s drink ID and leaves repurposed category IDs intact', () => {
    const categories = seedState().categories
    const starter = drinkCategory(categories)
    expect(starter.id).toBe('cat-drink')
    starter.name = 'Dessert'
    const added = drinkCategory(categories)
    expect(added.name).toBe('Drink')
    expect(categories.some(c => c.id === added.id)).toBe(false)
    categories.push({ ...added, id: 'custom-milk', name: 'Drinks' })
    expect(drinkCategory(categories).id).toBe('custom-milk')
  })
  it('reports a drink shortage only for the child and meal that requested it', () => {
    const s = fixture()
    s.schedules[0].weekdays.Monday[1].requirements.push({ categoryId: 'cat-drink', count: 1 })
    for (const id of ['archived', 'unavailable', 'disliked']) {
      s.foods.push({ id, name: id, archived: id === 'archived', categoryIds: ['cat-drink'] })
      s.weeklyInventories[0].entries.push({ foodId: id, available: id !== 'unavailable' })
    }
    s.preferences.push({ childId: 'child-1', foodId: 'disliked', rating: 'disliked' })
    const plan = generatePlan(s, week, {}, 'drinks')
    const slots = plan.days.flatMap(d => d.children.flatMap(c => c.meals.flatMap(m => m.slots)))
    expect(slots.filter(slot => slot.categoryId === 'cat-drink')).toHaveLength(1)
    expect(warnings(s, plan)).toEqual([{
      date: week, childId: 'child-1', meal: 'Lunch',
      message: '1 Drink slot missing. Add an available, accepted food.',
    }])
  })
  it('keeps weekdays and children independent', () => {
    const s = fixture()
    s.schedules[0].weekdays.Monday = []
    const p = generatePlan(s, week, {}, '1')
    expect(p.days[0].children[0].meals).toHaveLength(0)
    expect(p.days[0].children[1].meals).toHaveLength(2)
    expect(p.days[1].children[0].meals).toHaveLength(2)
  })
  it('enforces exclusions, unique meals, unlimited daily reuse and precise shortages', () => {
    const s = fixture(4)
    s.foods[1].archived = true
    s.weeklyInventories[0].entries[2].available = false
    s.preferences = s.children.map((c) => ({
      childId: c.id,
      foodId: 'f3',
      rating: 'disliked',
    }))
    const p = generatePlan(s, week, {}, 'x')
    for (const d of p.days)
      for (const c of d.children)
        for (const m of c.meals)
          expect(m.slots.filter((s) => s.foodId).map((s) => s.foodId)).toEqual([
            'f0',
          ])
    expect(warnings(s, p)[0]).toEqual({
      date: week,
      childId: 'child-1',
      meal: 'Lunch',
      message: '2 Snack slots missing. Add an available, accepted food.',
    })
  })
  it('matches scarce cross-tag options without false shortages', () => {
    const s = fixture(3)
    s.foods[1].categoryIds = ['cat-main']
    s.foods[2].categoryIds = ['cat-snack']
    for (const slot of fills(s)) expect(slot.foodId).not.toBeNull()
  })
  it('is deterministic, varies by seed and ignores packing', () => {
    const s = fixture(),
      p = generatePlan(s, week, {}, 'a')
    expect(generatePlan(s, week, {}, 'a')).toEqual(p)
    expect(fills(s, 'a')).not.toEqual(fills(s, 'b'))
    s.weeklyPlans.push(clone(p))
    s.weeklyPlans[0].packedSlots.push({
      date: week,
      childId: 'child-1',
      mealId: 'snack',
      slotId: 'slot-1',
      packed: true,
    })
    expect(generatePlan(s, week, {}, 'a')).toEqual(p)
  })
  it('favors liked food, avoids adjacent mains, shares across children and respects different dislikes', () => {
    const s = fixture(4)
    for (const sch of s.schedules)
      for (const day of weekdays)
        sch.weekdays[day] = [
          {
            id: 'm',
            name: 'Main',
            sortOrder: 0,
            requirements: [{ categoryId: 'cat-main', count: 1 }],
          },
        ]
    let shared = 0,
      liked = 0
    const seen = new Set<string>()
    s.preferences.push({ childId: 'child-1', foodId: 'f0', rating: 'liked' })
    for (let i = 0; i < 100; i++) {
      const p = generatePlan(s, week, {}, String(i))
      let previous = ''
      for (const d of p.days) {
        const [a, b] = d.children.map((c) => c.meals[0].slots[0].foodId!)
        expect(a).not.toBe(previous)
        previous = a
        seen.add(a)
        if (a === 'f0') liked++
        if (a === b) shared++
      }
    }
    expect(liked).toBeGreaterThan(125)
    expect(shared).toBeGreaterThan(160)
    expect(seen.size).toBe(4)
    s.preferences.push({ childId: 'child-2', foodId: 'f0', rating: 'disliked' })
    expect(
      generatePlan(s, week, {}, 'a').days.every(
        (d) => d.children[1].meals[0].slots[0].foodId !== 'f0',
      ),
    ).toBe(true)
  })
  it.each<Scope>([
    { childId: 'child-1' },
    { date: week },
    { date: week, childId: 'child-2' },
    {},
  ])('preserves all other assignments and checks for %o', (scope) => {
    const s = fixture(),
      p = generatePlan(s, week, {}, 'a')
    s.weeklyPlans = [p]
    for (const d of p.days)
      for (const c of d.children)
        p.packedSlots.push({
          date: d.date,
          childId: c.childId,
          mealId: 'snack',
          slotId: 'slot-1',
          packed: true,
        })
    const before = JSON.stringify(s),
      next = generatePlan(s, week, scope, 'b')
    for (const d of p.days)
      for (const c of d.children)
        if (!inScope(scope, d.date, c.childId))
          expect(
            next.days
              .find((x) => x.date === d.date)
              ?.children.find((x) => x.childId === c.childId),
          ).toEqual(c)
    expect(next.packedSlots).toEqual(
      p.packedSlots.filter((p) => !inScope(scope, p.date, p.childId)),
    )
    expect(JSON.stringify(s)).toBe(before)
  })
  it('surfaces changes and keeps historic snapshots and first-category prep grouping', () => {
    const s = fixture(),
      p = generatePlan(s, week, {}, 'a'),
      original = JSON.stringify(p),
      prep = JSON.stringify([...prepSummary(p)])
    expect(warnings(s, p)).toEqual([])
    s.foods[0].name = 'Renamed'
    s.foods[0].archived = true
    s.weeklyInventories[0].entries = []
    s.schedules[0].weekdays.Monday = []
    expect(warnings(s, p).some((w) => w.meal === 'Schedule')).toBe(true)
    expect(warnings(s, p).some((w) => w.message.includes('unavailable'))).toBe(
      true,
    )
    expect(JSON.stringify(p)).toBe(original)
    expect(JSON.stringify([...prepSummary(p)])).toBe(prep)
    const names = [...prepSummary(p).values()].flat()
    expect(new Set(names).size).toBe(names.length)
  })
})
