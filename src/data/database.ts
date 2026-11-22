import { openDB, type IDBPDatabase } from 'idb'
import { clone, type State } from '../domain/model'
import { migrateState } from './transfer'
export interface Saved {
  revision: number
  savedAt: string
  state: State
}
export class Database {
  db?: IDBPDatabase
  revision = 0
  recovery: unknown
  writeAllowed = false
  constructor(private onClosed: (message: string) => void = () => {}) {}
  async open(): Promise<Saved | undefined> {
    let rejectBlocked!: (e: Error) => void
    const blocked = new Promise<never>((_, reject) => {
      rejectBlocked = reject
    })
    let abandoned = false
    const opening = openDB('lunchbox-planner', 1, {
      upgrade(db) {
        db.createObjectStore('snapshots')
      },
      blocked() {
        abandoned = true
        rejectBlocked(
          Error(
            'Database upgrade blocked. Close other planner windows and reopen.',
          ),
        )
      },
      blocking: () => {
        this.db?.close()
        this.writeAllowed = false
        this.onClosed(
          'Another window is upgrading the database. Reopen the planner.',
        )
      },
      terminated: () => {
        this.writeAllowed = false
        this.onClosed('Device database connection was interrupted.')
      },
    }).then((db) => {
      if (abandoned) db.close()
      return db
    })
    this.db = await Promise.race([opening, blocked])
    const raw = await this.db.get('snapshots', 'current')
    if (raw !== undefined) {
      this.recovery = raw
      if (
        !Number.isSafeInteger(raw?.revision) ||
        raw.revision < 1 ||
        !Number.isFinite(Date.parse(raw.savedAt))
      )
        throw Error(
          'Unrecognized database snapshot. Download the recovery copy before restoring.',
        )
      this.revision = raw.revision
      const state = migrateState(raw.state)
      this.writeAllowed = true
      this.recovery = undefined
      return { ...raw, state }
    }
    this.writeAllowed = true
  }
  async save(state: State): Promise<string> {
    if (!this.db || !this.writeAllowed)
      throw Error('Device database is unavailable.')
    // Capture plain JSON before opening the transaction or yielding to an edit.
    const snapshot = clone(state)
    const tx = this.db.transaction('snapshots', 'readwrite')
    const old = await tx.store.get('current')
    if ((old?.revision ?? 0) !== this.revision) {
      tx.abort()
      await tx.done.catch(() => {})
      this.writeAllowed = false
      throw Error(
        'Another window saved a newer version. Export this copy and reopen before continuing.',
      )
    }
    const savedAt = new Date().toISOString()
    await Promise.all([
      tx.store.put({ revision: this.revision + 1, savedAt, state: snapshot }, 'current'),
      tx.done,
    ])
    this.revision++
    return savedAt
  }
  // An explicit full restore may replace a corrupt snapshot, but never a
  // different snapshot written by a second window during recovery.
  async restoreCorrupt(state: State) {
    if (!this.db || this.recovery === undefined)
      throw Error('No recovery snapshot available.')
    const snapshot = clone(state)
    const tx = this.db.transaction('snapshots', 'readwrite'),
      raw = await tx.store.get('current')
    if (JSON.stringify(raw) !== JSON.stringify(this.recovery)) {
      tx.abort()
      await tx.done.catch(() => {})
      throw Error('Snapshot changed in another window. Reopen to restore.')
    }
    const savedAt = new Date().toISOString()
    await Promise.all([
      tx.store.put(raw, 'previous'),
      tx.store.put({ revision: 1, savedAt, state: snapshot }, 'current'),
      tx.done,
    ])
    this.revision = 1
    this.writeAllowed = true
    this.recovery = undefined
    return savedAt
  }
}
export async function storageMode(
  request = false,
  storage: Partial<StorageManager> | undefined = navigator.storage,
) {
  try {
    if (!storage?.persisted) return 'Unavailable'
    if (await storage.persisted()) return 'Granted'
    if (request && storage.persist)
      return (await storage.persist()) ? 'Granted' : 'Denied'
    return request ? 'Unavailable' : 'Best effort'
  } catch {
    return 'Unavailable'
  }
}
