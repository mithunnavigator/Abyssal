<template>
  <aside class="sidebar" :class="{ collapsed: shell.state.sidebarCollapsed }">
    <div class="sidebar__brand">
      <div class="sidebar__brand-mark">
        <el-icon><Monitor /></el-icon>
      </div>
      <div v-show="!shell.state.sidebarCollapsed" class="sidebar__brand-text">
        <strong>Abyssal Threat Intelligence Platform</strong>
      </div>
    </div>

    <nav class="sidebar__nav">
      <template v-for="item in navTree" :key="item.key || item.path">
        <router-link
          v-if="item.type === 'item'"
          :to="item.path"
          class="sidebar__item"
          :class="{ active: isRouteActive(item.path) }"
        >
          <div class="sidebar__item-main">
            <el-icon class="sidebar__item-icon">
              <component :is="item.icon" />
            </el-icon>
            <div v-show="!shell.state.sidebarCollapsed" class="sidebar__item-text">
              <span class="sidebar__item-title">{{ item.title }}</span>
            </div>
          </div>
        </router-link>

        <div v-else class="sidebar__group" :class="{ active: isGroupActive(item) }">
          <button class="sidebar__item sidebar__item--button" type="button" @click="toggleGroup(item.key)">
            <div class="sidebar__item-main">
              <el-icon class="sidebar__item-icon">
                <component :is="item.icon" />
              </el-icon>
              <div v-show="!shell.state.sidebarCollapsed" class="sidebar__item-text">
                <span class="sidebar__item-title">{{ item.title }}</span>
              </div>
            </div>
            <div v-show="!shell.state.sidebarCollapsed" class="sidebar__group-meta">
              <el-icon class="sidebar__group-arrow">
                <component :is="isGroupOpen(item.key) ? 'ArrowDown' : 'ArrowRight'" />
              </el-icon>
            </div>
          </button>

          <div v-show="!shell.state.sidebarCollapsed && isGroupOpen(item.key)" class="sidebar__children">
            <router-link
              v-for="child in item.children"
              :key="child.path"
              :to="child.path"
              class="sidebar__child"
              :class="{ active: isRouteActive(child.path) }"
            >
              <el-icon class="sidebar__child-icon">
                <component :is="child.icon" />
              </el-icon>
              <span>{{ child.title }}</span>
            </router-link>
          </div>
        </div>
      </template>
    </nav>

    <div class="sidebar__footer">
      <div
        v-show="!shell.state.sidebarCollapsed"
        class="sidebar__version"
        :class="{ 'sidebar__version--update': versionStatus?.update_available }"
      >
        <div class="sidebar__version-head">
          <span class="sidebar__version-label">Version information</span>
          <el-icon v-if="versionStatus?.update_available" class="sidebar__version-icon sidebar__version-icon--warning">
            <WarningFilled />
          </el-icon>
          <el-icon v-else class="sidebar__version-icon">
            <CircleCheck />
          </el-icon>
        </div>
        <strong>{{ versionTitle }}</strong>
        <p>{{ versionDescription }}</p>
        <el-button
          class="sidebar__update"
          size="small"
          :type="updateState?.status === 'failed' ? 'danger' : versionStatus?.update_available ? 'primary' : 'default'"
          :loading="updateRunning"
          :disabled="!canUpdate || versionLoading || updateRunning"
          @click="runUpdate"
        >
          <el-icon v-if="!updateRunning"><Download /></el-icon>
          <span>{{ updateButtonLabel }}</span>
        </el-button>
      </div>
      <button class="sidebar__collapse" @click="shell.toggleSidebar">
        <el-icon>
          <Fold v-if="!shell.state.sidebarCollapsed" />
          <Expand v-else />
        </el-icon>
      </button>
    </div>
  </aside>
</template>

<script setup>
import { ElMessage } from 'element-plus'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { clearAuthSession, isCurrentUserAdmin } from '@/composables/useAuth'
import { useShellLayout } from '@/composables/useShellLayout'

const route = useRoute()
const shell = useShellLayout()
const VERSION_CHECK_INTERVAL_MS = 5 * 60 * 1000
const UPDATE_POLL_INTERVAL_MS = 2000
const UPDATE_TIMEOUT_MS = 30 * 60 * 1000
const UPDATE_JOB_STORAGE_KEY = 'darkweb-update-job-id'
const versionStatus = ref(null)
const versionLoading = ref(false)
const versionError = ref('')
const updateState = ref(null)
const canUpdate = computed(isCurrentUserAdmin)
let versionTimer = null
let updatePollTimer = null
let updateStartedAt = 0
let updateRecovered = false

