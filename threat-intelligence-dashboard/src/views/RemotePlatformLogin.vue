<template>
  <div class="embedded-browser-page ti-page">
    <section class="embedded-browser-header ti-reveal-up">
      <div>
        <div class="ti-kicker">Embedded Browser Session</div>
        <h2>Platform built-in browser login</h2>
        <p>Starts a real Chromium in the server’s Linux environment and completes login and security verification through the in-page browser.</p>
      </div>
      <div class="embedded-browser-header__actions">
        <el-button plain @click="returnToPrevious">Back</el-button>
        <el-button type="primary" :loading="saving" :disabled="!sessionId" @click="finishSession">Save session</el-button>
        <el-button type="danger" plain :loading="closing" :disabled="!sessionId" @click="closeSession">Close session</el-button>
      </div>
    </section>

    <section class="embedded-browser-layout">
      <div class="ti-card ti-reveal-up embedded-browser-card">
        <div class="ti-card-header">
          <div>
            <div class="ti-card-title">{{ platformLabel }}</div>
            <div class="ti-card-subtitle">{{ state?.url || 'Creating built-in browser session' }}</div>
          </div>
          <div class="browser-tags">
            <el-tag :type="rfbTagType" effect="plain">{{ rfbStatusLabel }}</el-tag>
            <el-tag v-if="sessionId" effect="plain">{{ sessionId.slice(0, 10) }}</el-tag>
          </div>
        </div>
        <div class="ti-card-body">
          <div v-if="state?.rfb_ws_path" ref="browserDesktopRef" class="browser-desktop" />
          <div v-else-if="state?.stream_ws_path" ref="browserDesktopRef" class="browser-desktop" tabindex="0">
            <img ref="browserStreamImageRef" class="browser-stream-image" alt="Live internal browser view" />
          </div>
          <el-empty v-else class="browser-empty" description="Waiting for the built-in browser to start" />
          <div class="browser-footer">
            <span>{{ rfbError || 'After clicking the browser view you can type, scroll and complete two-factor verification directly.' }}</span>
            <span>{{ viewportText }}</span>
          </div>
        </div>
      </div>

      <aside class="embedded-browser-side">
        <div class="ti-card ti-reveal-up">
          <div class="ti-card-header">
            <div class="ti-card-title">Session saving</div>
          </div>
          <div class="ti-card-body side-form">
            <el-form label-position="top">
              <el-form-item label="Account label">
                <el-input v-model="accountLabel" placeholder="For example: GitHub main account" clearable />
              </el-form-item>
            </el-form>
            <el-alert
              type="info"
              :closable="false"
              show-icon
              title="When to save"
              description="Click Save Session only after login completes and you have confirmed the browser is in the logged-in state."
            />
          </div>
        </div>

        <div class="ti-card ti-reveal-up">
          <div class="ti-card-header">
            <div class="ti-card-title">Run status</div>
          </div>
          <div class="ti-card-body embedded-browser-state">
            <div class="state-row">
              <span>Mode</span>
              <strong>{{ state?.mode || '-' }}</strong>
            </div>
            <div class="state-row">
              <span>Page title</span>
              <strong>{{ state?.title || '-' }}</strong>
            </div>
            <div class="state-row">
              <span>Session file</span>
              <strong>{{ state?.storage_state_path || '-' }}</strong>
            </div>
          </div>
        </div>
      </aside>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import RFB from '@novnc/novnc'
import { useCodeMonitoringApi } from '@/composables/useCodeMonitoringApi'
import { createRemoteBrowserStream } from '@/utils/remoteBrowserStream'

const api = useCodeMonitoringApi()
const route = useRoute()
const router = useRouter()

const browserDesktopRef = ref(null)
const browserStreamImageRef = ref(null)
const state = ref(null)
const sessionId = ref(String(route.query.session_id || '').trim())
const accountLabel = ref('')
const loading = ref(false)
const saving = ref(false)
const closing = ref(false)
const rfbStatus = ref('idle')
const rfbError = ref('')
let refreshTimer = null
let rfb = null
let browserStream = null
let streamPath = ''

