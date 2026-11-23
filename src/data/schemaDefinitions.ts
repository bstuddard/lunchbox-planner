import { weekdays } from '../domain/model'
import type { Section } from '../domain/model'

type Schema = Record<string, unknown>
const str = (description: string): Schema => ({
  type: 'string',
  minLength: 1,
  pattern: '\\S',
  description,
})
const id = str(
  'Stable opaque identifier. Preserve it when renaming or editing a record.',
)
const name = str('Display name shown on this device.')
const order = {
  type: 'integer',
  minimum: 0,
  description: 'Display order, lowest first.',
}
const date = {
  type: 'string',
  format: 'date',
  description: 'Local calendar date in YYYY-MM-DD format.',
}
const week = {
  ...date,
  description: 'Local calendar Monday starting the selected week.',
}
const stamp = {
  type: 'string',
  format: 'date-time',
  description: 'Timestamp with timezone.',
}
const bool = { type: 'boolean' }
const ref = (key: string) => ({ $ref: '#/$defs/' + key })
const array = (items: Schema, description?: string) => ({
  type: 'array',
  items,
  ...(description ? { description } : {}),
})
const obj = (
  properties: Record<string, Schema>,
  required = Object.keys(properties),
) => ({ type: 'object', additionalProperties: false, properties, required })
const originalStateFields = {
  stateVersion: { enum: [1, 2] },
  setupComplete: bool,
  children: array(ref('child')),
  categories: array(ref('category')),
  foods: array(ref('food')),
  schedules: array(ref('schedule')),
  preferences: array(ref('preference')),
  weeklyInventories: array(ref('inventory')),
  weeklyPlans: array(ref('plan')),
}
const defs: Record<string, Schema> = {
  child: obj({ id, name, sortOrder: order }),
  category: obj({
    id,
    name,
    sortOrder: order,
    varietyRole: {
      enum: ['main', 'other'],
      description: 'Main categories discourage consecutive weekday repeats.',
    },
  }),
  food: obj(
    {
      id,
      name,
      categoryIds: {
        ...array(id, 'References existing catalog categories.'),
        minItems: 1,
        uniqueItems: true,
      },
      archived: {
        ...bool,
        description: 'Archived foods cannot be selected for new plans.',
      },
      notes: { type: 'string' },
    },
    ['id', 'name', 'categoryIds', 'archived'],
  ),
  requirement: obj({
    categoryId: id,
    count: {
      type: 'integer',
      minimum: 1,
      maximum: 10,
      description: 'Number of unique foods requested in this category.',
    },
  }),
  meal: obj({
    id,
    name,
    sortOrder: order,
    requirements: { ...array(ref('requirement')), minItems: 1 },
  }),
  schedule: obj({
    childId: id,
    weekdays: obj(
      Object.fromEntries(
        weekdays.map((d) => [
          d,
          array(
            ref('meal'),
            'Ordered meals. An empty array means no meals on this day.',
          ),
        ]),
      ),
    ),
  }),
  preference: obj({
    childId: id,
    foodId: id,
    rating: {
      enum: ['liked', 'neutral', 'disliked'],
      description:
        'Disliked is a hard exclusion. Omitted preferences are neutral.',
    },
  }),
  entry: obj({
    foodId: id,
    available: {
      ...bool,
      description:
        'Explicit weekly availability. Omitted foods are unavailable.',
    },
  }),
  inventory: obj({
    weekStart: week,
    updatedAt: stamp,
    entries: array(ref('entry')),
  }),
  slot: obj({
    slotId: id,
    categoryId: id,
    categoryNameSnapshot: name,
    foodId: { anyOf: [id, { type: 'null' }] },
    foodNameSnapshot: {
      anyOf: [name, { type: 'null' }],
      description: 'Immutable display name; null for a missing slot.',
    },
  }),
  plannedMeal: obj({
    mealId: id,
    mealNameSnapshot: name,
    sortOrder: order,
    slots: array(ref('slot')),
  }),
  childDay: obj({ childId: id, meals: array(ref('plannedMeal')) }),
  day: obj({ date, children: array(ref('childDay')) }),
  packed: obj({
    date,
    childId: id,
    mealId: id,
    slotId: id,
    packed: {
      ...bool,
      description: 'Packing status of this exact nonempty generated slot.',
    },
  }),
  plan: obj({
    weekStart: week,
    generatedAt: stamp,
    generatorVersion: { type: 'integer', minimum: 1 },
    seed: id,
    days: { ...array(ref('day')), minItems: 5, maxItems: 5 },
    packedSlots: array(ref('packed')),
  }),
  schoolLunch: obj({ date, childId: id, mealId: id }),
  state: obj({
    ...originalStateFields,
    schoolLunches: array(ref('schoolLunch'), 'One packed meal replaced by school lunch per child and calendar date.'),
  }, Object.keys(originalStateFields)),
}
const payloads: Record<Section, Record<string, Schema>> = {
  children: { children: array(ref('child')) },
  catalog: { categories: array(ref('category')), foods: array(ref('food')) },
  preferences: { preferences: array(ref('preference')) },
  schedules: { schedules: array(ref('schedule')) },
  inventory: {
    weekStart: week,
    entries: array(ref('entry')),
    updatedAt: stamp,
  },
  packing: { weekStart: week, packedSlots: array(ref('packed')) },
  backup: { appState: ref('state') },
}
export const sections = Object.keys(payloads) as Section[]
export function schemaFor(section: Section) {
  const body = obj({
    section: { const: section },
    formatVersion: { const: 1 },
    ...payloads[section],
  })
  const needed: Record<string, Schema> = {}
  function collect(value: unknown) {
    if (!value || typeof value !== 'object') return
    for (const [key, field] of Object.entries(value)) {
      if (key === '$ref') {
        const target = String(field).split('/').pop()!
        if (!needed[target]) {
          needed[target] = defs[target]
          collect(defs[target])
        }
      } else collect(field)
    }
  }
  collect(body)
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'urn:lunchbox-planner:' + section + ':v1',
    title: 'Lunchbox Planner ' + section + ' export v1',
    description:
      'Validates data in the export envelope. Preserve stable IDs. Children, categories and foods referenced by current records must exist. Historical plans preserve name snapshots. Inventory and packing files affect only their stated Monday. Duplicate record keys are invalid.',
    ...body,
    $defs: needed,
  }
}