const navTree = [
  { type: 'item', path: '/', title: 'Overview', icon: 'DataLine' },
  { type: 'item', path: '/ransomware', title: 'Ransomware intelligence', icon: 'Lock' },
  { type: 'item', path: '/data-leak', title: 'Data leak intelligence', icon: 'Document' },
  { type: 'item', path: '/vulnerability-alerts', title: 'Vulnerability alerts', icon: 'WarningFilled' },
  { type: 'item', path: '/threat-situation', title: 'Threat situation', icon: 'TrendCharts' },
  { type: 'item', path: '/collector-control', title: 'Collection Control', icon: 'VideoPlay' },
  { type: 'item', path: '/social-monitoring', title: 'Social platform monitoring', icon: 'ChatLineRound' },
  {
    type: 'group',
    key: 'document-exposure',
    title: 'File monitoring',
    icon: 'Files',
    children: [
      { path: '/document-exposure/netdisk', title: 'Netdisk monitoring', icon: 'Share' },
      { path: '/document-exposure/document-library', title: 'Document library monitoring', icon: 'Files' },
      { path: '/document-exposure/code-monitoring', title: 'Code monitoring', icon: 'Connection' },
    ],
  },
]

const expandedGroups = ref(['document-exposure'])

function isRouteActive(path) {
  if (path === '/') return route.path === '/'
  return route.path === path || route.path.startsWith(`${path}/`)
}

function isGroupActive(group) {
  if (group.key === 'document-exposure') {
    return route.path.startsWith('/document-exposure/')
  }
  return group.children?.some((child) => isRouteActive(child.path))
}

function isGroupOpen(groupKey) {
  return expandedGroups.value.includes(groupKey)
}

function toggleGroup(groupKey) {
  if (isGroupOpen(groupKey)) {
    expandedGroups.value = expandedGroups.value.filter((item) => item !== groupKey)
    return
  }
  expandedGroups.value = [...expandedGroups.value, groupKey]
}

watch(
  () => route.path,
  () => {
    for (const item of navTree) {
      if (item.type === 'group' && isGroupActive(item) && !isGroupOpen(item.key)) {
        expandedGroups.value = [...expandedGroups.value, item.key]
      }
    }
  },
  { immediate: true },
)

const versionTitle = computed(() => {
  if (updateRunning.value) return 'Updating system'
  if (updateState.value?.status === 'failed') return 'Update failed'
  if (versionLoading.value && !versionStatus.value) return 'Checking'
  if (versionError.value) return 'Check failed'
  if (versionStatus.value?.update_available) return 'New version available'
  return `Current ${currentVersionLabel.value}`
})

const versionDescription = computed(() => {
  if (updateRunning.value) return updateState.value?.message || 'Preparing update'
  if (updateState.value?.status === 'failed') return updateState.value.error || updateState.value.message || 'Automatic update failed'
  if (versionError.value) return versionError.value
  if (!versionStatus.value) return 'Checking version information'
  const channel = versionStatus.value.channel || versionStatus.value.current?.channel || 'stable'
  const latest = versionStatus.value.latest?.version || versionStatus.value.latest?.short_commit || ''
  if (versionStatus.value.update_available) {
    return `Local ${currentVersionLabel.value} / Latest ${latest || '-'}`
  }
  return latest ? `${channel} Channel in sync · ${latest}` : `${channel} Channel in sync`
})

const currentVersionLabel = computed(() => (
  versionStatus.value?.current?.version
  || versionStatus.value?.current?.short_commit
  || 'local'
))

const updateRunning = computed(() => ['queued', 'running'].includes(updateState.value?.status))

const updateButtonLabel = computed(() => {
  if (!canUpdate.value) return 'Only administrators can update'
  if (updateRunning.value) return updateState.value?.message || 'Updating'
  if (updateState.value?.status === 'failed') return 'Retry update'
  return versionStatus.value?.update_available ? 'One-click update' : 'Check and update'
})

async function readResponseError(response) {
  try {
    const payload = await response.json()
    return payload?.detail || payload?.message || ''
  } catch {
    return ''
  }
}