const platform = computed(() => String(route.query.platform || state.value?.platform || '').trim())
const platformLabel = computed(() => state.value?.label || platform.value || 'Code platform')
const returnTo = computed(() => {
  const value = String(route.query.return_to || '').trim()
  return value.startsWith('/') && !value.startsWith('//') ? value : '/document-exposure/code-monitoring/settings'
})

const viewportText = computed(() => {
  const viewport = state.value?.viewport || {}
  if (!viewport.width || !viewport.height) return 'View size -'
  return `View size ${viewport.width} x ${viewport.height}`
})

const rfbStatusLabel = computed(() => {
  const labels = {
    idle: 'Not connected',
    connecting: 'Connecting',
    connected: 'Connected',
    disconnected: 'Disconnected',
    error: 'Connection failed',
  }
  return labels[rfbStatus.value] || rfbStatus.value
})

const rfbTagType = computed(() => {
  if (rfbStatus.value === 'connected') return 'success'
  if (rfbStatus.value === 'connecting') return 'warning'
  if (rfbStatus.value === 'error') return 'danger'
  return 'info'
})

function buildWebsocketUrl(path) {
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${window.location.host}${path}`
}

function disconnectRfb() {
  if (!rfb) return
  try {
    rfb.disconnect()
  } catch {
    // noVNC disconnect can throw if the socket is already closed.
  }
  rfb = null
}

function disconnectStream() {
  browserStream?.close()
  browserStream = null
  streamPath = ''
}

async function connectStream() {
  const path = state.value?.stream_ws_path
  if (!path || path === streamPath) return
  await nextTick()
  if (!browserDesktopRef.value || !browserStreamImageRef.value) return
  disconnectRfb()
  disconnectStream()
  streamPath = path
  rfbError.value = ''
  browserStream = createRemoteBrowserStream({
    image: browserStreamImageRef.value,
    focusTarget: browserDesktopRef.value,
    websocketUrl: buildWebsocketUrl(path),
    onStatus: (status) => {
      rfbStatus.value = status
      if (status === 'connected') rfbError.value = ''
    },
    onError: (message) => {
      rfbStatus.value = 'error'
      rfbError.value = message
    },
  })
}

async function connectBrowser() {
  if (state.value?.stream_ws_path) {
    await connectStream()
  } else if (state.value?.rfb_ws_path) {
    disconnectStream()
    await connectRfb()
  }
}

async function connectRfb() {
  if (!state.value?.rfb_ws_path) return
  await nextTick()
  if (!browserDesktopRef.value) return
  disconnectRfb()
  rfbError.value = ''
  rfbStatus.value = 'connecting'
  try {
    rfb = new RFB(browserDesktopRef.value, buildWebsocketUrl(state.value.rfb_ws_path), {
      shared: true,
    })
    rfb.scaleViewport = true
    rfb.resizeSession = false
    rfb.clipViewport = false
    rfb.focusOnClick = true
    rfb.background = '#111827'
    rfb.addEventListener('connect', () => {
      rfbStatus.value = 'connected'
      rfbError.value = ''
    })
    rfb.addEventListener('disconnect', (event) => {
      rfbStatus.value = event.detail?.clean ? 'disconnected' : 'error'
      if (!event.detail?.clean) {
        rfbError.value = 'The built-in browser connection was lost; reconnect, or close the session and start again.'
      }
    })
    rfb.addEventListener('securityfailure', () => {
      rfbStatus.value = 'error'
      rfbError.value = 'VNC Secure handshake failed; restart the built-in browser session.'
    })
  } catch (error) {
    rfbStatus.value = 'error'
    rfbError.value = error.message || 'Failed to connect to the built-in browser'
  }
}

function applyState(payload) {
  state.value = payload
  if (!accountLabel.value && payload?.label) {
    accountLabel.value = payload.label
  }
}

async function ensureSession() {
  if (sessionId.value) {
    await refreshState()
    return
  }
  if (!platform.value) {
    ElMessage.error('Missing platform parameter')
    return
  }
  loading.value = true
  try {
    const payload = await api.startRemoteLogin(platform.value)
    sessionId.value = payload.session_id
    applyState(payload)
    router.replace({
      name: 'RemotePlatformLogin',
      query: { platform: platform.value, session_id: sessionId.value, return_to: returnTo.value },
    })
    await connectBrowser()
  } catch (error) {
    ElMessage.error(error.message || 'Failed to create built-in browser session')
  } finally {
    loading.value = false
  }
}

async function refreshState() {
  if (!sessionId.value || loading.value) return
  loading.value = true
  try {
    applyState(await api.loadRemoteLoginState(sessionId.value))
  } catch (error) {
    ElMessage.error(error.message || 'Failed to refresh built-in browser status')
  } finally {
    loading.value = false
  }
}

async function finishSession() {
  if (!sessionId.value) return
  saving.value = true
  try {
    await api.finishRemoteLogin(sessionId.value, accountLabel.value || platform.value)
    disconnectRfb()
    disconnectStream()
    ElMessage.success('Built-in browser session saved')
    router.push(returnTo.value)
  } catch (error) {
    ElMessage.error(error.message || 'Failed to save built-in browser session')
  } finally {
    saving.value = false
  }
}

async function closeSession() {
  if (!sessionId.value) return
  closing.value = true
  try {
    disconnectRfb()
    disconnectStream()
    await api.closeRemoteLogin(sessionId.value)
    ElMessage.success('Built-in browser session closed')
    router.push(returnTo.value)
  } catch (error) {
    ElMessage.error(error.message || 'Failed to close built-in browser session')
  } finally {
    closing.value = false
  }
}

function returnToPrevious() {
  router.push(returnTo.value)
}

watch(
  () => [state.value?.rfb_ws_path, state.value?.stream_ws_path],
  async ([rfbPath, livePath]) => {
    if (rfbPath || livePath) await connectBrowser()
  },
)

onMounted(async () => {
  await ensureSession()
  refreshTimer = window.setInterval(refreshState, 5000)
})

onUnmounted(() => {
  disconnectRfb()
  disconnectStream()
  if (refreshTimer) {
    window.clearInterval(refreshTimer)
    refreshTimer = null
  }
})
</script>

<style scoped lang="scss">
.embedded-browser-page {
  min-width: 0;
  overflow-x: hidden;
}

.embedded-browser-header,
.embedded-browser-layout {
  display: grid;
  gap: 18px;
}

.embedded-browser-header {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  margin-bottom: 18px;
}

.embedded-browser-header h2 {
  margin: 4px 0 8px;
  color: var(--ti-text-primary);
  font-size: 30px;
}

.embedded-browser-header p {
  margin: 0;
  color: var(--ti-text-secondary);
}

.embedded-browser-header__actions,
.browser-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.embedded-browser-layout {
  grid-template-columns: minmax(0, 1fr) 340px;
  align-items: start;
}

.browser-desktop,
.browser-empty {
  height: min(760px, calc(100vh - 230px));
  min-height: 520px;
  border: 1px solid rgba(116, 142, 184, 0.2);
  border-radius: 10px;
  background: #111827;
  overflow: hidden;
}

.browser-desktop {
  display: flex;
  align-items: center;
  justify-content: center;
  outline: none;
}

.browser-stream-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  user-select: none;
  cursor: default;
}

.browser-desktop :deep(.rfb_screen) {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100% !important;
  height: 100% !important;
}

.browser-desktop :deep(canvas) {
  display: block;
  max-width: 100%;
  max-height: min(760px, calc(100vh - 230px));
  outline: none;
}

.browser-footer {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding-top: 12px;
  color: var(--ti-text-secondary);
  font-size: 13px;
}

.embedded-browser-side {
  display: grid;
  gap: 18px;
}

.side-form :deep(.el-form-item) {
  margin-bottom: 14px;
}

.embedded-browser-state {
  display: grid;
  gap: 12px;
}

.state-row {
  display: grid;
  gap: 4px;
}

.state-row span {
  color: var(--ti-text-secondary);
  font-size: 12px;
}

.state-row strong {
  color: var(--ti-text-primary);
  font-size: 13px;
  line-height: 1.5;
  word-break: break-all;
}

@media (max-width: 1280px) {
  .embedded-browser-header,
  .embedded-browser-layout {
    grid-template-columns: 1fr;
  }
}
</style>
