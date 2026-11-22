import { ref } from 'vue'
import { registerSW } from 'virtual:pwa-register'
import { settled, saveError, toast } from './store'
type InstallEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: string }>
}
export const offlineReady = ref(false),
  online = ref(navigator.onLine),
  updateReady = ref(false),
  installEvent = ref<InstallEvent | null>(null),
  installed = ref(matchMedia('(display-mode: standalone)').matches)
window.addEventListener('online', () => (online.value = true))
window.addEventListener('offline', () => (online.value = false))
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  installEvent.value = e as InstallEvent
})
window.addEventListener('appinstalled', () => {
  installEvent.value = null
  installed.value = true
})
export async function install() {
  const event = installEvent.value
  if (event) {
    await event.prompt()
    await event.userChoice
    installEvent.value = null
  }
}
const apply = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateReady.value = true
  },
  onOfflineReady() {
    offlineReady.value = true
  },
  onRegisteredSW(_, reg) {
    if (reg) {
      void navigator.serviceWorker.ready.then((r) => {
        if (r.active) offlineReady.value = true
      })
      window.addEventListener('online', () => {
        void reg.update().catch(() => {})
      })
    }
  },
  onRegisterError() {
    offlineReady.value = false
  },
})
export async function update() {
  await settled()
  if (saveError.value) {
    toast('Export your unsaved changes and reopen the app before updating.')
    return
  }
  await apply(true)
}
