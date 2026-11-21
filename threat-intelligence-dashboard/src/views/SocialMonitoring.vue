<template>
  <div class="sm-page">
    <header class="sm-heading">
      <div>
        <h1>Social platform monitoring</h1>
      </div>
      <el-button v-if="isAdmin" type="primary" @click="newWatchlist">New monitoring target</el-button>
    </header>

    <div class="sm-scope" role="note">
      <el-icon><InfoFilled /></el-icon>
      <span>{{ coverage.message || 'Only covers posts already indexed by public search engines; scan results need further verification.' }}</span>
    </div>

    <section class="sm-card sm-control" aria-label="Monitoring target selection and scanning">
      <div class="sm-control__select">
        <span class="sm-label">Current monitoring target</span>
        <el-select v-model="selectedId" placeholder="Select monitoring target" :disabled="creating" @change="selectWatchlist">
          <el-option v-for="item in watchlists" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
        <el-tag v-if="selectedWatchlist" :type="selectedWatchlist.enabled ? 'success' : 'info'" effect="plain">
          {{ selectedWatchlist.enabled ? 'Monitoring' : 'Disabled' }}
        </el-tag>
        <el-tag v-else-if="creating" type="primary" effect="plain">Creating</el-tag>
      </div>
      <div class="sm-control__actions">
        <span v-if="selectedWatchlist" class="sm-muted">Next scan {{ nextScanLabel(selectedWatchlist.next_scan_at) }}</span>
        <el-button :loading="loading" @click="refresh(false)">Refresh</el-button>
        <el-button
          v-if="isAdmin"
          type="primary"
          :loading="scanning"
          :disabled="!selectedWatchlist?.enabled || latestScan?.status === 'running'"
          @click="startScan"
        >Scan now</el-button>
      </div>
    </section>

    <div v-if="loadError" class="sm-error" role="alert">{{ loadError }}</div>

    <section v-if="selectedId && activeTab !== 'settings'" class="sm-metrics" aria-label="Monitoring overview">
      <div class="sm-metric sm-card">
        <span>Leads pending verification</span>
        <strong>{{ pendingCount }}</strong>
        <small>Last 100 scan results</small>
      </div>
      <div class="sm-metric sm-card">
        <span>Found this round</span>
        <strong>{{ latestScan?.stats?.discovered_unique ?? '—' }}</strong>
        <small>Deduplicated single-post links</small>
      </div>
      <div class="sm-metric sm-card">
        <span>Read attempts this round</span>
        <strong>{{ latestScan?.stats?.checked ?? '—' }}</strong>
        <small>Does not mean the full body was obtained</small>
      </div>
      <div class="sm-metric sm-card">
        <span>Last scan</span>
        <strong class="sm-metric__status">{{ scanStatusLabel(latestScan?.status || selectedWatchlist?.last_scan_status) }}</strong>
        <small>{{ timeLabel(latestScan?.finished_at || latestScan?.started_at || selectedWatchlist?.last_scan_at) }}</small>
      </div>
    </section>

    <section v-if="activeTab !== 'settings'" class="sm-card sm-sources" aria-label="Current collection sources">
      <div class="sm-section-title">
        <div>
          <h2>Current collection sources</h2>
          <p>The three entry points use the same search index and cannot be treated as independent corroboration.</p>
        </div>
        <el-tag type="warning" effect="plain">Limited coverage</el-tag>
      </div>
      <div class="sm-source-grid">
        <div v-for="source in coverage.sources || []" :key="source.key" class="sm-source">
          <div class="sm-source__head">
            <span class="sm-source__platform">{{ source.platform === 'x' ? 'X' : 'Facebook' }}</span>
            <el-tag :type="sourceError(source.key) || latestScan?.status === 'failed' ? 'danger' : 'info'" size="small" effect="plain">
              {{ sourceStatusLabel(source.key) }}
            </el-tag>
          </div>
          <strong>{{ sourceLabel(source.key) }}</strong>
          <el-link :href="source.url" target="_blank" rel="noopener noreferrer" type="primary">Open search entry</el-link>
        </div>
      </div>
    </section>

    <section class="sm-card sm-workspace">
      <el-tabs v-model="activeTab">
        <el-tab-pane name="leads" :label="`Monitoring leads ${pendingCount ? ` (${pendingCount})` : ''}`">
          <div class="sm-list-toolbar">
            <el-radio-group v-model="hitFilter" size="small">
              <el-radio-button value="pending">To be verified</el-radio-button>
              <el-radio-button value="all">All results</el-radio-button>
            </el-radio-group>
            <el-input v-model.trim="hitSearch" clearable placeholder="Filter titles or links" class="sm-hit-search" />
            <span class="sm-muted">Showing the latest {{ hits.length }}, up to 100</span>
          </div>
          <el-empty v-if="!selectedId" description="Select a monitoring target to view leads" />
          <div v-else class="sm-table-wrap">
            <el-table v-loading="loading" :data="visibleHits" table-layout="fixed" empty-text="No leads match the current conditions">
              <el-table-column label="Platform" width="92">
                <template #default="{ row }"><span class="sm-platform" :class="`sm-platform--${row.platform}`">{{ row.platform === 'x' ? 'X' : 'FB' }}</span></template>
              </el-table-column>
              <el-table-column prop="title" label="Search title" min-width="270" show-overflow-tooltip>
                <template #default="{ row }"><span class="sm-title">{{ row.title || 'No title provided' }}</span></template>
              </el-table-column>
              <el-table-column label="Content visibility" width="126">
                <template #default="{ row }">{{ contentStatusLabel(row.source_status) }}</template>
              </el-table-column>
              <el-table-column label="Filter result" width="130">
                <template #default="{ row }"><el-tag :type="classificationTone(row.classification)" size="small" effect="plain">{{ classificationLabel(row.classification) }}</el-tag></template>
              </el-table-column>
              <el-table-column label="Manual verdict" width="116">
                <template #default="{ row }">{{ reviewLabel(row) }}</template>
              </el-table-column>
              <el-table-column label="First found" width="158">
                <template #default="{ row }">{{ timeLabel(row.first_seen_at) }}</template>
              </el-table-column>
              <el-table-column label="Actions" width="80" fixed="right">
                <template #default="{ row }"><el-button link type="primary" @click="openHit(row)">View</el-button></template>
              </el-table-column>
            </el-table>
          </div>
        </el-tab-pane>

        <el-tab-pane name="scans" label="Scan records">
          <el-empty v-if="!selectedId" description="Select a monitoring target to view scan records" />
          <div v-else class="sm-table-wrap">
            <el-table v-loading="loading" :data="scans" table-layout="fixed" empty-text="No scan records yet">
              <el-table-column type="expand" width="44">
                <template #default="{ row }">
                  <div class="sm-scan-detail">
                    <span>Index scope: first page of public search results</span>
                    <span>Not completed due to the round limit: {{ row.stats?.skipped_due_limit ?? 0 }}</span>
                    <span>Original post inaccessible: {{ row.stats?.unavailable_count ?? 0 }}</span>
                    <div v-if="row.stats?.source_errors?.length" class="sm-scan-errors">
                      <strong>Source error</strong>
                      <p v-for="(error, index) in row.stats.source_errors" :key="index">{{ error }}</p>
                    </div>
                    <p v-if="row.stats?.error" class="sm-scan-errors">{{ row.stats.error }}</p>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="Start time" min-width="160">
                <template #default="{ row }">{{ timeLabel(row.started_at) }}</template>
              </el-table-column>
              <el-table-column label="Status" width="150">
                <template #default="{ row }">{{ scanStatusLabel(row.status) }}</template>
              </el-table-column>
              <el-table-column label="Found / read attempts" width="145">
                <template #default="{ row }">{{ row.stats?.discovered_unique ?? 0 }} / {{ row.stats?.checked ?? 0 }}</template>
              </el-table-column>
              <el-table-column label="New" width="82">
                <template #default="{ row }">{{ row.stats?.new_hits ?? 0 }}</template>
              </el-table-column>
              <el-table-column label="Candidates / to verify" width="138">
                <template #default="{ row }">{{ row.stats?.candidate_count ?? 0 }} / {{ row.stats?.unverified_count ?? 0 }}</template>
              </el-table-column>
              <el-table-column label="Source error" width="95">
                <template #default="{ row }">{{ row.stats?.source_errors?.length ?? 0 }}</template>
              </el-table-column>
              <el-table-column label="Completed at" min-width="160">
                <template #default="{ row }">{{ timeLabel(row.finished_at) }}</template>
              </el-table-column>
            </el-table>
          </div>
        </el-tab-pane>

        <el-tab-pane v-if="isAdmin" name="settings" :label="creating ? 'New monitoring target' : 'Monitoring configuration'">
          <el-form label-position="top" class="sm-config-form">
            <div class="sm-config-grid">
              <section class="sm-config-card" aria-label="Monitoring target configuration">
                <div class="sm-config-card__head">
                  <h3>Monitoring target</h3>
                </div>
                <el-form-item label="Target name"><el-input v-model.trim="form.name" maxlength="80" placeholder="e.g. CATL" /></el-form-item>
                <el-form-item label="Run status">
                  <div class="sm-config-toggle"><el-switch v-model="form.enabled" /><span>{{ form.enabled ? 'Enable scheduled scans' : 'Disable scheduled scans' }}</span></div>
                </el-form-item>
              </section>
              <section class="sm-config-card" aria-label="Execution schedule configuration">
                <div class="sm-config-card__head">
                  <h3>Execution schedule</h3>
                </div>
                <div class="sm-config-card__fields">
                  <el-form-item label="Scan interval"><el-input-number v-model="form.interval_minutes" :min="60" :max="1440" :step="30" /><span class="sm-config-hint">minutes, at least 60</span></el-form-item>
                  <el-form-item label="Read attempts per platform per round"><el-input-number v-model="form.max_posts_per_platform" :min="1" :max="30" /><span class="sm-config-hint">public posts, up to 30</span></el-form-item>
                </div>
              </section>
              <section class="sm-config-card sm-config-card--wide" aria-label="Search discovery configuration">
                <div class="sm-config-card__head">
                  <h3>Search discovery</h3>
                </div>
                <el-form-item label="Search term combinations (up to 4 lines)"><el-input v-model="form.queries" type="textarea" :rows="4" placeholder="CATL data breach&#10;CATL ransomware" /></el-form-item>
              </section>
              <section class="sm-config-card sm-config-card--wide" aria-label="Local filter configuration">
                <div class="sm-config-card__head">
                  <h3>Local filtering</h3>
                </div>
                <div class="sm-config-card__fields">
                  <el-form-item label="Company names and aliases (one per line)"><el-input v-model="form.aliases" type="textarea" :rows="4" placeholder="CATL&#10;Contemporary Amperex Technology" /></el-form-item>
                  <el-form-item label="Cybersecurity risk terms (one per line)"><el-input v-model="form.risk_terms" type="textarea" :rows="4" placeholder="data breach&#10;ransomware" /></el-form-item>
                </div>
                <p class="sm-config-hint">The same content must match both an alias and a risk term; candidate leads still need manual verification.</p>
              </section>
            </div>
          </el-form>
          <div class="sm-config-actions">
            <el-button link type="primary" @click="fillCatlExample">Fill in the CATL example</el-button>
            <el-button type="primary" :loading="saving" @click="saveWatchlist">{{ selectedId ? 'Save configuration' : 'Create monitoring target' }}</el-button>
          </div>
        </el-tab-pane>
      </el-tabs>
    </section>

    <el-drawer v-model="hitOpen" title="Post leads" size="min(520px, 100%)" destroy-on-close>
      <template v-if="selectedHit">
        <div class="sm-drawer-title">{{ selectedHit.title || 'No title provided' }}</div>
        <div class="sm-drawer-status">
          <el-tag :type="classificationTone(selectedHit.classification)" effect="plain">{{ classificationLabel(selectedHit.classification) }}</el-tag>
          <span>Last scan:{{ contentStatusLabel(selectedHit.source_status) }}</span>
        </div>
        <section class="sm-preview" aria-label="Public content preview">
          <h3>Public content preview</h3>
          <p class="sm-muted">The public page is re-read when opening details; only a redacted preview is shown temporarily and the original text is not saved.</p>
          <div v-loading="previewLoading" class="sm-preview__body">
            <template v-if="preview?.text">
              <strong>{{ preview.source_status === 'source_text' ? 'Publicly visible post text' : 'Public page metadata (not full text)' }}</strong>
              <p>{{ preview.text }}</p>
              <small v-if="preview.truncated">Content is long; only the first 600 characters are shown. Open the original post to check.</small>
            </template>
            <span v-else-if="!previewLoading" class="sm-muted">{{ previewError || 'The original post cannot be read anonymously right now; open the original post to check.' }}</span>
          </div>
        </section>
        <dl class="sm-details">
          <dt>Platform</dt><dd>{{ selectedHit.platform === 'x' ? 'X' : 'Facebook' }}</dd>
          <dt>Public link</dt><dd><el-link :href="selectedHit.source_url" target="_blank" rel="noopener noreferrer" type="primary">Open original post</el-link></dd>
          <dt>Discovery entry</dt><dd>{{ (selectedHit.found_via || []).map(sourceLabel).join(', ') || '—' }}</dd>
          <dt>Matched aliases</dt><dd>{{ (selectedHit.matched_aliases || []).join(', ') || '—' }}</dd>
          <dt>Matched risk terms</dt><dd>{{ (selectedHit.matched_risks || []).join(', ') || '—' }}</dd>
          <dt>First found</dt><dd>{{ timeLabel(selectedHit.first_seen_at) }}</dd>
          <dt>Last found</dt><dd>{{ timeLabel(selectedHit.last_seen_at) }}</dd>
          <dt>Manual verdict</dt><dd>{{ reviewLabel(selectedHit) }}</dd>
          <template v-if="selectedHit.evidence_url">
            <dt>Independent evidence</dt><dd><el-link :href="selectedHit.evidence_url" target="_blank" rel="noopener noreferrer" type="primary">View evidence</el-link></dd>
          </template>
          <template v-if="selectedHit.review_note">
            <dt>Verification notes</dt><dd>{{ selectedHit.review_note }}</dd>
          </template>
        </dl>
        <div v-if="isReviewable(selectedHit)" class="sm-review">
          <h3>Manual verification</h3>
          <p>Candidate posts are only leads. Choosing “Independently corroborated” requires submitting an evidence link from another source and the verification basis.</p>
          <el-form label-position="top">
            <el-form-item label="Verdict">
              <el-select v-model="reviewForm.status" style="width: 100%">
                <el-option label="To be verified" value="pending" />
                <el-option label="Association not confirmed" value="unconfirmed" />
                <el-option label="False positive" value="false_positive" />
                <el-option label="Independently corroborated" value="corroborated" :disabled="selectedHit.classification !== 'candidate'" />
              </el-select>
            </el-form-item>
            <el-form-item v-if="reviewForm.status === 'corroborated'" label="Independent evidence link">
              <el-input v-model.trim="reviewForm.evidence_url" placeholder="Company, regulator or trusted research source" />
            </el-form-item>
            <el-form-item label="Verification notes">
              <el-input v-model="reviewForm.note" type="textarea" :rows="3" placeholder="Record the basis for the verdict; do not paste credentials or sensitive content" />
            </el-form-item>
            <el-button type="primary" :loading="reviewing" @click="submitReview">Save verification</el-button>
          </el-form>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { isCurrentUserAdmin } from '@/composables/useAuth'
