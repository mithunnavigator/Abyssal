<template>
  <div class="document-exposure-settings ti-page">
    <section class="settings-header ti-reveal-up">
      <div>
        <div class="settings-header__eyebrow">{{ currentModule.eyebrow }}</div>
        <h2>{{ currentModule.title }}</h2>
        <p>{{ currentModule.subtitle }}</p>
      </div>
      <div class="module-tabs">
        <el-button
          v-for="item in moduleTabs"
          :key="item.sourceFamily"
          :type="item.sourceFamily === currentSourceFamily ? 'primary' : ''"
          plain
          @click="router.push(item.settingsRoute)"
        >
          {{ item.label }}
        </el-button>
      </div>
    </section>

    <section class="content-grid">
      <div class="ti-card ti-reveal-up">
        <div class="ti-card-header">
          <div>
            <div class="ti-card-title">{{ currentModule.sourceTitle }}</div>
            <div class="ti-card-subtitle">{{ modulePlatformRows.length }}  sources; the current configuration only applies to{{ currentModule.label }}</div>
          </div>
          <div class="health-actions">
            <el-button plain :loading="loadingPlatforms" @click="loadPlatforms">Refresh sources</el-button>
          </div>
        </div>
        <div class="ti-card-body">
          <div class="source-overview">
            <span v-for="item in sourceTypeSummary" :key="item.label" class="source-overview__item">
              <strong>{{ item.value }}</strong>
              {{ item.label }}
            </span>
          </div>
          <div class="ti-table-shell">
            <el-table :data="pagedModulePlatformRows" table-layout="fixed" style="width: 100%">
              <el-table-column prop="label" label="Information source" :min-width="settingsSourceNameMinWidth" show-overflow-tooltip />
              <el-table-column v-if="showSettingsSourceTypeColumn" label="Type" :width="settingsSourceTypeColumnWidth">
                <template #default="{ row }">
                  <el-tag effect="plain">{{ platformTypeLabel(row.platform_type) }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column v-if="showSettingsSourceAccessColumn" label="Integration method" :width="settingsSourceAccessColumnWidth">
                <template #default="{ row }">
                  {{ platformAccessMode(row) }}
                </template>
              </el-table-column>
              <el-table-column label="Domain / Address" :min-width="settingsSourceAddressMinWidth" show-overflow-tooltip>
                <template #default="{ row }">
                  {{ sourceAddress(row) }}
                </template>
              </el-table-column>
              <el-table-column v-if="showSettingsSourcePolicyColumn" label="Default strategy" :width="settingsSourcePolicyColumnWidth">
                <template #default="{ row }">
                  <el-tag :type="sourcePolicyTagType(row)" effect="light">
                    {{ sourcePolicyLabel(row) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="Status" :width="settingsSourceStateColumnWidth">
                <template #default="{ row }">
                  <el-tag :type="sourceStateTagType(row)" effect="light">
                    {{ sourceStateLabel(row) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column v-if="showSettingsSourceHomepageColumn" label="Home page" :width="settingsSourceHomepageColumnWidth">
                <template #default="{ row }">
                  <el-link v-if="row.homepage_url" :href="row.homepage_url" target="_blank" type="primary">Open</el-link>
                  <span v-else>-</span>
                </template>
              </el-table-column>
            </el-table>
          </div>
          <div v-if="modulePlatformRows.length > sourcePageSize" class="source-pagination">
            <el-pagination
              v-model:current-page="sourcePage"
              :page-size="sourcePageSize"
              :total="modulePlatformRows.length"
              layout="total, prev, pager, next"
              background
            />
          </div>
        </div>
      </div>

      <div v-if="currentSourceFamily === 'netdisk_aggregator'" class="ti-card ti-reveal-up">
        <div class="ti-card-header">
          <div>
            <div class="ti-card-title">Source health / Pagination cursors</div>
            <div class="ti-card-subtitle">{{ netdiskCursorRows.length }}  items; read-only view of netdisk source health and suggested page for the next round</div>
          </div>
          <div class="health-actions">
            <el-button plain :loading="loadingNetdiskCursor" @click="loadNetdiskCursor">Refresh status</el-button>
          </div>
        </div>
        <div class="ti-card-body">
          <div class="ti-table-shell">
            <el-table :data="netdiskCursorRows" table-layout="fixed" style="width: 100%" size="small">
              <el-table-column label="Source" :min-width="cursorSourceMinWidth" show-overflow-tooltip>
                <template #default="{ row }">
                  <span>{{ row.sourceLabel || row.sourceKey || '-' }}</span>
                </template>
              </el-table-column>
              <el-table-column label="Keyword" :min-width="cursorTermMinWidth" show-overflow-tooltip>
                <template #default="{ row }">
                  <span>{{ row.term || '-' }}</span>
                </template>
              </el-table-column>
              <el-table-column v-if="showCursorSuggestedColumn" label="Suggested page" :width="cursorSuggestedColumnWidth">
                <template #default="{ row }">
                  <span class="cursor-pages">{{ formatSuggestedPages(row) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="Status" :width="cursorStatusColumnWidth">
                <template #default="{ row }">
                  <span :class="['state-status', `state-status--${row.healthStatus || 'healthy'}`]">
                    {{ healthStatusLabel(row.healthStatus) }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column v-if="showCursorCountersColumn" label="Empty/duplicate pages" :width="cursorCountersColumnWidth">
                <template #default="{ row }">
                  <span>{{ formatCursorCounters(row) }}</span>
                </template>
              </el-table-column>
              <el-table-column v-if="showCursorUpdatedColumn" label="Updated at" :width="cursorUpdatedColumnWidth">
                <template #default="{ row }">
                  <span>{{ formatDateTime(row.updatedAt || row.healthUpdatedAt) || '-' }}</span>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </div>
      </div>

      <div v-if="moduleSessions.length" class="ti-card ti-reveal-up">
        <div class="ti-card-header">
          <div class="ti-card-title">{{ currentModule.sessionTitle }}</div>
          <div class="health-actions">
            <el-button plain :loading="loadingSessions" @click="loadSessions">Refresh sessions</el-button>
          </div>
        </div>
        <div class="ti-card-body">
          <div class="ti-table-shell">
            <el-table :data="moduleSessions" table-layout="fixed" style="width: 100%">
              <el-table-column prop="label" label="Platform" :min-width="sessionPlatformMinWidth" show-overflow-tooltip />
              <el-table-column label="Status" :width="sessionStatusColumnWidth">
                <template #default="{ row }">
                  {{ statusLabelMap[row.status] || row.status || 'unknown' }}
                </template>
              </el-table-column>
              <el-table-column v-if="showSessionAccountColumn" prop="account_label" label="Account label" :width="sessionAccountColumnWidth">
                <template #default="{ row }">
                  <el-input v-model="sessionDrafts[row.platform]" placeholder="Account label" size="small" />
                </template>
              </el-table-column>
              <el-table-column v-if="showSessionVerifiedColumn" prop="last_verified_at" label="Last checked" :width="sessionVerifiedColumnWidth">
                <template #default="{ row }">
                  {{ formatDateTime(row.last_verified_at) || '-' }}
                </template>
              </el-table-column>
              <el-table-column v-if="showSessionErrorColumn" prop="last_error" label="Last error" :min-width="sessionErrorMinWidth" show-overflow-tooltip />
              <el-table-column label="Actions" :width="sessionActionColumnWidth">
                <template #default="{ row }">
                  <div class="table-actions">
                    <el-button
                      size="small"
                      :disabled="row.status === 'login_in_progress' || Boolean(loginStarting[row.platform])"
                      :loading="Boolean(loginStarting[row.platform])"
                      @click="launchLogin(row.platform)"
                    >
                      {{ row.status === 'login_in_progress' ? 'Logging in' : 'Start login' }}
                    </el-button>
                    <el-button size="small" type="primary" @click="saveSession(row.platform)">Save session</el-button>
                    <el-button size="small" plain @click="verifySession(row.platform)">Verify</el-button>
                    <el-button size="small" type="danger" plain @click="removeSession(row.platform)">Delete</el-button>
                  </div>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </div>
      </div>

      <div class="ti-card ti-reveal-up">
        <div class="ti-card-header">
          <div>
            <div class="ti-card-title">{{ currentModule.watchlistTitle }}</div>
            <div class="ti-card-subtitle">Only shows and saves monitoring targets for {{ currentModule.label }}</div>
          </div>
          <div class="health-actions">
            <el-button plain :loading="loadingWatchlists" @click="loadWatchlists">Refresh targets</el-button>
            <el-button plain @click="createWatchlist">New target</el-button>
            <el-button type="primary" :loading="savingWatchlist" @click="saveWatchlist">Save configuration</el-button>
          </div>
        </div>
        <div class="ti-card-body">
          <div class="watchlist-toolbar">
            <div class="watchlist-toolbar__item">
              <span>Monitoring target</span>
              <el-select v-model="selectedWatchlistId" placeholder="Select monitoring target" @change="selectWatchlist">
                <el-option
                  v-for="item in moduleWatchlists"
                  :key="item.id"
                  :label="item.name"
                  :value="item.id"
                />
              </el-select>
            </div>
            <div class="watchlist-toolbar__item">
              <span>Module</span>
              <div class="module-family">
                <el-tag type="primary" effect="plain">{{ currentModule.sourceLabel }}</el-tag>
              </div>
            </div>
            <div class="watchlist-toolbar__item watchlist-toolbar__item--switch">
              <span>Enabled state</span>
              <el-switch
                v-model="watchlistForm.enabled"
                active-text="Enable"
                inactive-text="Disable"
              />
            </div>
          </div>

          <div class="watchlist-form">
            <el-input v-model="watchlistForm.name" placeholder="Monitoring target name" />
            <el-input v-model="watchlistForm.organization_name" placeholder="Company name" />
            <el-input v-model="watchlistForm.notes" placeholder="Notes" />
          </div>

          <div class="watchlist-options">
            <div class="watchlist-option">
              <span>File type</span>
              <el-select v-model="watchlistForm.file_types" multiple collapse-tags placeholder="Select file types">
                <el-option v-for="item in fileTypeOptions" :key="item" :label="item" :value="item" />
              </el-select>
            </div>
            <div v-if="currentSourceFamily !== 'netdisk_aggregator'" class="watchlist-option">
              <span>Candidate limit per source</span>
              <el-input-number v-model="watchlistForm.page_limit" :min="1" :max="20" />
            </div>
            <div class="watchlist-option watchlist-option--switch">
              <span>Detail fetching</span>
              <el-switch v-model="watchlistForm.detail_fetch" active-text="Enable" inactive-text="Close" />
            </div>
          </div>

          <div class="watchlist-terms">
            <div class="watchlist-terms__header">
              <strong>Monitoring terms</strong>
              <el-button plain size="small" @click="addTerm">Add monitoring term</el-button>
            </div>
            <div v-for="(term, index) in watchlistForm.terms" :key="`${term.term_type}-${index}`" class="watchlist-term-row">
              <el-input v-model="term.term" placeholder="Monitoring terms" />
              <el-select v-model="term.term_type" placeholder="Type" style="width: 160px">
                <el-option label="Company" value="company_name" />
                <el-option label="Domain" value="domain" />
                <el-option label="Product" value="product" />
                <el-option label="Project" value="project" />
                <el-option label="Keyword" value="keyword" />
                <el-option label="Sensitive term" value="sensitive_keyword" />
              </el-select>
              <el-input-number v-if="currentSourceFamily !== 'netdisk_aggregator'" v-model="term.weight" :min="1" :max="30" />
              <el-switch v-model="term.enabled" />
              <el-button type="danger" plain size="small" @click="removeTerm(index)">Delete</el-button>
            </div>
            <el-empty v-if="!watchlistForm.terms.length" description="No monitoring terms yet" />
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { useDocumentExposureApi } from '@/composables/useDocumentExposureApi'
import { formatShanghaiDateTime } from '@/composables/useShanghaiTime'

const api = useDocumentExposureApi()
const route = useRoute()
const router = useRouter()

const MODULE_CONFIG = {
  netdisk_aggregator: {
    sourceFamily: 'netdisk_aggregator',
    label: 'Netdisk monitoring',
    title: 'Netdisk Monitoring Configuration',
    eyebrow: 'Netdisk',
    subtitle: 'Configure netdisk monitoring targets, keywords, file types and netdisk aggregator sources.',
    sourceLabel: 'Netdisk aggregators',
    sourceTitle: 'Netdisk sources',
    sessionTitle: 'Netdisk platform sessions',
    watchlistTitle: 'Netdisk monitoring targets and keywords',
    settingsRoute: '/document-exposure/netdisk/settings',
    platformTypes: ['netdisk_search', 'netdisk_share'],
  },
  document_library: {
    sourceFamily: 'document_library',
    label: 'Document library monitoring',
    title: 'Library Monitoring Configuration',
    eyebrow: 'Document Library',
    subtitle: 'Configure library monitoring targets, keywords, file types and library platform sources.',
    sourceLabel: 'Library platforms',
    sourceTitle: 'Library sources',
    sessionTitle: 'Library platform sessions',
    watchlistTitle: 'Library monitoring targets and keywords',
    settingsRoute: '/document-exposure/document-library/settings',
    platformTypes: ['document_library'],
  },
}

const moduleTabs = Object.values(MODULE_CONFIG)
const loadingPlatforms = ref(false)
const loadingSessions = ref(false)
const loadingWatchlists = ref(false)
const loadingNetdiskCursor = ref(false)
const savingWatchlist = ref(false)
const allPlatforms = ref([])
const platformSessions = ref([])
const watchlists = ref([])
const netdiskSourceStates = ref([])
const netdiskSourceHealth = ref([])
const selectedWatchlistId = ref(null)
const sourcePage = ref(1)
const viewportWidth = ref(typeof window === 'undefined' ? 1440 : window.innerWidth)
const sourcePageSize = 10
const sessionDrafts = reactive({})
const loginStarting = reactive({})
const fileTypeOptions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'rar', '7z', 'txt', 'csv']

const statusLabelMap = {
  configured: 'Configured',
  valid: 'Valid',
  invalid: 'expired',
  missing: 'Missing',
  unavailable: 'Unavailable',
  login_in_progress: 'Logging in',
  not_configured: 'Not configured',
}

const watchlistForm = reactive({
  id: null,
  name: '',
  organization_name: '',
  notes: '',
  enabled: true,
  source_families: [],
  file_types: [],
  page_limit: 4,
  detail_fetch: true,
  terms: [],
})

const currentSourceFamily = computed(() => (
  route.meta.sourceFamily || route.query.source_family || 'netdisk_aggregator'
))
const showSettingsSourceTypeColumn = computed(() => viewportWidth.value >= 1180)
const showSettingsSourceAccessColumn = computed(() => viewportWidth.value >= 1500)
const showSettingsSourcePolicyColumn = computed(() => viewportWidth.value >= 1680)
const showSettingsSourceHomepageColumn = computed(() => viewportWidth.value >= 1280)
const settingsSourceNameMinWidth = computed(() => viewportWidth.value < 1500 ? 150 : 170)
const settingsSourceTypeColumnWidth = computed(() => 116)
const settingsSourceAccessColumnWidth = computed(() => 120)
const settingsSourceAddressMinWidth = computed(() => viewportWidth.value < 1500 ? 200 : 240)
const settingsSourcePolicyColumnWidth = computed(() => 108)
const settingsSourceStateColumnWidth = computed(() => viewportWidth.value < 1500 ? 106 : 116)
const settingsSourceHomepageColumnWidth = computed(() => 84)
const showCursorSuggestedColumn = computed(() => viewportWidth.value >= 1180)
const showCursorCountersColumn = computed(() => viewportWidth.value >= 1500)
const showCursorUpdatedColumn = computed(() => viewportWidth.value >= 1500)
const cursorSourceMinWidth = computed(() => viewportWidth.value < 1500 ? 130 : 150)
const cursorTermMinWidth = computed(() => viewportWidth.value < 1500 ? 140 : 160)
const cursorSuggestedColumnWidth = computed(() => 110)
const cursorStatusColumnWidth = computed(() => 100)
const cursorCountersColumnWidth = computed(() => 110)
const cursorUpdatedColumnWidth = computed(() => 150)
const showSessionAccountColumn = computed(() => viewportWidth.value >= 1180)
const showSessionVerifiedColumn = computed(() => viewportWidth.value >= 1500)
const showSessionErrorColumn = computed(() => viewportWidth.value >= 1680)
const sessionPlatformMinWidth = computed(() => viewportWidth.value < 1500 ? 130 : 150)
const sessionStatusColumnWidth = computed(() => viewportWidth.value < 1500 ? 100 : 110)
const sessionAccountColumnWidth = computed(() => viewportWidth.value < 1500 ? 140 : 150)
const sessionVerifiedColumnWidth = computed(() => 150)
const sessionErrorMinWidth = computed(() => 180)
const sessionActionColumnWidth = computed(() => viewportWidth.value < 1500 ? 220 : 240)
const currentModule = computed(() => MODULE_CONFIG[currentSourceFamily.value] || MODULE_CONFIG.netdisk_aggregator)
const modulePlatformRows = computed(() => allPlatforms.value
  .filter((item) => currentModule.value.platformTypes.includes(item.platform_type))
  .sort(comparePlatformRows))
const pagedModulePlatformRows = computed(() => {
  const start = (sourcePage.value - 1) * sourcePageSize
  return modulePlatformRows.value.slice(start, start + sourcePageSize)
})
const moduleSessions = computed(() => platformSessions.value.filter((item) => (
  currentModule.value.platformTypes.includes(item.platform_type)
)))
const moduleWatchlists = computed(() => watchlists.value.filter((item) => {
  const families = Array.isArray(item.source_families) ? item.source_families : []
  return families.length === 1 && families[0] === currentSourceFamily.value
}))
const sourceTypeSummary = computed(() => {
  const rows = modulePlatformRows.value
  const groups = new Map()
  for (const item of rows) {
    const label = platformTypeLabel(item.platform_type)
    groups.set(label, (groups.get(label) || 0) + 1)
  }
  return [...groups.entries()].map(([label, value]) => ({ label, value }))
})
const netdiskHealthBySource = computed(() => {
  const rows = new Map()
  for (const item of netdiskSourceHealth.value || []) {
    rows.set(item.sourceKey, item)
  }
  return rows
})
const netdiskCursorRows = computed(() => {
  if (currentSourceFamily.value !== 'netdisk_aggregator') return []
  const states = Array.isArray(netdiskSourceStates.value) ? netdiskSourceStates.value : []
  if (states.length) {
    return states.map((row) => {
      const health = netdiskHealthBySource.value.get(row.sourceKey) || {}
      return {
        ...row,
        healthStatus: health.status || 'healthy',
        healthUpdatedAt: health.updatedAt || '',
      }
    })
  }
  return (netdiskSourceHealth.value || []).map((row) => ({
    sourceKey: row.sourceKey,
    sourceLabel: row.sourceLabel,
    term: '',
    suggestedPages: [1],
    consecutiveEmptyPages: 0,
    consecutiveRepeatedPages: 0,
    healthStatus: row.status || 'healthy',
    healthUpdatedAt: row.updatedAt || '',
  }))
})

function formatDateTime(value) {
  return formatShanghaiDateTime(value)
}

function comparePlatformRows(left, right) {
  if (currentSourceFamily.value !== 'netdisk_aggregator') return 0
  return platformSortRank(left) - platformSortRank(right)
}

function platformSortRank(row) {
  if (row.platform_type === 'netdisk_search') return Number(row.scan_priority || 999)
  if (row.platform_type === 'netdisk_share') return 500
  return 999
}

function platformTypeLabel(type) {
  return {
    netdisk_search: 'Netdisk aggregator',
    netdisk_share: 'Netdisk share platform',
    document_library: 'Library platforms',
  }[type] || type || '-'
}

function platformAccessMode(row) {
  if (row.platform === 'panhub') return 'External API'
  if (row.discovery_only) return 'Public search'
  if (row.platform_type === 'netdisk_share') return 'Link recognition'
  return row.requires_login ? 'Login session' : 'Public search'
}

function sourceAddress(row) {
  if (Array.isArray(row.domains) && row.domains.length) {
    return row.domains.join(', ')
  }
  return row.homepage_url || '-'
}

function sourceStateLabel(row) {
  if (row.scan_tier === 'primary') return 'Enabled by default'
  if (row.scan_tier === 'optional') return row.scan_enabled ? 'Enabled by default' : 'Needs configuration'
  if (row.scan_tier === 'fallback') return row.scan_enabled ? 'Fallback enabled' : 'Fallback disabled'
  if (row.discovery_only) return 'Integrated'
  if (row.requires_login) return 'Needs session'
  return 'Integrated'
}

function sourceStateTagType(row) {
  if (row.scan_tier === 'primary') return 'success'
  if (row.scan_tier === 'optional') return row.scan_enabled ? 'success' : 'warning'
  if (row.scan_tier === 'fallback') return row.scan_enabled ? 'warning' : 'info'
  if (row.discovery_only) return 'success'
  return row.requires_login ? 'warning' : 'info'
}

function sourcePolicyLabel(row) {
  if (row.scan_tier === 'primary') return `Priority ${row.scan_priority || ''}`.trim()
  if (row.scan_tier === 'optional') return 'Optional API'
  if (row.scan_tier === 'fallback') return 'Fallback'
  if (row.platform_type === 'netdisk_share') return 'Link recognition'
  return 'Default'
}

function sourcePolicyTagType(row) {
  if (row.scan_tier === 'primary') return 'success'
  if (row.scan_tier === 'optional') return row.scan_enabled ? 'success' : 'warning'
  if (row.scan_tier === 'fallback') return 'info'
  return row.requires_login ? 'warning' : 'info'
}

function formatSuggestedPages(row) {
  const pages = Array.isArray(row?.suggestedPages) ? row.suggestedPages : []
  return pages.length ? pages.join(', ') : '-'
}

function healthStatusLabel(status) {
  return {
    healthy: 'Healthy',
    error: 'Error',
    login_required: 'Login required',
    captcha: 'CAPTCHA',
    rate_limited: 'Rate-limited',
  }[status] || status || 'Healthy'
}

function formatCursorCounters(row) {
  return `${Number(row?.consecutiveEmptyPages || 0)} / ${Number(row?.consecutiveRepeatedPages || 0)}`
}

function defaultDetailFetch() {
  return currentSourceFamily.value === 'document_library'
}

function defaultPageLimit() {
  return currentSourceFamily.value === 'document_library' ? 10 : 4
}

function emptyWatchlist() {
  return {
    id: null,
    name: '',
    organization_name: '',
    notes: '',
    enabled: true,
    source_families: [currentSourceFamily.value],
    file_types: [],
    page_limit: defaultPageLimit(),
    detail_fetch: defaultDetailFetch(),
    terms: [],
  }
}

function applyWatchlist(payload) {
  const next = payload || emptyWatchlist()
  selectedWatchlistId.value = next.id ?? null
  watchlistForm.id = next.id ?? null
  watchlistForm.name = next.name || ''
  watchlistForm.organization_name = next.organization_name || ''
  watchlistForm.notes = next.notes || ''
  watchlistForm.enabled = next.enabled ?? true
  watchlistForm.source_families = [currentSourceFamily.value]
  watchlistForm.file_types = Array.isArray(next.file_types) ? [...next.file_types] : []
  watchlistForm.page_limit = Number(next.page_limit || defaultPageLimit())
  watchlistForm.detail_fetch = Boolean(next.detail_fetch ?? defaultDetailFetch())
  watchlistForm.terms = Array.isArray(next.terms) ? next.terms.map((item) => ({ ...item })) : []
}

function selectFirstModuleWatchlist(preferredId = null) {
  const rows = moduleWatchlists.value
  const target = rows.find((item) => item.id === preferredId) || rows[0] || null
  applyWatchlist(target)
}

function createWatchlist() {
  applyWatchlist(emptyWatchlist())
}

function selectWatchlist(watchlistId) {
  const target = moduleWatchlists.value.find((item) => item.id === watchlistId)
  applyWatchlist(target || null)
}

function addTerm() {
  watchlistForm.terms.push({ term: '', term_type: 'company_name', weight: 10, enabled: true })
}

function removeTerm(index) {
  watchlistForm.terms.splice(index, 1)
}

async function loadPlatforms() {
  loadingPlatforms.value = true
  try {
    allPlatforms.value = await api.loadPlatforms()
    sourcePage.value = 1
  } catch (error) {
    ElMessage.error(error.message || 'Failed to load sources')
  } finally {
    loadingPlatforms.value = false
  }
}

async function loadSessions() {
  loadingSessions.value = true
  try {
    platformSessions.value = await api.loadSessions()
    for (const item of platformSessions.value) {
      sessionDrafts[item.platform] = item.account_label || ''
    }
  } catch (error) {
    ElMessage.error(error.message || 'Failed to load platform sessions')
  } finally {
    loadingSessions.value = false
  }
}

async function loadWatchlists() {
  loadingWatchlists.value = true
  try {
    watchlists.value = await api.loadWatchlists()
    selectFirstModuleWatchlist(selectedWatchlistId.value)
  } catch (error) {
    ElMessage.error(error.message || 'Failed to load monitoring targets')
  } finally {
    loadingWatchlists.value = false
  }
}

async function loadNetdiskCursor() {
  if (currentSourceFamily.value !== 'netdisk_aggregator') {
    netdiskSourceStates.value = []
    netdiskSourceHealth.value = []
    return
  }
  loadingNetdiskCursor.value = true
  try {
    const [statePayload, healthPayload] = await Promise.all([
      api.loadNetdiskSourceStates(),
      api.loadNetdiskSourceHealth(),
    ])
    netdiskSourceStates.value = Array.isArray(statePayload) ? statePayload : []
    netdiskSourceHealth.value = Array.isArray(healthPayload) ? healthPayload : []
  } catch (error) {
    ElMessage.error(error.message || 'Failed to load netdisk source status')
  } finally {
    loadingNetdiskCursor.value = false
  }
}

async function saveWatchlist() {
  if (!watchlistForm.name.trim()) {
    ElMessage.error('Enter the monitoring target name')
    return
  }
  if (!watchlistForm.organization_name.trim()) {
    ElMessage.error('Enter a company name')
    return
  }
  savingWatchlist.value = true
  try {
    const terms = watchlistForm.terms.map((term) => ({
      ...term,
      weight: currentSourceFamily.value === 'netdisk_aggregator' ? 10 : Number(term.weight || 10),
    }))
    const payload = await api.saveWatchlist({
      ...watchlistForm,
      terms,
      source_families: [currentSourceFamily.value],
    })
    await loadWatchlists()
    applyWatchlist(payload)
    ElMessage.success('Monitoring configuration saved')
  } catch (error) {
    ElMessage.error(error.message || 'Failed to save monitoring configuration')
  } finally {
    savingWatchlist.value = false
  }
}

async function launchLogin(platform) {
  if (loginStarting[platform]) return
  loginStarting[platform] = true
  try {
    const payload = await api.launchLogin(platform)
    await loadSessions()
    ElMessage.success(payload?.message || 'Login session started')
  } catch (error) {
    ElMessage.error(error.message || 'Failed to start login')
  } finally {
    loginStarting[platform] = false
  }
}

async function saveSession(platform) {
  try {
    await api.saveSession(platform, sessionDrafts[platform] || '')
    await loadSessions()
    ElMessage.success('Session saved')
  } catch (error) {
    ElMessage.error(error.message || 'Failed to save session')
  }
}

async function verifySession(platform) {
  try {
    await api.verifySession(platform)
    await loadSessions()
    ElMessage.success('Session status refreshed')
  } catch (error) {
    ElMessage.error(error.message || 'Session verification failed')
  }
}

async function removeSession(platform) {
  try {
    await api.deleteSession(platform)
    await loadSessions()
    ElMessage.success('Session deleted')
  } catch (error) {
    ElMessage.error(error.message || 'Failed to delete session')
  }
}

watch(currentSourceFamily, () => {
  sourcePage.value = 1
  selectFirstModuleWatchlist(null)
  loadNetdiskCursor()
})

watch(() => modulePlatformRows.value.length, (total) => {
  const maxPage = Math.max(1, Math.ceil(total / sourcePageSize))
  if (sourcePage.value > maxPage) {
    sourcePage.value = maxPage
  }
})

function updateViewportWidth() {
  viewportWidth.value = window.innerWidth
}

onMounted(async () => {
  updateViewportWidth()
  window.addEventListener('resize', updateViewportWidth)
  await Promise.all([loadPlatforms(), loadSessions(), loadWatchlists(), loadNetdiskCursor()])
})

onUnmounted(() => {
  window.removeEventListener('resize', updateViewportWidth)
})
</script>

<style scoped lang="scss">
.settings-header {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: flex-start;
  margin-bottom: 22px;
}

.settings-header__eyebrow {
  color: var(--ti-accent);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

.settings-header h2 {
  margin: 8px 0 8px;
  color: var(--ti-text-primary);
  font-size: 28px;
  line-height: 1.2;
}

.settings-header p {
  margin: 0;
  color: var(--ti-text-secondary);
}

.module-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}

.content-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 22px;
}

.ti-card-subtitle {
  margin-top: 6px;
  color: var(--ti-text-secondary);
  font-size: 13px;
}

.source-overview {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.source-overview__item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid var(--ti-border);
  border-radius: 8px;
  color: var(--ti-text-secondary);
  background: var(--ti-surface-soft);
}

.source-overview__item strong {
  color: var(--ti-text-primary);
}

.ti-table-shell {
  margin-top: 18px;
}

.cursor-pages {
  color: #155bd6;
  font-weight: 600;
}

.state-status {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  border-radius: 4px;
  color: #2f6b4f;
  background: rgba(55, 182, 166, 0.12);
  font-size: 12px;
  font-weight: 600;
}

.state-status--error,
.state-status--captcha,
.state-status--login_required,
.state-status--rate_limited {
  color: #b45808;
  background: rgba(238, 157, 41, 0.14);
}

.source-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.table-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.watchlist-toolbar {
  display: grid;
  grid-template-columns: minmax(260px, 380px) minmax(160px, 220px) auto;
  gap: 16px;
  margin-bottom: 18px;
}

.watchlist-toolbar__item {
  display: grid;
  gap: 8px;
}

.watchlist-toolbar__item--switch {
  align-content: start;
}

.module-family {
  min-height: 32px;
  display: flex;
  align-items: center;
}

.watchlist-form {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.watchlist-options {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) 180px 180px;
  gap: 12px;
  margin-bottom: 18px;
}

.watchlist-option {
  display: grid;
  gap: 8px;
}

.watchlist-option--switch {
  align-content: start;
}

.watchlist-toolbar__item span,
.watchlist-option span {
  color: var(--ti-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.watchlist-terms {
  display: grid;
  gap: 10px;
}

.watchlist-terms__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.watchlist-term-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 160px 120px 96px 80px;
  gap: 10px;
  align-items: center;
}

@media (max-width: 1200px) {
  .settings-header {
    display: grid;
  }

  .module-tabs {
    justify-content: flex-start;
  }

  .watchlist-toolbar,
  .watchlist-form,
  .watchlist-options,
  .watchlist-term-row {
    grid-template-columns: 1fr;
  }
}
</style>
