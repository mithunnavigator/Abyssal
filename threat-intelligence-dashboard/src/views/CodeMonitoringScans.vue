<template>
  <div class="code-monitoring-scans ti-page">
    <section class="content-grid">
      <div class="ti-card ti-reveal-up">
        <div class="ti-card-header">
          <div class="ti-card-title">Code Scan Execution</div>
          <div class="health-actions">
            <el-button plain :loading="loadingWatchlists" @click="loadWatchlists">Refresh configuration</el-button>
            <el-button type="success" :loading="scanLoading" @click="runScan">Scan now</el-button>
            <el-select v-model="continuousIntervalHours" style="width: 150px">
              <el-option label="Every 1 hour" :value="1" />
              <el-option label="Every 4 hours" :value="4" />
              <el-option label="Every 8 hours" :value="8" />
            </el-select>
            <el-button type="success" :loading="continuousLoading" :disabled="continuousStartDisabled" @click="startContinuousScan">Start long-running scan</el-button>
            <el-button type="danger" plain :loading="continuousLoading" :disabled="continuousStopDisabled" @click="stopContinuousScan">Stop long-running scan</el-button>
          </div>
        </div>
        <div class="ti-card-body">
          <div class="status-grid status-grid--compact">
            <div class="metric-card">
              <span>Long-running tasks</span>
              <strong>{{ continuousStatus.enabled ? 'Running' : 'Not started' }}</strong>
            </div>
            <div class="metric-card">
              <span>Running tasks</span>
              <strong>{{ continuousStatus.active_watchlist_count || 0 }}</strong>
            </div>
            <div class="metric-card">
              <span>Scan interval</span>
              <strong>{{ continuousStatus.interval_seconds ? `${Math.round(continuousStatus.interval_seconds / 3600)}  hours` : 'Not set' }}</strong>
            </div>
            <div class="metric-card">
              <span>Last background scan</span>
              <strong class="metric-card__value metric-card__value--small">{{ formatDateTime(continuousStatus.last_success_at) || 'None' }}</strong>
            </div>
            <div class="metric-card">
              <span>Long-running target</span>
              <strong class="metric-card__value metric-card__value--small">{{ continuousStatus.target_watchlist_name || 'Not bound' }}</strong>
            </div>
            <div class="metric-card">
              <span>Latest layered results</span>
              <strong class="metric-card__value metric-card__value--small">{{ `${continuousStatus.sensitive_hit_count || 0} / ${continuousStatus.clue_hit_count || 0}` }}</strong>
            </div>
          </div>

          <div class="scan-form">
            <div class="scan-form__item">
              <span>Monitoring target</span>
              <el-select v-model="scanForm.watchlistId" placeholder="Select monitoring target">
                <el-option v-for="item in watchlists" :key="item.id" :label="item.name" :value="item.id" />
              </el-select>
            </div>
          </div>

          <div class="rule-box">
            <span>Sensitive Rules</span>
            <el-checkbox-group v-model="scanForm.enabledRuleKeys">
              <el-checkbox v-for="item in ruleOptions" :key="item.value" :label="item.value">
                {{ item.label }}
              </el-checkbox>
            </el-checkbox-group>
          </div>

          <div class="scan-status">
            <p class="panel-note">Long-running background code monitoring scans run independently per monitoring target. This page only shows the long-running task status of the selected target and uses that target’s GitHub / GitLab / Gitee platform configuration, detail fetching and unrestricted search/result budget.</p>
            <p v-if="(continuousStatus.active_watchlist_count || 0) > 1" class="panel-note">{{ continuousStatus.active_watchlist_count }} monitoring targets are currently running long-running scans.</p>
            <p v-if="lastRunMessage" class="panel-note">{{ lastRunMessage }}</p>
            <p v-if="continuousStatus.last_error" class="panel-note panel-note--danger">Background scan error:{{ continuousStatus.last_error }}</p>
            <p v-if="lastRunErrors.length" class="panel-note panel-note--danger">
              Last scan error:{{ lastRunErrors.slice(0, 3).join('; ') }}
            </p>
          </div>
        </div>
      </div>

      <div class="ti-card ti-reveal-up">
        <div class="ti-card-header">
          <div class="ti-card-title">Scan history</div>
          <div class="health-actions">
            <el-button plain :loading="loadingScans" @click="loadScans">Refresh history</el-button>
          </div>
        </div>
        <div class="ti-card-body">
          <div class="ti-table-shell">
            <el-table :data="scanRuns" table-layout="fixed" style="width: 100%">
              <el-table-column prop="finishedAt" label="Completed at" :width="scanFinishedColumnWidth">
                <template #default="{ row }">
                  {{ formatDateTime(row.finishedAt) || '-' }}
                </template>
              </el-table-column>
              <el-table-column v-if="showScanWatchlistColumn" prop="watchlistName" label="Monitoring target" :width="scanWatchlistColumnWidth" show-overflow-tooltip />
              <el-table-column v-if="showScanPlatformsColumn" label="Scan platforms" :min-width="scanPlatformsMinWidth">
                <template #default="{ row }">
                  {{ Array.isArray(row.platforms) ? row.platforms.join(' / ') : '-' }}
                </template>
              </el-table-column>
              <el-table-column v-if="showScanCandidateColumn" prop="candidateCount" label="Candidates" :width="scanMetricColumnWidth" />
              <el-table-column prop="hitCount" label="Hits" :width="scanMetricColumnWidth" />
              <el-table-column v-if="showScanSensitiveColumn" prop="sensitiveHitCount" label="Sensitive hit" :width="scanSensitiveColumnWidth" />
              <el-table-column v-if="showScanSensitiveColumn" prop="clueHitCount" label="Lead hit" :width="scanSensitiveColumnWidth" />
              <el-table-column v-if="showScanErrorColumn" prop="errorCount" label="Errors" :width="scanMetricColumnWidth" />
              <el-table-column prop="status" label="Status" :width="scanStatusColumnWidth" />
            </el-table>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useCodeMonitoringApi } from '@/composables/useCodeMonitoringApi'