import { requestJson } from '@/composables/requestJson'

const isAdmin = computed(isCurrentUserAdmin)
const coverage = ref({ message: '', sources: [] })
const watchlists = ref([])
const selectedId = ref('')
const creating = ref(false)
const hits = ref([])
const scans = ref([])
const activeTab = ref('leads')
const hitFilter = ref('pending')
const hitSearch = ref('')
const loading = ref(false)
const saving = ref(false)
const scanning = ref(false)
const reviewing = ref(false)
const loadError = ref('')
const hitOpen = ref(false)
const selectedHit = ref(null)
const preview = ref(null)
const previewLoading = ref(false)
const previewError = ref('')
const form = reactive({ name: '', aliases: '', risk_terms: '', queries: '', enabled: true, interval_minutes: 120, max_posts_per_platform: 8 })
const reviewForm = reactive({ status: 'pending', evidence_url: '', note: '' })
let timer = null
let previewRequestId = 0
let selectedRequestId = 0

const sourceNames = { social_searcher_x: 'X Primary search entry', awesome_x: 'X Supplementary search entry', awesome_facebook: 'Facebook Search entry' }
const selectedWatchlist = computed(() => watchlists.value.find((item) => item.id === selectedId.value) || null)
const latestScan = computed(() => scans.value[0] || null)
const pendingCount = computed(() => hits.value.filter((row) => isReviewable(row) && row.review_status === 'pending').length)
const visibleHits = computed(() => hits.value.filter((row) => {
  if (hitFilter.value === 'pending' && (!isReviewable(row) || row.review_status !== 'pending')) return false
  const needle = hitSearch.value.toLocaleLowerCase()
  return !needle || `${row.title} ${row.source_url}`.toLocaleLowerCase().includes(needle)
}))
const lines = (text) => [...new Set(String(text || '').split(/[\n,, ]+/).map((item) => item.trim()).filter(Boolean))]
const isReviewable = (row) => ['candidate', 'unverified_search_hit'].includes(row?.classification)
const sourceLabel = (key) => sourceNames[key] || key
const contentStatusLabel = (value) => ({ source_text: 'Public body', public_metadata: 'Public metadata', unavailable: 'Original post inaccessible' }[value] || 'To be confirmed')
const classificationLabel = (value) => ({ candidate: 'Risk candidate', unverified_search_hit: 'Search hit only', no_risk: 'No risk terms', not_target: 'Not this target', unavailable: 'Cannot verify' }[value] || value)
const classificationTone = (value) => ({ candidate: 'warning', unverified_search_hit: 'info', no_risk: 'success', not_target: 'info', unavailable: 'info' }[value] || 'info')
const scanStatusLabel = (value) => ({ running: 'Scanning', completed_limited: 'Completed · limited coverage', failed: 'Scan failed' }[value] || 'Not scanned yet')
function reviewLabel(row) {
  if (row.review_status === 'pending' && !isReviewable(row)) return 'No verification needed'
  return ({ pending: 'To be verified', unconfirmed: 'Association not confirmed', false_positive: 'False positive', corroborated: 'Independently corroborated' }[row.review_status] || 'To be verified')
}
function timeLabel(value) {
  if (!value) return '—'
  const time = new Date(value)
  return Number.isNaN(time.getTime()) ? '—' : time.toLocaleString('en-US', { hour12: false })
}
function nextScanLabel(value) {
  if (!value) return '—'
  const time = new Date(value)
  if (Number.isNaN(time.getTime())) return '—'
  return time <= new Date() ? 'Due; waiting for scheduling' : timeLabel(value)
}
function sourceError(key) {
  return (latestScan.value?.stats?.source_errors || []).some((error) => String(error).startsWith(`${key}:`))
}
function sourceStatusLabel(key) {
  if (sourceError(key)) return 'Errors this round'
  if (!latestScan.value) return 'Waiting to scan'
  if (latestScan.value.status === 'running') return 'Scanning'
  return latestScan.value.status === 'failed' ? 'Scan failed' : 'No errors this round'
}
function setForm(item) {
  Object.assign(form, {
    name: item?.name || '', aliases: (item?.aliases || []).join('\n'), risk_terms: (item?.risk_terms || []).join('\n'),
    queries: (item?.queries || []).join('\n'), enabled: item?.enabled ?? true,
    interval_minutes: item?.interval_minutes || 120, max_posts_per_platform: item?.max_posts_per_platform || 8,
  })
}
function fillCatlExample() {
  Object.assign(form, { name: 'CATL', aliases: 'CATL\nCATL', risk_terms: 'data leak\ndata breach\nransomware\nransomware',
    queries: 'CATL data leak\nCATL data breach\nCATL ransomware\nCATL ransomware' })
}
function newWatchlist() {
  creating.value = true
  selectedId.value = ''
  hits.value = []
  scans.value = []
  setForm(null)
  activeTab.value = 'settings'
}
async function loadSelected() {
  const requestId = ++selectedRequestId
  const watchlistId = selectedId.value
  if (!watchlistId) return
  const base = `/api/social-monitoring/watchlists/${watchlistId}`
  const [nextHits, nextScans] = await Promise.all([requestJson(`${base}/hits`), requestJson(`${base}/scans`)])
  if (requestId !== selectedRequestId || watchlistId !== selectedId.value) return
  hits.value = nextHits
  scans.value = nextScans
}
async function refresh(silent = true) {
  if (loading.value) return
  loading.value = true
  try {
    const [items, status] = await Promise.all([
      requestJson('/api/social-monitoring/watchlists'), requestJson('/api/social-monitoring/status'),
    ])
    watchlists.value = items
    coverage.value = status
    if (!selectedId.value && items.length && !creating.value) {
      selectedId.value = items[0].id
      setForm(items[0])
    }
    if (selectedId.value && !selectedWatchlist.value) {
      selectedId.value = ''
      hits.value = []
      scans.value = []
    } else if (selectedId.value) {
      await loadSelected()
    }
    loadError.value = ''
  } catch (error) {
    loadError.value = error.message || 'Failed to load social monitoring data'
    if (!silent) ElMessage.error(loadError.value)
  } finally {
    loading.value = false
  }
}
async function selectWatchlist() {
  creating.value = false
  setForm(selectedWatchlist.value)
  hits.value = []
  scans.value = []
  try { await loadSelected() } catch (error) { ElMessage.error(error.message || 'Failed to load monitoring targets') }
}
async function saveWatchlist() {
  saving.value = true
  try {
    const payload = { name: form.name.trim(), aliases: lines(form.aliases), risk_terms: lines(form.risk_terms),
      queries: lines(form.queries), enabled: form.enabled, interval_minutes: form.interval_minutes,
      max_posts_per_platform: form.max_posts_per_platform }
    const item = await requestJson(selectedId.value ? `/api/social-monitoring/watchlists/${selectedId.value}` : '/api/social-monitoring/watchlists', {
      method: selectedId.value ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    selectedId.value = item.id
    creating.value = false
    ElMessage.success('Monitoring target saved')
    await refresh()
    activeTab.value = 'leads'
  } catch (error) {
    ElMessage.error(error.message || 'Failed to save configuration')
  } finally {
    saving.value = false
  }
}
async function startScan() {
  scanning.value = true
  try {
    await requestJson(`/api/social-monitoring/watchlists/${selectedId.value}/scan`, { method: 'POST' })
    ElMessage.info('Scan started; check progress in scan records')
    await refresh()
  } catch (error) {
    ElMessage.error(error.message || 'Failed to start scan')
  } finally {
    scanning.value = false
  }
}
async function openHit(row) {
  selectedHit.value = row
  Object.assign(reviewForm, { status: row.review_status || 'pending', evidence_url: row.evidence_url || '', note: row.review_note || '' })
  hitOpen.value = true
  preview.value = null
  previewError.value = ''
  previewLoading.value = true
  const requestId = ++previewRequestId
  try {
    const result = await requestJson(`/api/social-monitoring/hits/${encodeURIComponent(row.id)}/preview`)
    if (requestId === previewRequestId) preview.value = result
  } catch (error) {
    if (requestId === previewRequestId) previewError.value = error.message || 'Failed to read public content'
  } finally {
    if (requestId === previewRequestId) previewLoading.value = false
  }
}
async function submitReview() {
  if (reviewForm.status === 'corroborated' && (!reviewForm.evidence_url.startsWith('https://') || !reviewForm.note.trim())) {
    ElMessage.warning('Enter an independent HTTPS evidence link and verification notes')
    return
  }
  reviewing.value = true
  try {
    const updated = await requestJson(`/api/social-monitoring/hits/${encodeURIComponent(selectedHit.value.id)}/review`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reviewForm),
    })
    selectedHit.value = updated
    ElMessage.success('Verification record saved')
    await refresh()
  } catch (error) {
    ElMessage.error(error.message || 'Failed to save verification')
  } finally {
    reviewing.value = false
  }
}
onMounted(() => {
  refresh(false)
  timer = window.setInterval(() => refresh(), 15_000)
})
onBeforeUnmount(() => { if (timer) window.clearInterval(timer) })
</script>

