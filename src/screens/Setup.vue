<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import {
  Settings2,
  Plus,
  Search,
  Heart,
  Minus,
  ThumbsDown,
  Download,
  HardDrive,
  Smartphone,
  ShieldCheck,
} from '@lucide/vue'
import {
  state,
  change,
  subsection,
  savedAt,
  lastExport,
  download,
  toast,
  recovery,
  saveError,
} from '../store'
import { uid, type Rating } from '../domain/model'
import { downloadJSON } from '../data/transfer'
import { storageMode } from '../data/database'
import {
  installed,
  installEvent,
  install,
  offlineReady,
  updateReady,
  update,
} from '../pwa'
import WarningList from '../components/WarningList.vue'
import Schedules from './Schedules.vue'
import Transfer from '../components/Transfer.vue'
const tabs = ['Children', 'Schedules', 'Preferences', 'Data'] as const
const childId = ref(''),
  query = ref(''),
  category = ref(''),
  disliked = ref(false),
  durability = ref('Checking…'),
  newName = ref('')
const names = ref<Record<string, string>>({})
watch(
  () => state.value.children,
  (children, previous) => {
    const previousNames = new Map(previous?.map(c => [c.id, c.name]))
    names.value = Object.fromEntries(children.map(c => [
      c.id,
      previousNames.get(c.id) === c.name ? names.value[c.id] : c.name,
    ]))
    if (!children.some((c) => c.id === childId.value))
      childId.value = children[0]?.id ?? ''
  },
  { immediate: true },
)
const prefs = computed(
  () =>
    new Map(
      state.value.preferences
        .filter((p) => p.childId === childId.value)
        .map((p) => [p.foodId, p.rating]),
    ),
)
const foods = computed(() =>
  state.value.foods.filter(
    (f) =>
      !f.archived &&
      f.name.toLowerCase().includes(query.value.toLowerCase()) &&
      (!category.value || f.categoryIds.includes(category.value)) &&
      (!disliked.value || prefs.value.get(f.id) === 'disliked'),
  ),
)
const ratings = [
  { value: 'liked', icon: Heart },
  { value: 'neutral', icon: Minus },
  { value: 'disliked', icon: ThumbsDown },
] as const
function rate(foodId: string, rating: Rating) {
  change((s) => {
    s.preferences = s.preferences.filter(
      (p) => p.childId !== childId.value || p.foodId !== foodId,
    )
    s.preferences.push({ childId: childId.value, foodId, rating })
  })
}
function rename(id: string) {
  const name = names.value[id].trim()
  if (!name) return
  if (
    change((s) => {
      s.children.find((c) => c.id === id)!.name = name
    })
  ) {
    names.value[id] = name
    toast('Child name updated')
  }
}
function add() {
  const name = newName.value.trim()
  if (!name) return
  change((s) => {
    const id = uid()
    s.children.push({ id, name, sortOrder: s.children.length })
    s.schedules.push({
      childId: id,
      weekdays: {
        Monday: [],
        Tuesday: [],
        Wednesday: [],
        Thursday: [],
        Friday: [],
      },
    })
  })
  newName.value = ''
}
onMounted(async () => {
  durability.value = await storageMode()
})
</script>
<template>
  <div class="page-head">
    <div>
      <div class="eyebrow"><Settings2 />PLANNER SETTINGS</div>
      <h1>Setup &amp; data</h1>
    </div>
  </div>
  <nav class="tabs" aria-label="Setup sections">
    <button
      v-for="t in tabs"
      :class="{ selected: subsection === t }"
      @click="subsection = t"
    >
      {{ t }}
    </button>
  </nav>
  <template v-if="subsection === 'Children'"
    ><section class="panel">
      <h2>Your children</h2>
      <p>
        Names are stored on this device. Each child has their own schedule and
        food preferences.
      </p>
      <form
        v-for="c in state.children"
        :key="c.id"
        class="name-row"
        @submit.prevent="rename(c.id)"
      >
        <label>Child name<input v-model="names[c.id]" required /></label
        ><button
          class="secondary"
          :disabled="!names[c.id]?.trim() || names[c.id] === c.name"
        >
          Save name
        </button>
      </form>
      <form class="name-row" @submit.prevent="add">
        <label
          >Add another child<input
            v-model="newName"
            placeholder="Name"
            required /></label
        ><button class="secondary"><Plus />Add child</button>
      </form>
    </section>
    <Transfer section="children"
  /></template>
  <template v-if="subsection === 'Schedules' || subsection === 'Preferences'"
    ><label class="childselect"
      >Child<select v-model="childId">
        <option v-for="c in state.children" :key="c.id" :value="c.id">
          {{ c.name }}
        </option>
      </select></label
    >
    <p v-if="!childId">Add a child to configure this section.</p></template
  >
  <Schedules
    v-if="subsection === 'Schedules' && childId"
    :child-id="childId"
  /><Transfer
    v-if="subsection === 'Schedules' && !childId"
    section="schedules"
  />
  <template v-if="subsection === 'Preferences'"
    ><section class="panel">
      <h2>Food preferences</h2>
      <p>
        Liked foods appear more often. Disliked foods are excluded from new
        plans.
      </p>
      <div class="filters">
        <label class="search"
          ><Search /><input
            v-model="query"
            aria-label="Search preferences"
            placeholder="Search foods" /></label
        ><select v-model="category" aria-label="Preference category">
          <option value="">All categories</option>
          <option v-for="c in state.categories" :value="c.id">
            {{ c.name }}
          </option></select
        ><label class="checklabel"
          ><input type="checkbox" v-model="disliked" />Disliked only</label
        >
      </div>
      <div v-for="f in foods" class="list-row wrap">
        <strong>{{ f.name }}</strong>
        <div class="ratings">
          <button
            v-for="r in ratings"
            :class="[
              r.value,
              { active: (prefs.get(f.id) ?? 'neutral') === r.value },
            ]"
            :aria-pressed="(prefs.get(f.id) ?? 'neutral') === r.value"
            :aria-label="f.name + ' ' + r.value"
            :disabled="!childId"
            @click="rate(f.id, r.value)"
          >
            <component :is="r.icon" />{{ r.value }}
          </button>
        </div>
      </div>
      <p v-if="!foods.length">
        No matching foods. Add foods in the catalog or change your filters.
      </p>
    </section>
    <Transfer section="preferences"
  /></template>
  <template v-if="subsection === 'Data'"
    ><section class="panel backup">
      <div class="inline">
        <ShieldCheck />
        <h2>Data &amp; backups</h2>
      </div>
      <p>
        A full backup includes every week, meal assignment and packing check.
        Keep a copy in your downloads or another location you control.
      </p>
      <p>Backups are readable JSON files. Nicknames are useful on shared devices.
        Apps hosted on the same hostname and port over HTTPS share a browser storage boundary.</p>
      <button class="primary" @click="download('backup')">
        <Download />Export full backup
      </button>
    </section>
    <Transfer section="backup" /><Transfer section="packing" />
    <section class="panel">
      <div class="inline">
        <HardDrive />
        <h2>Device storage</h2>
      </div>
      <dl>
        <dt>Storage</dt>
        <dd>
          {{
            saveError
              ? 'In memory · unsaved changes'
              : 'IndexedDB on this device'
          }}
        </dd>
        <dt>Last successful save</dt>
        <dd>
          {{
            savedAt ? new Date(savedAt).toLocaleString() : 'No completed save'
          }}
        </dd>
        <dt>Last download initiated</dt>
        <dd>
          {{
            lastExport
              ? new Date(lastExport).toLocaleString()
              : 'No export recorded'
          }}
        </dd>
        <dt>Persistent storage</dt>
        <dd>{{ durability }}</dd>
      </dl>
      <button
        class="secondary"
        @click="
          async () => {
            durability = await storageMode(true)
          }
        "
      >
        Request persistent storage
      </button>
      <p>
        Clearing site data, uninstalling, switching browsers or moving to a
        different address can make local records inaccessible. Download backups
        regularly.
      </p>
      <button
        v-if="recovery() !== undefined"
        class="secondary"
        @click="downloadJSON(recovery(), 'lunchbox-recovery.json')"
      >
        Download original recovery snapshot
      </button>
    </section>
    <section class="panel">
      <div class="inline">
        <Smartphone />
        <h2>Install &amp; offline use</h2>
      </div>
      <p>
        Open this HTTPS address in Android Chrome while online, then choose
        <strong>Install app</strong> or <strong>Add to Home screen</strong> from
        the browser menu. Launch from its icon once the app is ready for offline
        use.
      </p>
      <p>
        <strong>{{
          offlineReady
            ? 'Ready for offline use'
            : 'Offline cache has not been confirmed'
        }}</strong>
        · {{ installed ? 'Standalone mode' : 'Browser mode' }}
      </p>
      <button v-if="installEvent" class="primary" @click="install">
        Install app
      </button>
      <p>
        Finish edits and export a backup before applying an update. Keep using
        the same address so your device can find its saved data.
      </p>
      <button v-if="updateReady" class="secondary" @click="update">
        Apply update
      </button>
      <p><a class="link" href="https://github.com/bstuddard/lunchbox-planner" rel="noreferrer">Source code and GNU GPL v3 license</a></p>
    </section></template
  ><WarningList />
</template>