import { formatShanghaiDateTime } from '@/composables/useShanghaiTime'

const api = useCodeMonitoringApi()

const loadingWatchlists = ref(false)
const loadingScans = ref(false)
const scanLoading = ref(false)
const continuousLoading = ref(false)
const watchlists = ref([])
const scanRuns = ref([])
const viewportWidth = ref(typeof window === 'undefined' ? 1440 : window.innerWidth)
const lastRunMessage = ref('')
const lastRunErrors = ref([])
const continuousIntervalHours = ref(1)
const continuousStatus = ref({
  enabled: false,
  running: false,
  started_at: '',
  last_tick_at: '',
  last_success_at: '',
  last_error: '',
  interval_seconds: 3600,
  watchlist_count: 0,
  candidate_count: 0,
  hit_count: 0,
  clue_hit_count: 0,
  sensitive_hit_count: 0,
  target_watchlist_id: 0,
  target_watchlist_name: '',
  active_watchlist_count: 0,
})
let continuousTimer = null

const ruleOptions = [
  { label: 'API Key', value: 'api_key' },
  { label: 'Token', value: 'token' },
  { label: 'AK / SK', value: 'ak_sk' },
  { label: 'Database connection string', value: 'db_url' },
  { label: 'JWT Secret', value: 'jwt_secret' },
  { label: 'Redis URL', value: 'redis_url' },
  { label: 'Private key', value: 'private_key' },
  { label: 'Intranet URL', value: 'internal_url' },
  { label: 'Account password', value: 'password' },
]

const scanForm = reactive({
  watchlistId: null,
  platforms: ['github', 'gitlab', 'gitee'],
  fileExtensions: [],
  searchPageLimit: 0,
  maxResultsPerTerm: 0,
  detailFetch: true,
  enabledRuleKeys: ['api_key', 'token', 'ak_sk', 'db_url', 'jwt_secret', 'redis_url', 'private_key', 'internal_url', 'password'],
})

const continuousStartDisabled = computed(() => {
  const selectedId = Number(scanForm.watchlistId || 0)
  if (!selectedId) return true
  return Boolean(continuousStatus.value.enabled)
})

const continuousStopDisabled = computed(() => !continuousStatus.value.enabled)
const showScanWatchlistColumn = computed(() => viewportWidth.value >= 1180)
const showScanPlatformsColumn = computed(() => viewportWidth.value >= 1500)
const showScanCandidateColumn = computed(() => viewportWidth.value >= 1280)
const showScanSensitiveColumn = computed(() => viewportWidth.value >= 1680)
const showScanErrorColumn = computed(() => viewportWidth.value >= 1180)
const scanFinishedColumnWidth = computed(() => viewportWidth.value < 1180 ? 128 : viewportWidth.value < 1500 ? 142 : 160)
const scanWatchlistColumnWidth = computed(() => viewportWidth.value < 1500 ? 136 : 150)
const scanPlatformsMinWidth = computed(() => 190)
const scanMetricColumnWidth = computed(() => viewportWidth.value < 1500 ? 84 : 90)
const scanSensitiveColumnWidth = computed(() => 96)
const scanStatusColumnWidth = computed(() => viewportWidth.value < 1500 ? 88 : 94)

function formatDateTime(value) {
  return formatShanghaiDateTime(value)
}

function applyWatchlist(payload) {
  if (!payload) return
  scanForm.watchlistId = payload.id
  scanForm.platforms = ['github', 'gitlab', 'gitee']
  scanForm.fileExtensions = []
  scanForm.searchPageLimit = 0
  scanForm.maxResultsPerTerm = 0
  scanForm.detailFetch = true
  scanForm.enabledRuleKeys = Array.isArray(payload.enabled_rule_keys) ? [...payload.enabled_rule_keys] : []
}