<style scoped>
.sm-page { display: grid; gap: 12px; min-width: 0; color: var(--fg); }
.sm-heading, .sm-control, .sm-section-title, .sm-list-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.sm-heading h1 { margin: 2px 0 3px; font-size: 23px; line-height: 1.25; }
.sm-section-title p, .sm-review p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.6; }
.sm-card { min-width: 0; border: 1px solid var(--border); border-radius: 5px; background: var(--surface); box-shadow: 0 1px 2px color-mix(in oklch, var(--fg) 5%, transparent); }
.sm-scope { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border: 1px solid color-mix(in oklch, var(--warning) 25%, var(--border)); border-radius: 4px; background: color-mix(in oklch, var(--warning) 7%, var(--surface)); color: var(--muted); font-size: 12px; }
.sm-scope .el-icon { flex: none; color: var(--warning); }
.sm-control { min-height: 66px; padding: 10px 14px; }
.sm-control__select, .sm-control__actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.sm-control__select .el-select { width: 245px; }
.sm-label { color: var(--muted); font-size: 12px; font-weight: 600; }
.sm-muted { color: var(--muted); font-size: 11px; }
.sm-error { padding: 9px 12px; border: 1px solid var(--danger); border-radius: 4px; color: var(--danger); font-size: 12px; }
.sm-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.sm-metric { display: grid; align-content: center; min-height: 99px; padding: 13px 15px; }
.sm-metric span { color: var(--muted); font-size: 11px; }
.sm-metric strong { margin: 3px 0; font-size: 25px; line-height: 1.2; font-variant-numeric: tabular-nums; }
.sm-metric strong.sm-metric__status { font-size: 15px; }
.sm-metric small { color: var(--muted); font-size: 10px; }
.sm-sources { padding: 13px 15px 15px; }
.sm-section-title { align-items: flex-start; margin-bottom: 12px; }
.sm-section-title h2 { margin: 0 0 3px; font-size: 14px; }
.sm-source-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 9px; }
.sm-source { display: grid; gap: 5px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); }
.sm-source__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.sm-source__platform { color: var(--accent); font-size: 10px; font-weight: 750; text-transform: uppercase; }
.sm-source strong { font-size: 12px; }
.sm-source .el-link { width: max-content; font-size: 11px; }
.sm-workspace { padding: 8px 14px 14px; }
.sm-workspace :deep(.el-tabs__header) { margin-bottom: 10px; }
.sm-list-toolbar { justify-content: flex-start; flex-wrap: wrap; margin-bottom: 10px; }
.sm-hit-search { width: 240px; }
.sm-list-toolbar > .sm-muted { margin-left: auto; }
.sm-table-wrap { min-width: 0; overflow-x: auto; }
.sm-table-wrap :deep(.el-table) { min-width: 800px; font-size: 11px; }
.sm-title { font-weight: 600; }
.sm-platform { display: inline-grid; min-width: 29px; height: 24px; place-items: center; border-radius: 4px; background: #1d2939; color: white; font-size: 11px; font-weight: 750; }
.sm-platform--facebook { background: #1877f2; }
.sm-scan-detail { display: grid; gap: 5px; padding: 5px 12px 10px; color: var(--muted); font-size: 11px; }
.sm-scan-errors { color: var(--danger); }
.sm-scan-errors p { margin: 3px 0; overflow-wrap: anywhere; }
.sm-config-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.sm-config-card { min-width: 0; padding: 14px; border: 1px solid var(--border); border-radius: 5px; background: var(--surface); }
.sm-config-card--wide { grid-column: 1 / -1; }
.sm-config-card__head { margin-bottom: 12px; }
.sm-config-card__head h3 { margin: 0; font-size: 14px; }
.sm-config-card__fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.sm-config-card :deep(.el-form-item) { min-width: 0; margin-bottom: 12px; }
.sm-config-card :deep(.el-form-item:last-child) { margin-bottom: 0; }
.sm-config-card :deep(.el-form-item__label) { font-size: 12px; font-weight: 600; }
.sm-config-card :deep(.el-input-number) { width: 100%; max-width: 185px; }
.sm-config-hint { flex: 0 0 100%; margin: 6px 0 0; color: var(--muted); font-size: 11px; line-height: 1.5; }
.sm-config-toggle { display: flex; align-items: center; gap: 10px; min-height: 32px; color: var(--muted); font-size: 11px; }
.sm-config-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 14px; padding-top: 13px; border-top: 1px solid var(--border); }
.sm-drawer-title { margin-bottom: 10px; font-size: 16px; font-weight: 700; line-height: 1.5; overflow-wrap: anywhere; }
.sm-drawer-status { display: flex; align-items: center; gap: 9px; margin-bottom: 16px; color: var(--muted); font-size: 12px; }
.sm-preview { margin-bottom: 16px; }
.sm-preview h3 { margin: 0 0 5px; font-size: 14px; }
.sm-preview > p { margin: 0 0 9px; font-size: 12px; }
.sm-preview__body { min-height: 70px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 5px; background: var(--bg); }
.sm-preview__body strong { font-size: 12px; }
.sm-preview__body p { margin: 8px 0; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.6; }
.sm-preview__body small { color: var(--muted); }
.sm-details { display: grid; grid-template-columns: 88px minmax(0, 1fr); gap: 11px 12px; padding: 14px; border: 1px solid var(--border); border-radius: 4px; font-size: 12px; }
.sm-details dt { color: var(--muted); }
.sm-details dd { margin: 0; overflow-wrap: anywhere; }
.sm-review { margin-top: 22px; }
.sm-review h3 { margin: 0 0 5px; font-size: 15px; }
.sm-review p { margin-bottom: 14px; }
@media (max-width: 1050px) { .sm-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 680px) { .sm-heading, .sm-control { align-items: stretch; flex-direction: column; } .sm-control__select .el-select, .sm-hit-search { width: 100%; } .sm-metrics, .sm-source-grid, .sm-config-grid, .sm-config-card__fields { grid-template-columns: 1fr; } .sm-config-card--wide { grid-column: auto; } .sm-config-actions { align-items: stretch; flex-direction: column; } .sm-list-toolbar > .sm-muted { margin-left: 0; } }
</style>