async function loadVersionStatus() {
  if (versionLoading.value) return
  versionLoading.value = true
  versionError.value = ''
  try {
    const response = await fetch('/api/system/version')
    if (!response.ok) throw new Error(`Version check failed:${response.status}`)
    const payload = await response.json()
    versionStatus.value = payload
    if (payload.status === 'error') {
      throw new Error(payload.error || payload.message || 'Cannot check the update service')
    }
  } catch (error) {
    if (versionStatus.value) versionStatus.value = { ...versionStatus.value, update_available: false }
    versionError.value = error.message || 'Cannot check the update service'
  } finally {
    versionLoading.value = false
  }
}

function stopUpdatePolling() {
  if (updatePollTimer) window.clearTimeout(updatePollTimer)
  updatePollTimer = null
}

function scheduleUpdatePoll(delay = UPDATE_POLL_INTERVAL_MS) {
  stopUpdatePolling()
  updatePollTimer = window.setTimeout(pollUpdateStatus, delay)
}

async function handleUpdateFinished(state, { recovered = false } = {}) {
  stopUpdatePolling()
  updateRecovered = false
  window.sessionStorage.removeItem(UPDATE_JOB_STORAGE_KEY)
  if (state.status === 'failed') {
    ElMessage.error(state.error || state.message || 'Automatic update failed')
    return
  }
  if (!state.updated) {
    ElMessage.success('Already on the latest version')
    await loadVersionStatus()
    return
  }

  if (recovered) {
    ElMessage.success('Update completed')
    await loadVersionStatus()
    return
  }

  ElMessage.success('Update complete; services restarted. Please log in again')
  window.setTimeout(() => {
    clearAuthSession()
    window.location.assign('/login?updated=1')
  }, 1000)
}

async function pollUpdateStatus() {
  if (!updateRunning.value) return
  if (Date.now() - updateStartedAt > UPDATE_TIMEOUT_MS) {
    updateState.value = { ...updateState.value, message: 'The update is taking a while; still waiting for the server result' }
    updateStartedAt = Date.now()
    scheduleUpdatePoll(10_000)
    return
  }

  try {
    const response = await fetch('/api/system/update/status')
    if (response.ok) {
      const state = await response.json()
      if (state.job_id === updateState.value?.job_id) {
        updateState.value = state
        if (!['queued', 'running'].includes(state.status)) {
          await handleUpdateFinished(state, { recovered: updateRecovered })
          return
        }
      }
    }
  } catch {
    // The API is briefly unavailable while the updater restarts the service.
  }
  scheduleUpdatePoll()
}

async function runUpdate() {
  if (!canUpdate.value) {
    ElMessage.warning('Only administrators can update the system')
    return
  }
  if (updateRunning.value) return
  try {
    const response = await fetch('/api/system/update', { method: 'POST' })
    if (!response.ok) {
      throw new Error((await readResponseError(response)) || `Failed to start update:${response.status}`)
    }
    updateState.value = await response.json()
    updateStartedAt = Date.now()
    updateRecovered = false
    window.sessionStorage.setItem(UPDATE_JOB_STORAGE_KEY, updateState.value.job_id || '')
    if (!['queued', 'running'].includes(updateState.value.status)) {
      await handleUpdateFinished(updateState.value)
      return
    }
    ElMessage.info('Update task started; services will restart automatically')
    scheduleUpdatePoll()
  } catch (error) {
    ElMessage.error(error.message || 'Cannot start automatic update')
  }
}

async function resumeRunningUpdate() {
  const trackedJobId = window.sessionStorage.getItem(UPDATE_JOB_STORAGE_KEY)
  if (!trackedJobId) return
  try {
    const response = await fetch('/api/system/update/status')
    if (!response.ok) return
    const state = await response.json()
    if (state.job_id !== trackedJobId) return
    updateState.value = state
    updateRecovered = true
    const startedAt = Date.parse(state.started_at || '')
    updateStartedAt = Number.isFinite(startedAt) ? startedAt : Date.now()
    if (['queued', 'running'].includes(state.status)) {
      scheduleUpdatePoll()
      return
    }
    await handleUpdateFinished(state, { recovered: true })
  } catch {
    // A status check should not block the rest of the sidebar.
  }
}

onMounted(() => {
  loadVersionStatus()
  resumeRunningUpdate()
  versionTimer = window.setInterval(loadVersionStatus, VERSION_CHECK_INTERVAL_MS)
})

onBeforeUnmount(() => {
  if (versionTimer) window.clearInterval(versionTimer)
  stopUpdatePolling()
})
</script>

<style lang="scss" scoped>
.sidebar {
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  width: var(--ti-sidebar-width);
  padding: 18px 14px;
  border-right: 1px solid rgba(87, 97, 123, 0.08);
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(16px);
  overflow-x: hidden;
  transition: width 0.3s ease;
}