async function loadWatchlists() {
  loadingWatchlists.value = true
  try {
    watchlists.value = await api.loadWatchlists()
    if (!scanForm.watchlistId) {
      applyWatchlist(watchlists.value[0] || null)
      return
    }
    const current = watchlists.value.find((item) => item.id === scanForm.watchlistId)
    if (current) applyWatchlist(current)
  } catch (error) {
    ElMessage.error(error.message || 'Failed to load monitoring targets')
  } finally {
    loadingWatchlists.value = false
  }
}

async function loadScans() {
  loadingScans.value = true
  try {
    scanRuns.value = await api.loadScans({ limit: 50, watchlistId: scanForm.watchlistId || undefined })
  } catch (error) {
    ElMessage.error(error.message || 'Failed to load scan history')
  } finally {
    loadingScans.value = false
  }
}

async function loadContinuousStatus() {
  try {
    continuousStatus.value = await api.loadContinuousStatus({
      watchlistId: scanForm.watchlistId || undefined,
    })
  } catch (error) {
    ElMessage.error(error.message || 'Failed to load long-running scan status')
  }
}

async function runScan() {
  if (!scanForm.watchlistId) {
    ElMessage.error('Select a monitoring target first')
    return
  }
  scanLoading.value = true
  lastRunMessage.value = ''
  lastRunErrors.value = []
  try {
    const payload = await api.runScan(scanForm.watchlistId, {
      platforms: scanForm.platforms,
      file_extensions: scanForm.fileExtensions,
      search_page_limit: scanForm.searchPageLimit,
      max_results_per_term: scanForm.maxResultsPerTerm,
      detail_fetch: scanForm.detailFetch,
      enabled_rule_keys: scanForm.enabledRuleKeys,
    })
    lastRunMessage.value = `Scanned ${payload.scanned_terms || 0} monitoring terms, ${payload.candidates || 0} candidates, ${payload.hits || 0} hits (sensitive ${payload.sensitive_hits || 0} / leads ${payload.clue_hits || 0}).`
    lastRunErrors.value = payload.errors || []
    await loadScans()
    ElMessage.success('Code scan executed')
  } catch (error) {
    ElMessage.error(error.message || 'Failed to run code scan')
  } finally {
    scanLoading.value = false
  }
}

async function startContinuousScan() {
  if (!scanForm.watchlistId) {
    ElMessage.error('Select a monitoring target first')
    return
  }
  continuousLoading.value = true
  try {
    const payload = await api.startContinuous({
      interval_seconds: Number(continuousIntervalHours.value || 1) * 3600,
      watchlist_id: scanForm.watchlistId,
    })
    continuousStatus.value = payload
    ElMessage.success(payload.message || 'Long-running code monitoring scan enabled')
  } catch (error) {
    ElMessage.error(error.message || 'Failed to enable long-running code monitoring scan')
  } finally {
    continuousLoading.value = false
  }
}

async function stopContinuousScan() {
  if (!scanForm.watchlistId) {
    ElMessage.error('Select a monitoring target first')
    return
  }
  continuousLoading.value = true
  try {
    const payload = await api.stopContinuous({
      watchlist_id: scanForm.watchlistId,
    })
    continuousStatus.value = payload
    ElMessage.success(payload.message || 'Long-running code monitoring scan stopped')
  } catch (error) {
    ElMessage.error(error.message || 'Failed to stop long-running code monitoring scan')
  } finally {
    continuousLoading.value = false
  }
}

watch(
  () => scanForm.watchlistId,
  async (watchlistId) => {
    if (!watchlistId) return
    const target = watchlists.value.find((item) => item.id === watchlistId)
    if (target) applyWatchlist(target)
    await loadScans()
    await loadContinuousStatus()
  },
)

function updateViewportWidth() {
  viewportWidth.value = window.innerWidth
}

onMounted(async () => {
  updateViewportWidth()
  window.addEventListener('resize', updateViewportWidth)
  await loadWatchlists()
  await loadScans()
  await loadContinuousStatus()
  continuousTimer = window.setInterval(() => {
    loadContinuousStatus()
    loadScans()
  }, 15000)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateViewportWidth)
  if (continuousTimer) {
    window.clearInterval(continuousTimer)
    continuousTimer = null
  }
})
</script>

<style scoped lang="scss">
.content-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 22px;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.metric-card {
  display: grid;
  gap: 6px;
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(247, 250, 255, 0.96);
  border: 1px solid rgba(116, 142, 184, 0.14);
}

.metric-card span {
  color: var(--ti-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.metric-card strong {
  color: var(--ti-text-primary);
}

.metric-card__value--small {
  font-size: 13px;
  line-height: 1.5;
  word-break: break-all;
}

.scan-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.scan-form__item,
.rule-box {
  display: grid;
  gap: 8px;
}

.scan-form__item span,
.rule-box span {
  color: var(--ti-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.scan-form__item--switches {
  align-content: start;
}

.scan-form__item--switches label {
  display: flex;
  align-items: center;
  gap: 10px;
}

.rule-box {
  margin-top: 18px;
}

.scan-status,
.ti-table-shell {
  margin-top: 18px;
}

@media (max-width: 1200px) {
  .status-grid,
  .scan-form {
    grid-template-columns: 1fr;
  }
}
</style>
