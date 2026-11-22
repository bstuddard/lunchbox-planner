<script setup lang="ts">
import { computed, watch, onMounted, onBeforeUnmount } from 'vue'
import {
  CalendarDays,
  ClipboardCheck,
  ShoppingBasket,
  Carrot,
  Settings2,
  HardDrive,
  ChevronRight,
  Download,
  ShieldCheck,
  WifiOff,
  PanelLeft,
} from '@lucide/vue'
import {
  initialize,
  page,
  week,
  subsection,
  ready,
  saving,
  savedAt,
  saveError,
  notice,
  guide,
  guideTitles,
  goStep,
  generation,
  download,
  refreshDate,
  today,
} from './store'
import { offlineReady, online, updateReady, update } from './pwa'
import { monday } from './domain/dates'
import Today from './screens/Today.vue'
import Week from './screens/Week.vue'
import Pantry from './screens/Pantry.vue'
import Setup from './screens/Setup.vue'
import Generation from './components/Generation.vue'
const paths = [
  { key: 'Today', icon: ClipboardCheck, label: 'Today' },
  { key: 'Week', icon: CalendarDays, label: 'Weekly plan' },
  { key: 'Inventory', icon: ShoppingBasket, label: 'Inventory' },
  { key: 'Foods', icon: Carrot, label: 'Food catalog' },
  { key: 'Setup', icon: Settings2, label: 'Setup & data' },
] as const
const active = computed(() => paths.find((p) => p.key === page.value)!)
function navigate(key: typeof page.value) {
  guide.value = -1
  page.value = key
  if (key === 'Today') {
    refreshDate()
    week.value = monday(today.value, true)
  }
}
function readRoute() {
  const found = paths.find(
    (p) => p.key.toLowerCase() === location.hash.slice(1),
  )
  navigate(found?.key ?? 'Today')
}
watch(page, (p) => {
  if (p === 'Today') week.value = monday(today.value, true)
  if (location.hash !== '#' + p.toLowerCase())
    history.pushState(null, '', '#' + p.toLowerCase())
  window.scrollTo(0, 0)
})
function data() {
  navigate('Setup')
  subsection.value = 'Data'
}
let timer: ReturnType<typeof setInterval>
onMounted(async () => {
  readRoute()
  window.addEventListener('popstate', readRoute)
  document.addEventListener('visibilitychange', refreshDate)
  timer = setInterval(refreshDate, 30000)
  await initialize()
})
onBeforeUnmount(() => {
  window.removeEventListener('popstate', readRoute)
  document.removeEventListener('visibilitychange', refreshDate)
  clearInterval(timer)
})
</script>
<template>
  <a class="skip" href="#main">Skip to content</a>
  <div class="shell">
    <aside class="rail">
      <a href="#today" class="brand" @click.prevent="navigate('Today')"
        ><img src="/icons/icon-192.png" alt="" /><span
          >Lunchbox<small>PLANNER</small></span
        ></a
      >
      <div class="rail-label">WORKSPACE</div>
      <nav aria-label="Main navigation">
        <button
          v-for="p in paths"
          :class="{ active: page === p.key }"
          :aria-current="page === p.key ? 'page' : undefined"
          @click="navigate(p.key)"
        >
          <component :is="p.icon" />{{ p.label }}
        </button>
      </nav>
      <div class="rail-bottom">
        <div class="device">
          <span class="device-icon"><HardDrive /></span>
          <div>
            <strong>Device storage</strong><small>Private &amp; local</small>
          </div>
        </div>
        <button class="backup-link" @click="download('backup')">
          <Download />Export full backup
        </button>
      </div>
    </aside>
    <div class="workspace">
      <header class="topbar">
        <div class="crumb">
          <span class="desktop-brand"><PanelLeft /> Workspace</span
          ><span class="mobile-brand"
            ><img src="/icons/icon-192.png" alt="" />Lunchbox Planner</span
          ><ChevronRight class="crumb-arrow" /><strong>{{
            active.label
          }}</strong>
        </div>
        <button class="save-badge" @click="data">
          <span :class="{ error: saveError }"></span
          >{{
            saveError
              ? 'Unsaved'
              : saving
                ? 'Saving…'
                : savedAt
                  ? 'Saved on this device'
                  : 'Opening storage'
          }}
        </button>
      </header>
      <main id="main" tabindex="-1">
        <div v-if="!ready" class="panel">Opening your planner…</div>
        <template v-else>
          <div v-if="saveError" class="alert" role="alert">
            <strong>Not saved; export a backup.</strong> {{ saveError }}
            <button class="link" @click="data">
              Open backup &amp; recovery
            </button>
          </div>
          <div v-if="updateReady" class="summary">
            An update is available. Finish edits and back up before updating.
            <button class="link" @click="download('backup')">
              Export backup
            </button>
            <button class="link" @click="update">Update now</button>
          </div>
          <div v-if="!online" class="offline">
            <WifiOff />Offline ·
            {{ offlineReady ? 'Ready for offline use' : 'Cache unconfirmed' }}
          </div>
          <section v-if="guide >= 0" class="guide">
            <div>
              <small
                >GUIDED SETUP · {{ guide + 1 }} OF
                {{ guideTitles.length }}</small
              ><strong>{{ guideTitles[guide] }}</strong>
            </div>
            <div class="actions">
              <button class="subtle" @click="guide = -1">Close guide</button
              ><button
                v-if="guide > 0"
                class="secondary"
                @click="goStep(guide - 1)"
              >
                Back</button
              ><button
                class="primary"
                @click="guide < 4 ? goStep(guide + 1) : (generation = {})"
              >
                {{ guide < 4 ? 'Continue' : 'Generate week' }}
              </button>
            </div>
          </section>
          <Today v-if="page === 'Today'" /><Week
            v-else-if="page === 'Week'"
          /><Pantry
            v-else-if="page === 'Inventory' || page === 'Foods'"
            :stock="page === 'Inventory'"
          /><Setup v-else />
          <footer class="page-footer">
            <ShieldCheck /><span>{{
              offlineReady
                ? 'Ready for offline use'
                : saveError
                  ? 'Device storage unavailable'
                  : 'Stored on this device'
            }}</span
            ><button class="link" @click="data">
              Install &amp; backup info
            </button>
          </footer></template
        >
      </main>
    </div>
    <nav class="bottom-nav" aria-label="Mobile navigation">
      <button
        v-for="p in paths"
        :class="{ active: page === p.key }"
        :aria-current="page === p.key ? 'page' : undefined"
        @click="navigate(p.key)"
      >
        <component :is="p.icon" />{{ p.key }}
      </button>
    </nav>
  </div>
  <div v-if="notice" class="toast" role="status">{{ notice }}</div>
  <Generation />
</template>
