import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { deleteDB, openDB } from 'idb'
import { seedState, clone } from '../src/domain/model'
import { generatePlan } from '../src/domain/planner'
import {
  exportSection,
  parseImport,
  previewImport,
  maxBytes,
  migrateState,
} from '../src/data/transfer'
import { sections } from '../src/data/schemas'
import { Database, storageMode } from '../src/data/database'
import { reactive } from 'vue'
const week = '2026-11-23'
function fixture() {
  const s = seedState()
  s.foods = [
    { id: 'f', name: 'Food', categoryIds: ['cat-snack'], archived: false },
  ]
  s.preferences = [{ childId: 'child-1', foodId: 'f', rating: 'liked' }]
  s.weeklyInventories = [
    {
      weekStart: week,
      entries: [{ foodId: 'f', available: true }],
      updatedAt: '2026-11-20T10:00:00Z',
    },
  ]
  const p = generatePlan(s, week, {}, 'a')
  p.packedSlots = [
    {
      date: week,
      childId: 'child-1',
      mealId: 'snack',
      slotId: 'slot-1',
      packed: true,
    },
  ]
  s.weeklyPlans.push(p)
  return s
}
describe('section transfer', () => {
  it.each(sections)(
    'round trips %s in both modes with a self-contained schema',
    (section) => {
      const s = fixture(),
        out = exportSection(s, section, week)
      expect(Object.keys(out)).toEqual(['schema', 'data'])
      expect(out.schema.$id).toContain(section)
      for (const match of JSON.stringify(out.schema).matchAll(
        /"\$ref":"#\/\$defs\/(\w+)"/g,
      ))
        expect(out.schema.$defs).toHaveProperty(match[1])
      for (const replace of [false, true])
        expect(
          previewImport(
            s,
            parseImport(JSON.stringify(out), section),
            week,
            replace,
          ).next,
        ).toEqual(s)
    },
  )
  it('merges explicit false and neutral; replaces only one week', () => {
    const s = fixture()
    s.weeklyInventories.push({
      ...clone(s.weeklyInventories[0]),
      weekStart: '2026-11-30',
    })
    const inv = exportSection(s, 'inventory', week)
    inv.data.entries![0].available = false
    const next = previewImport(s, inv.data, week, true).next
    expect(next.weeklyInventories[0].entries[0].available).toBe(false)
    expect(next.weeklyInventories[1]).toEqual(s.weeklyInventories[1])
    expect(next.weeklyPlans).toEqual(s.weeklyPlans)
    const pref = exportSection(s, 'preferences', week)
    pref.data.preferences![0].rating = 'neutral'
    expect(previewImport(s, pref.data, week).next.preferences[0].rating).toBe(
      'neutral',
    )
  })
  it('restores backup including missing historical food and packing references', () => {
    const s = fixture()
    s.foods = []
    s.preferences = []
    s.weeklyInventories[0].entries = []
    expect(
      previewImport(seedState(), exportSection(s, 'backup', week).data, week)
        .next,
    ).toEqual(s)
  })
  it('rejects invalid JSON, sizes, versions, dates and permissive validation schemas', () => {
    for (const src of ['}', '{}', 'x'.repeat(maxBytes + 1)])
      expect(() => parseImport(src, 'inventory')).toThrow()
    const out = exportSection(fixture(), 'inventory', week)
    for (const edit of [
      { formatVersion: 2 },
      { weekStart: '2025-02-29' },
      { entries: [{ foodId: 'f', available: 1 }] },
    ]) {
      expect(() =>
        parseImport(
          JSON.stringify({
            schema: { $id: out.schema.$id },
            data: { ...out.data, ...edit },
          }),
          'inventory',
        ),
      ).toThrow()
    }
    expect(() => migrateState({ stateVersion: 2 })).toThrow('stateVersion')
  })
  it('rejects duplicate keys, orphaned packing, broken references and wrong weeks without mutating the source', () => {
    const s = fixture(),
      before = JSON.stringify(s),
      cat = exportSection(s, 'catalog', week).data
    cat.foods!.push(cat.foods![0])
    expect(() => previewImport(s, cat, week)).toThrow('duplicate')
    cat.foods = []
    expect(() => previewImport(s, cat, week, true)).toThrow('unknown')
    const p = exportSection(s, 'packing', week).data
    p.packedSlots![0].slotId = 'bad'
    expect(() => previewImport(s, p, week)).toThrow('assigned slot')
    const inv = exportSection(s, 'inventory', week).data
    expect(() => previewImport(s, inv, '2026-11-30')).toThrow('Monday')
    expect(JSON.stringify(s)).toBe(before)
  })
})
describe('device database', () => {
  const opened: Database[] = []
  const db = () => {
    const d = new Database()
    opened.push(d)
    return d
  }
  beforeEach(async () => {
    await deleteDB('lunchbox-planner')
  })
  afterEach(() => {
    opened.splice(0).forEach((d) => d.db?.close())
    vi.restoreAllMocks()
  })
  it('detaches nested Vue proxies before starting a snapshot write', async () => {
    const a = db()
    await a.open()
    const state = fixture()
    state.foods = reactive(state.foods)
    const expected = clone(state)
    const writing = a.save(state)
    state.foods[0].name = 'Changed after save was requested'
    await writing
    expect((await db().open())?.state).toEqual(expected)
  })
  it('survives reopening and refuses a stale writer', async () => {
    const a = db(),
      b = db(),
      s = fixture()
    await a.open()
    await a.save(s)
    expect((await b.open())?.state).toEqual(s)
    s.children[0].name = 'Changed'
    await a.save(s)
    await expect(b.save(seedState())).rejects.toThrow('Another window')
    expect((await db().open())?.state.children[0].name).toBe('Changed')
  })
  it('preserves unreadable snapshots and allows explicit recovery', async () => {
    const a = db()
    await a.open()
    const raw = {
      revision: 1,
      savedAt: new Date().toISOString(),
      state: { stateVersion: 37 },
    }
    await a.db!.put('snapshots', raw, 'current')
    const b = db()
    await expect(b.open()).rejects.toThrow('stateVersion')
    expect(b.recovery).toEqual(raw)
    await expect(b.save(seedState())).rejects.toThrow()
    await b.restoreCorrupt(reactive(fixture()))
    expect(await b.db!.get('snapshots', 'previous')).toEqual(raw)
    expect((await db().open())?.state).toEqual(fixture())
  })
  it('reports quota errors and keeps the last committed state', async () => {
    const a = db()
    await a.open()
    await a.save(fixture())
    vi.spyOn(a.db!, 'transaction').mockImplementationOnce(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    })
    await expect(a.save(seedState())).rejects.toThrow('Quota')
    expect((await db().open())?.state).toEqual(fixture())
  })
  it('reports a blocked initial database and allows local backup of memory data', async () => {
    await deleteDB('lunchbox-planner')
    const req = indexedDB.open('lunchbox-planner', 1)
    const blocker = await new Promise<IDBDatabase>((resolve) => {
      req.onsuccess = () => resolve(req.result)
    })
    const native = indexedDB.open.bind(indexedDB)
    vi.spyOn(indexedDB, 'open').mockImplementation((name) => native(name, 2))
    const a = db()
    await expect(a.open()).rejects.toThrow('blocked')
    blocker.close()
    expect(
      parseImport(
        JSON.stringify(exportSection(fixture(), 'backup', week)),
        'backup',
      ).appState,
    ).toEqual(fixture())
  })
  it('distinguishes storage availability and grant results', async () => {
    expect(await storageMode(true, {})).toBe('Unavailable')
    for (const granted of [true, false])
      expect(
        await storageMode(true, {
          persisted: async () => false,
          persist: async () => granted,
        }),
      ).toBe(granted ? 'Granted' : 'Denied')
    expect(await storageMode(false, { persisted: async () => true })).toBe(
      'Granted',
    )
  })
})