.sidebar.collapsed {
  width: var(--ti-sidebar-collapsed);
}

.sidebar__brand {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
  padding: 10px 8px 16px;
  border-bottom: 1px solid var(--ti-border-soft);
}

.sidebar__brand-mark {
  display: inline-flex;
  width: 42px;
  height: 42px;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  background: linear-gradient(135deg, var(--ti-primary-soft), rgba(244, 248, 255, 0.96));
  color: var(--ti-primary);
  font-size: 20px;
}

.sidebar__brand-text strong {
  color: var(--ti-text-primary);
  font-size: 16px;
}

.sidebar__nav {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  overflow-x: hidden;
}

.sidebar__group {
  display: grid;
  gap: 8px;
}

.sidebar__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 12px;
  border: 1px solid transparent;
  border-radius: 18px;
  color: var(--ti-text-secondary);
  transition:
    transform 0.2s ease,
    background 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
}

.sidebar__item--button {
  width: 100%;
  background: transparent;
  cursor: pointer;
}

.sidebar__item:hover,
.sidebar__group.active > .sidebar__item {
  transform: translateX(2px);
  border-color: var(--ti-border-soft);
  background: rgba(255, 255, 255, 0.56);
  color: var(--ti-text-primary);
}

.sidebar__item.active,
.sidebar__group.active > .sidebar__item.sidebar__item--button {
  border-color: rgba(45, 93, 255, 0.16);
  background: linear-gradient(135deg, rgba(237, 242, 255, 0.96), rgba(248, 251, 255, 0.96));
  color: var(--ti-text-primary);
}

.sidebar__item-main {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.sidebar__item-icon,
.sidebar__child-icon {
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.84);
  color: var(--ti-accent-strong);
  font-size: 18px;
}

.sidebar__child-icon {
  width: 26px;
  height: 26px;
  border-radius: 10px;
  font-size: 14px;
  background: rgba(45, 93, 255, 0.08);
  color: var(--ti-primary);
}

.sidebar__item-title {
  color: var(--ti-text-primary);
  font-size: 14px;
  font-weight: 700;
}

.sidebar__group-meta {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.sidebar__group-arrow {
  color: var(--ti-text-muted);
  font-size: 14px;
}

.sidebar__children {
  display: grid;
  gap: 6px;
  padding-left: 14px;
}

.sidebar__child {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 8px 12px;
  border-radius: 14px;
  color: var(--ti-text-secondary);
  transition:
    background 0.2s ease,
    color 0.2s ease,
    transform 0.2s ease;
}

.sidebar__child:hover,
.sidebar__child.active {
  background: rgba(45, 93, 255, 0.08);
  color: var(--ti-text-primary);
  transform: translateX(2px);
}

.sidebar__footer {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--ti-border-soft);
}

.sidebar__version {
  margin-bottom: 12px;
  padding: 14px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.62);
  border: 1px solid var(--ti-border-soft);
}

.sidebar__version--update {
  border-color: rgba(232, 128, 48, 0.32);
  background: rgba(255, 248, 238, 0.86);
}

.sidebar__version-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.sidebar__version-label {
  display: inline-block;
  margin-bottom: 6px;
  color: var(--ti-accent-strong);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.sidebar__version-icon {
  color: var(--ti-success-strong);
  font-size: 15px;
}

.sidebar__version-icon--warning {
  color: var(--ti-warning-strong);
}

.sidebar__version strong {
  display: block;
  color: var(--ti-text-primary);
  font-size: 14px;
  line-height: 1.4;
}

.sidebar__version p {
  margin-top: 4px;
  color: var(--ti-text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.sidebar__update {
  width: 100%;
  margin-top: 10px;
}

.sidebar__update :deep(.el-button__text),
.sidebar__update span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar__collapse {
  width: 100%;
  height: 40px;
  border: 1px solid var(--ti-border-default);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.72);
  color: var(--ti-text-secondary);
  cursor: pointer;
}

@media (max-width: 767px) {
  .sidebar {
    width: var(--ti-sidebar-collapsed);
    padding-left: 10px;
    padding-right: 10px;
  }

  .sidebar__brand-text,
  .sidebar__item-text,
  .sidebar__version,
  .sidebar__children {
    display: none !important;
  }

  .sidebar__item {
    justify-content: center;
    padding-left: 8px;
    padding-right: 8px;
  }
}
</style>
