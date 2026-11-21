<template>
  <div class="code-monitoring-settings ti-page">
    <section class="content-grid">
      <div class="ti-card ti-reveal-up">
        <div class="ti-card-header">
          <div class="ti-card-title">GitHub API Authentication</div>
          <div class="health-actions">
            <span class="github-app-status" :class="githubAppStatus.className">
              <span class="github-app-status__dot" />
              {{ githubAppStatus.label }}
            </span>
            <el-button plain :loading="loadingGithubApp" @click="loadGithubAppConfig">Refresh status</el-button>
          </div>
        </div>
        <div class="ti-card-body">
          <div class="github-app-overview">
            <div>
              <span>App ID</span>
              <strong>{{ githubAppConfig.appId || '-' }}</strong>
            </div>
            <div>
              <span>Installation ID</span>
              <strong>{{ githubAppConfig.installationId || '-' }}</strong>
            </div>
            <div>
              <span>Last verified</span>
              <strong>{{ formatDateTime(githubAppConfig.lastValidatedAt) || '-' }}</strong>
            </div>
            <div>
              <span>Token expires</span>
              <strong>{{ formatDateTime(githubAppConfig.tokenExpiresAt) || '-' }}</strong>
            </div>
          </div>

          <el-alert
            v-if="githubAppConfig.lastError"
            class="github-app-alert"
            type="error"
            :closable="false"
            :title="githubAppConfig.lastError"
            show-icon
          />

          <el-form label-position="top" class="github-app-form" @submit.prevent>
            <div class="github-app-form__ids">
              <el-form-item label="App ID">
                <el-input v-model.trim="githubAppForm.appId" inputmode="numeric" autocomplete="off" />
              </el-form-item>
              <el-form-item label="Installation ID">
                <el-input v-model.trim="githubAppForm.installationId" inputmode="numeric" autocomplete="off" />
              </el-form-item>
            </div>
            <el-form-item :label="githubAppConfig.configured ? 'Private key (leave empty to keep the existing key)' : 'Private key'">
              <el-input
                v-model="githubAppForm.privateKey"
                class="github-app-private-key"
                type="textarea"
                :rows="7"
                resize="vertical"
                autocomplete="off"
                placeholder="Paste the complete GitHub App PEM private key"
              />
            </el-form-item>
          </el-form>

          <div class="github-app-footer">
            <p class="panel-note">
              Saving immediately verifies the App installation status and issues a token; the private key is never shown on the page or written to the Git repository.
            </p>
            <div class="github-app-actions">
              <el-button
                v-if="githubAppConfig.configured"
                type="danger"
                plain
                :loading="deletingGithubApp"
                @click="deleteGithubAppConfig"
              >
                Delete configuration
              </el-button>
              <el-button type="primary" :loading="savingGithubApp" @click="saveGithubAppConfig">
                Save and verify
              </el-button>
            </div>
          </div>
        </div>
      </div>

      <div class="ti-card ti-reveal-up">
        <div class="ti-card-header">
          <div class="ti-card-title">Platform session management</div>
          <div class="health-actions">
            <el-button plain :loading="loadingSessions || detectingSessions" @click="refreshSessions">
              Refresh sessions
            </el-button>
          </div>
        </div>
        <div class="ti-card-body">
          <div class="ti-table-shell">
            <el-table :data="platformSessions" table-layout="fixed" style="width: 100%">
              <el-table-column prop="label" label="Platform" :min-width="sessionPlatformMinWidth" show-overflow-tooltip />
              <el-table-column label="Status" :width="sessionStatusColumnWidth">
                <template #default="{ row }">
                  <span class="session-status" :class="statusBadgeClass(row.status)">
                    <span class="session-status__dot" />
                    {{ statusLabelMap[row.status] || row.status || 'unknown' }}
                  </span>
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
                    <el-button size="small" type="danger" plain @click="removeSession(row.platform)">Delete</el-button>
                  </div>
                </template>
              </el-table-column>
            </el-table>
          </div>
          <p class="panel-note">
            Code monitoring session status automatically checks code search page availability when entering the page and when clicking refresh; no manual verification needed.
          </p>
        </div>
      </div>

      <div class="ti-card ti-reveal-up">
        <div class="ti-card-header">
          <div class="ti-card-title">Monitoring targets and company profiles</div>
          <div class="health-actions">
            <el-button plain :loading="loadingWatchlists" @click="loadWatchlists">Refresh targets</el-button>
            <el-button plain @click="createWatchlist">New target</el-button>
            <el-button type="danger" plain :disabled="!selectedWatchlistId || savingWatchlist" @click="deleteWatchlist">Delete target</el-button>
            <el-button type="primary" :loading="savingWatchlist" @click="saveWatchlist">Save configuration</el-button>
          </div>
        </div>
        <div class="ti-card-body">
          <div class="watchlist-toolbar">
            <div class="watchlist-toolbar__item">
              <span>Monitoring target</span>
              <el-select v-model="selectedWatchlistId" placeholder="Select monitoring target" @change="selectWatchlist">
                <el-option v-for="item in watchlists" :key="item.id" :label="item.name" :value="item.id" />
              </el-select>
            </div>
            <div class="watchlist-toolbar__item watchlist-toolbar__item--switch">
              <span>Enabled state</span>
              <el-switch v-model="watchlistForm.enabled" active-text="Enable" inactive-text="Disable" />
            </div>
          </div>

          <div class="watchlist-form">
            <el-input v-model="watchlistForm.name" placeholder="Monitoring target name" />
            <el-input v-model="watchlistForm.organization_name" placeholder="Organization" />
            <el-input v-model="watchlistForm.notes" placeholder="Notes" />
          </div>

          <div class="watchlist-option">
            <span>Sensitive Rules</span>
            <el-checkbox-group v-model="watchlistForm.enabled_rule_keys">
              <el-checkbox v-for="item in ruleOptions" :key="item.value" :label="item.value">
                {{ item.label }}
              </el-checkbox>
            </el-checkbox-group>
          </div>

          <div class="enterprise-profile">
            <div class="watchlist-terms__header">
              <strong>Company profile</strong>
              <div class="enterprise-profile__actions">
                <span class="enterprise-profile__hint">One value per line, used to determine company anchors and high-risk escalation.</span>
                <el-button plain size="small" @click="clearEnterpriseProfile">Clear profile</el-button>
              </div>
            </div>
            <div class="enterprise-profile__grid">
              <div class="watchlist-option">
                <span>Company full name</span>
                <el-input
                  v-model="enterpriseProfileDraft.official_names"
                  type="textarea"
                  :rows="3"
                  placeholder="For example: CATL"
                />
              </div>
              <div class="watchlist-option">
                <span>Brand alias</span>
                <el-input
                  v-model="enterpriseProfileDraft.brand_aliases"
                  type="textarea"
                  :rows="3"
                  placeholder="For example: CATL&#10;Contemporary Amperex"
                />
              </div>
              <div class="watchlist-option">
                <span>English abbreviations</span>
                <el-input
                  v-model="enterpriseProfileDraft.english_aliases"
                  type="textarea"
                  :rows="3"
                  placeholder="For example:catl"
                />
              </div>
              <div class="watchlist-option">
                <span>Primary domain</span>
                <el-input
                  v-model="enterpriseProfileDraft.root_domains"
                  type="textarea"
                  :rows="3"
                  placeholder="For example:catl.com"
                />
              </div>
              <div class="watchlist-option">
                <span>Subdomain rules</span>
                <el-input
                  v-model="enterpriseProfileDraft.trusted_subdomain_patterns"
                  type="textarea"
                  :rows="3"
                  placeholder="For example:*.catl.com"
                />
              </div>
              <div class="watchlist-option">
                <span>Company system keywords</span>
                <el-input
                  v-model="enterpriseProfileDraft.internal_system_keywords"
                  type="textarea"
                  :rows="3"
                  placeholder="For example:zabbix&#10;eicc&#10;sso"
                />
              </div>
              <div class="watchlist-option">
                <span>Excluded aliases</span>
                <el-input
                  v-model="enterpriseProfileDraft.negative_aliases"
                  type="textarea"
                  :rows="3"
                  placeholder="Used to block known mismatched terms"
                />
              </div>
              <div class="watchlist-option">
                <span>Short-term protection</span>
                <el-input
                  v-model="enterpriseProfileDraft.short_alias_guard"
                  type="textarea"
                  :rows="3"
                  placeholder="For example:catl"
                />
              </div>
            </div>
          </div>

          <p class="panel-note">
            Code monitoring covers GitHub / GitLab / Gitee long-term by default, using high-risk file types and the detail fetching strategy.
          </p>

          <div class="watchlist-terms">
            <div class="watchlist-terms__header">
              <strong>Search terms</strong>
              <div class="watchlist-terms__actions">
                <el-button plain size="small" @click="downloadTermTemplate">Download template</el-button>
                <el-button plain size="small" :loading="importingTerms" @click="triggerTermImport">Import template</el-button>
                <el-button plain size="small" @click="addTerm">Add search term</el-button>
                <input
                  ref="termImportInputRef"
                  class="term-import-input"
                  type="file"
                  accept=".xlsx,.xls"
                  @change="handleTermImportFile"
                />
              </div>
            </div>
            <div v-for="(term, index) in watchlistForm.terms" :key="`${term.term_type}-${index}`" class="watchlist-term-row">
              <el-input v-model="term.term" placeholder="Search terms" />
              <el-select v-model="term.term_type" placeholder="Type" style="width: 160px">
                <el-option v-for="item in termTypeOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
              <el-switch v-model="term.enabled" />
              <el-button type="danger" plain size="small" @click="removeTerm(index)">Delete</el-button>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { useCodeMonitoringApi } from '@/composables/useCodeMonitoringApi'
import { formatShanghaiDateTime } from '@/composables/useShanghaiTime'

const api = useCodeMonitoringApi()
const router = useRouter()

const loadingGithubApp = ref(false)
const savingGithubApp = ref(false)
const deletingGithubApp = ref(false)
const loadingSessions = ref(false)
const detectingSessions = ref(false)
const loadingWatchlists = ref(false)
const savingWatchlist = ref(false)
const importingTerms = ref(false)
const platformSessions = ref([])
const watchlists = ref([])
const selectedWatchlistId = ref(null)
const viewportWidth = ref(typeof window === 'undefined' ? 1440 : window.innerWidth)
const termImportInputRef = ref(null)
const sessionDrafts = reactive({})
const loginStarting = reactive({})
const githubAppConfig = reactive({
  configured: false,
  appId: null,
  installationId: null,
  lastValidatedAt: '',
  tokenExpiresAt: '',
  lastError: '',
})
const githubAppForm = reactive({
  appId: '',
  installationId: '',
  privateKey: '',
})

const fileExtensionOptions = ['env', 'yaml', 'yml', 'json', 'ini', 'conf', 'properties', 'py', 'js', 'ts', 'java']
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
const termTypeOptions = [
  { label: 'Company', value: 'company_name', aliases: ['Company', 'Company name', 'Company name', 'company_name', 'company name', 'company'] },
  { label: 'Domain', value: 'domain', aliases: ['Domain', 'Primary domain', 'domain', 'root_domain', 'root domain'] },
  { label: 'Project', value: 'project', aliases: ['Project', 'Project', 'project', 'repo', 'repository'] },
  { label: 'Product', value: 'product', aliases: ['Product', 'Product', 'product'] },
  { label: 'Custom term', value: 'custom', aliases: ['Custom term', 'Custom', 'custom', 'keyword', 'Keyword'] },
]
const termTypeAliasMap = new Map(
  termTypeOptions.flatMap((item) => item.aliases.map((alias) => [normalizeImportToken(alias), item.value])),
)
const importColumnHeaders = {
  term: ['Search terms', 'Search term', 'Keyword', 'term', 'keyword', 'query'],
  term_type: ['Type', 'Search term type', 'term_type', 'type'],
  enabled: ['Enabled', 'Enable', 'Status', 'enabled', 'enable', 'active'],
}

const statusLabelMap = {
  configured: 'Configured',
  valid: 'Valid',
  invalid: 'Invalid',
  missing: 'Missing',
  unavailable: 'Unavailable',
  login_in_progress: 'Logging in',
  not_configured: 'Not configured',
}

const githubAppStatus = computed(() => {
  if (!githubAppConfig.configured) {
    return { label: 'Not configured', className: 'github-app-status--missing' }
  }
  if (githubAppConfig.lastError) {
    return { label: 'Connection error', className: 'github-app-status--invalid' }
  }
  return { label: 'Connected', className: 'github-app-status--valid' }
})

const showSessionAccountColumn = computed(() => viewportWidth.value >= 1180)
const showSessionVerifiedColumn = computed(() => viewportWidth.value >= 1500)
const showSessionErrorColumn = computed(() => viewportWidth.value >= 1680)
const sessionPlatformMinWidth = computed(() => viewportWidth.value < 1500 ? 130 : 150)
const sessionStatusColumnWidth = computed(() => viewportWidth.value < 1500 ? 100 : 110)
const sessionAccountColumnWidth = computed(() => viewportWidth.value < 1500 ? 140 : 150)
const sessionVerifiedColumnWidth = computed(() => 150)
const sessionErrorMinWidth = computed(() => 180)
const sessionActionColumnWidth = computed(() => viewportWidth.value < 1500 ? 220 : 240)

const watchlistForm = reactive({
  id: null,
  name: '',
  organization_name: '',
  notes: '',
  enabled: true,
  platforms: ['github', 'gitlab', 'gitee'],
  file_extensions: [...fileExtensionOptions],
  search_page_limit: 0,
  max_results_per_term: 0,
  detail_fetch: true,
  enabled_rule_keys: ['api_key', 'token', 'ak_sk', 'db_url', 'jwt_secret', 'redis_url', 'private_key', 'internal_url', 'password'],
  terms: [],
})

const enterpriseProfileDraft = reactive({
  official_names: '',
  brand_aliases: '',
  english_aliases: '',
  root_domains: '',
  trusted_subdomain_patterns: '',
  internal_system_keywords: '',
  negative_aliases: '',
  short_alias_guard: '',
})

function formatDateTime(value) {
  return formatShanghaiDateTime(value)
}

function statusBadgeClass(status) {
  return `session-status--${status || 'unknown'}`
}

function applyGithubAppConfig(payload = {}) {
  Object.assign(githubAppConfig, {
    configured: Boolean(payload.configured),
    appId: payload.appId || null,
    installationId: payload.installationId || null,
    lastValidatedAt: payload.lastValidatedAt || '',
    tokenExpiresAt: payload.tokenExpiresAt || '',
    lastError: payload.lastError || '',
  })
  githubAppForm.appId = payload.appId ? String(payload.appId) : ''
  githubAppForm.installationId = payload.installationId ? String(payload.installationId) : ''
  githubAppForm.privateKey = ''
}

async function loadGithubAppConfig() {
  if (loadingGithubApp.value) return
  loadingGithubApp.value = true
  try {
    applyGithubAppConfig(await api.loadGithubAppConfig())
  } catch (error) {
    ElMessage.error(error.message || 'GitHub App Failed to load configuration')
  } finally {
    loadingGithubApp.value = false
  }
}

async function saveGithubAppConfig() {
  const appId = Number(githubAppForm.appId)
  const installationId = Number(githubAppForm.installationId)
  if (!Number.isInteger(appId) || appId <= 0 || !Number.isInteger(installationId) || installationId <= 0) {
    ElMessage.error('App ID and Installation ID must be positive integers')
    return
  }
  if (!githubAppConfig.configured && !githubAppForm.privateKey.trim()) {
    ElMessage.error('A GitHub App private key is required for the first configuration')
    return
  }

  savingGithubApp.value = true
  try {
    applyGithubAppConfig(await api.saveGithubAppConfig({
      app_id: appId,
      installation_id: installationId,
      private_key: githubAppForm.privateKey,
    }))
    ElMessage.success('GitHub App Connected')
  } catch (error) {
    ElMessage.error(error.message || 'GitHub App Configuration verification failed')
  } finally {
    savingGithubApp.value = false
  }
}

async function deleteGithubAppConfig() {
  try {
    await ElMessageBox.confirm(
      'After deletion, the GitHub authenticated API will be unavailable and auto mode can only fall back to logged-in browser sessions.',
      'Delete GitHub App configuration',
      {
        type: 'warning',
        confirmButtonText: 'Delete',
        cancelButtonText: 'Cancel',
      },
    )
  } catch {
    return
  }

  deletingGithubApp.value = true
  try {
    applyGithubAppConfig(await api.deleteGithubAppConfig())
    ElMessage.success('GitHub App Configuration deleted')
  } catch (error) {
    ElMessage.error(error.message || 'GitHub App Failed to delete configuration')
  } finally {
    deletingGithubApp.value = false
  }
}

function normalizeLines(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeImportToken(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase()
}

function readImportCell(row, headers) {
  const normalizedRow = Object.fromEntries(
    Object.entries(row || {}).map(([key, value]) => [normalizeImportToken(key), value]),
  )
  for (const header of headers) {
    const value = normalizedRow[normalizeImportToken(header)]
    if (value != null && String(value).trim() !== '') return value
  }
  return ''
}

function normalizeImportedTermType(value) {
  if (String(value || '').trim() === '') return 'custom'
  return termTypeAliasMap.get(normalizeImportToken(value)) || ''
}

function normalizeImportedEnabled(value) {
  const text = normalizeImportToken(value)
  if (!text) return true
  if (['1', 'true', 'yes', 'y', 'enable', 'enabled', 'on', 'valid'].includes(text)) return true
  if (['0', 'false', 'no', 'n', 'disable', 'disabled', 'close', 'off', 'invalid'].includes(text)) return false
  return null
}

function termKey(item) {
  return `${String(item?.term || '').trim().toLowerCase()}::${String(item?.term_type || 'custom').toLowerCase()}`
}

function loadXlsx() {
  return import('xlsx')
}

function toMultilineText(values) {
  return Array.isArray(values) ? values.join('\n') : ''
}

function readEnterpriseProfilePayload() {
  return {
    official_names: normalizeLines(enterpriseProfileDraft.official_names),
    brand_aliases: normalizeLines(enterpriseProfileDraft.brand_aliases),
    english_aliases: normalizeLines(enterpriseProfileDraft.english_aliases),
    root_domains: normalizeLines(enterpriseProfileDraft.root_domains),
    trusted_subdomain_patterns: normalizeLines(enterpriseProfileDraft.trusted_subdomain_patterns),
    internal_system_keywords: normalizeLines(enterpriseProfileDraft.internal_system_keywords),
    negative_aliases: normalizeLines(enterpriseProfileDraft.negative_aliases),
    short_alias_guard: normalizeLines(enterpriseProfileDraft.short_alias_guard),
  }
}

function syncEnterpriseProfileDraft(profile = {}) {
  enterpriseProfileDraft.official_names = toMultilineText(profile.official_names)
  enterpriseProfileDraft.brand_aliases = toMultilineText(profile.brand_aliases)
  enterpriseProfileDraft.english_aliases = toMultilineText(profile.english_aliases)
  enterpriseProfileDraft.root_domains = toMultilineText(profile.root_domains)
  enterpriseProfileDraft.trusted_subdomain_patterns = toMultilineText(profile.trusted_subdomain_patterns)
  enterpriseProfileDraft.internal_system_keywords = toMultilineText(profile.internal_system_keywords)
  enterpriseProfileDraft.negative_aliases = toMultilineText(profile.negative_aliases)
  enterpriseProfileDraft.short_alias_guard = toMultilineText(profile.short_alias_guard)
}

function clearEnterpriseProfile() {
  syncEnterpriseProfileDraft({})
}

function syncSessionDrafts(rows) {
  for (const item of rows || []) {
    sessionDrafts[item.platform] = item.account_label || ''
  }
}

function applyWatchlist(payload) {
  selectedWatchlistId.value = payload?.id ?? null
  watchlistForm.id = payload?.id ?? null
  watchlistForm.name = payload?.name || ''
  watchlistForm.organization_name = payload?.organization_name || ''
  watchlistForm.notes = payload?.notes || ''
  watchlistForm.enabled = payload?.enabled ?? true
  watchlistForm.platforms = Array.isArray(payload?.platforms) && payload.platforms.length ? [...payload.platforms] : ['github', 'gitlab', 'gitee']
  watchlistForm.file_extensions = Array.isArray(payload?.file_extensions) ? [...payload.file_extensions] : []
  watchlistForm.search_page_limit = 0
  watchlistForm.max_results_per_term = 0
  watchlistForm.detail_fetch = Boolean(payload?.detail_fetch ?? true)
  watchlistForm.enabled_rule_keys = Array.isArray(payload?.enabled_rule_keys) ? [...payload.enabled_rule_keys] : []
  watchlistForm.terms = Array.isArray(payload?.terms)
    ? payload.terms.map((item) => ({
        term: item?.term || '',
        term_type: item?.term_type || 'company_name',
        enabled: item?.enabled ?? true,
      }))
    : []
  syncEnterpriseProfileDraft(payload?.enterprise_profile || {})
}

function createWatchlist() {
  applyWatchlist({
    id: null,
    name: '',
    organization_name: '',
    notes: '',
    enabled: true,
    platforms: ['github', 'gitlab', 'gitee'],
    file_extensions: [...fileExtensionOptions],
    search_page_limit: 0,
    max_results_per_term: 0,
    detail_fetch: true,
    enabled_rule_keys: ['api_key', 'token', 'ak_sk', 'db_url', 'jwt_secret', 'redis_url', 'private_key', 'internal_url', 'password'],
    terms: [],
    enterprise_profile: {},
  })
}

function selectWatchlist(watchlistId) {
  const target = watchlists.value.find((item) => item.id === watchlistId)
  applyWatchlist(target || null)
}

function addTerm() {
  watchlistForm.terms.push({ term: '', term_type: 'company_name', enabled: true })
}

function removeTerm(index) {
  watchlistForm.terms.splice(index, 1)
}

async function downloadTermTemplate() {
  try {
    const XLSX = await loadXlsx()
    const rows = [
      ['Search terms', 'Type', 'Enabled'],
    ]
    const sheet = XLSX.utils.aoa_to_sheet(rows)
    sheet['!cols'] = [{ wch: 30 }, { wch: 16 }, { wch: 12 }]
    const exampleSheet = XLSX.utils.aoa_to_sheet([
      ['Search terms', 'Type', 'Enabled'],
      ['example.com', 'Domain', 'Yes'],
      ['Example Company', 'Company', 'Yes'],
      ['Example project', 'Project', 'No'],
    ])
    exampleSheet['!cols'] = [{ wch: 30 }, { wch: 16 }, { wch: 12 }]
    const instructionSheet = XLSX.utils.aoa_to_sheet([
      ['Field', 'Requirements'],
      ['Search terms', 'Required, one search term per line.'],
      ['Type', `Allowed values:${termTypeOptions.map((item) => item.label).join(', ')}; leave empty to import as a custom term.`],
      ['Enabled', 'Allowed values: yes/no, enabled/disabled, true/false, 1/0; leave empty to enable by default.'],
    ])
    instructionSheet['!cols'] = [{ wch: 18 }, { wch: 72 }]
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheet, 'Search terms')
    XLSX.utils.book_append_sheet(workbook, exampleSheet, 'Example')
    XLSX.utils.book_append_sheet(workbook, instructionSheet, 'Instructions')
    XLSX.writeFile(workbook, 'Code monitoring search term import template.xlsx')
  } catch (error) {
    ElMessage.error(error.message || 'Failed to download template')
  }
}

function triggerTermImport() {
  termImportInputRef.value?.click()
}

function parseTermImportRows(rows) {
  const imported = []
  const errors = []
  const importedKeys = new Set()
  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2
    const rawTerm = String(readImportCell(row, importColumnHeaders.term) || '').trim()
    if (!rawTerm) continue
    const termType = normalizeImportedTermType(readImportCell(row, importColumnHeaders.term_type))
    const enabled = normalizeImportedEnabled(readImportCell(row, importColumnHeaders.enabled))
    if (!termType) {
      errors.push(`Invalid type in row ${rowNumber}`)
      continue
    }
    if (enabled == null) {
      errors.push(`Invalid enabled state in row ${rowNumber}`)
      continue
    }
    const term = { term: rawTerm, term_type: termType, enabled }
    const key = termKey(term)
    if (importedKeys.has(key)) continue
    importedKeys.add(key)
    imported.push(term)
  }
  return { imported, errors }
}

function mergeImportedTerms(imported) {
  const existingKeys = new Set(watchlistForm.terms.filter((item) => String(item.term || '').trim()).map(termKey))
  let skipped = 0
  const nextTerms = []
  for (const item of imported) {
    const key = termKey(item)
    if (existingKeys.has(key)) {
      skipped += 1
      continue
    }
    existingKeys.add(key)
    nextTerms.push(item)
  }
  watchlistForm.terms.push(...nextTerms)
  return { added: nextTerms.length, skipped }
}

async function handleTermImportFile(event) {
  const input = event.target
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  importingTerms.value = true
  try {
    const XLSX = await loadXlsx()
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
    const sheetName = workbook.SheetNames.includes('Search terms') ? 'Search terms' : workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false })
    const { imported, errors } = parseTermImportRows(rows)
    if (errors.length) {
      ElMessage.error(`${errors.slice(0, 3).join('; ')}${errors.length > 3 ? ` and ${errors.length} errors in total` : ''}`)
      return
    }
    if (!imported.length) {
      ElMessage.warning('The template contains no importable search terms')
      return
    }
    const { added, skipped } = mergeImportedTerms(imported)
    if (!added) {
      ElMessage.warning(`No new search terms; skipped ${skipped} duplicates`)
      return
    }
    await saveWatchlist({
      successMessage: `Imported ${added} search terms ${skipped ? `, skipped ${skipped} duplicates` : ''}`,
    })
  } catch (error) {
    ElMessage.error(error.message || 'Failed to import search terms')
  } finally {
    importingTerms.value = false
  }
}

async function loadSessions() {
  loadingSessions.value = true
  try {
    platformSessions.value = await api.loadSessions()
    syncSessionDrafts(platformSessions.value)
  } catch (error) {
    ElMessage.error(error.message || 'Failed to load platform sessions')
  } finally {
    loadingSessions.value = false
  }
}

async function autoDetectSessions({ silent = false } = {}) {
  if (detectingSessions.value) return
  detectingSessions.value = true
  try {
    platformSessions.value = await api.autoDetectSessions()
    syncSessionDrafts(platformSessions.value)
    if (!silent) {
      ElMessage.success('Session status checked automatically')
    }
  } catch (error) {
    ElMessage.error(error.message || 'Failed to auto-detect sessions')
  } finally {
    detectingSessions.value = false
  }
}

async function refreshSessions() {
  await loadSessions()
  await autoDetectSessions({ silent: true })
}

async function loadWatchlists() {
  loadingWatchlists.value = true
  try {
    watchlists.value = await api.loadWatchlists()
    if (selectedWatchlistId.value) {
      const current = watchlists.value.find((item) => item.id === selectedWatchlistId.value)
      applyWatchlist(current || watchlists.value[0] || null)
      return
    }
    applyWatchlist(watchlists.value[0] || null)
  } catch (error) {
    ElMessage.error(error.message || 'Failed to load monitoring targets')
  } finally {
    loadingWatchlists.value = false
  }
}

async function saveWatchlist({ successMessage = 'Code monitoring configuration saved' } = {}) {
  if (!watchlistForm.name.trim()) {
    ElMessage.error('Enter the monitoring target name')
    return
  }
  if (!watchlistForm.organization_name.trim()) {
    ElMessage.error('Enter the organization')
    return
  }
  savingWatchlist.value = true
  try {
    const payload = await api.saveWatchlist({
      ...watchlistForm,
      terms: watchlistForm.terms.map((item) => ({
        term: item.term,
        term_type: item.term_type,
        enabled: item.enabled,
      })),
      enterprise_profile: readEnterpriseProfilePayload(),
    })
    applyWatchlist(payload)
    await loadWatchlists()
    ElMessage.success(successMessage)
  } catch (error) {
    ElMessage.error(error.message || 'Failed to save monitoring configuration')
  } finally {
    savingWatchlist.value = false
  }
}

async function deleteWatchlist() {
  if (!selectedWatchlistId.value) {
    ElMessage.error('Select a monitoring target first')
    return
  }
  const current = watchlists.value.find((item) => item.id === selectedWatchlistId.value)
  try {
    await ElMessageBox.confirm(
      `Delete monitoring target“${current?.name || 'After deleting the current target'}”, its company profile, search terms, hit results and scan history will be deleted as well, but WeCom or DingTalk bot configuration is not affected.`,
      'Confirm deletion',
      {
        type: 'warning',
        confirmButtonText: 'Delete',
        cancelButtonText: 'Cancel',
      },
    )
  } catch {
    return
  }
  savingWatchlist.value = true
  try {
    await api.deleteWatchlist(selectedWatchlistId.value)
    selectedWatchlistId.value = null
    createWatchlist()
    await loadWatchlists()
    ElMessage.success('Monitoring target deleted')
  } catch (error) {
    ElMessage.error(error.message || 'Failed to delete monitoring target')
  } finally {
    savingWatchlist.value = false
  }
}

async function launchLogin(platform) {
  if (loginStarting[platform]) return
  loginStarting[platform] = true
  try {
    const payload = await api.startRemoteLogin(platform)
    router.push({
      name: 'RemotePlatformLogin',
      query: {
        platform,
        session_id: payload.session_id,
      },
    })
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

async function removeSession(platform) {
  try {
    await api.deleteSession(platform)
    await loadSessions()
    ElMessage.success('Session deleted')
  } catch (error) {
    ElMessage.error(error.message || 'Failed to delete session')
  }
}

function updateViewportWidth() {
  viewportWidth.value = window.innerWidth
}

onMounted(async () => {
  updateViewportWidth()
  window.addEventListener('resize', updateViewportWidth)
  await Promise.all([loadGithubAppConfig(), loadSessions(), loadWatchlists()])
  await autoDetectSessions({ silent: true })
})

onUnmounted(() => {
  window.removeEventListener('resize', updateViewportWidth)
})
</script>

<style scoped lang="scss">
.content-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 22px;
}

.github-app-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
}

.github-app-status__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #94a3b8;
}

.github-app-status--valid {
  color: #166534;
}

.github-app-status--valid .github-app-status__dot {
  background: #22c55e;
  box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.16);
}

.github-app-status--invalid,
.github-app-status--missing {
  color: #b45309;
}

.github-app-status--invalid .github-app-status__dot,
.github-app-status--missing .github-app-status__dot {
  background: #f59e0b;
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.16);
}

.github-app-overview {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  margin-bottom: 18px;
  overflow: hidden;
  border: 1px solid var(--ti-border-default);
  border-radius: 8px;
  background: var(--ti-border-default);
}

.github-app-overview > div {
  min-width: 0;
  padding: 14px 16px;
  background: var(--ti-surface-default);
}

.github-app-overview span {
  display: block;
  margin-bottom: 6px;
  color: var(--ti-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.github-app-overview strong {
  display: block;
  overflow-wrap: anywhere;
}

.github-app-alert {
  margin-bottom: 18px;
}

.github-app-form__ids {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.github-app-private-key :deep(textarea) {
  font-family: Consolas, "Courier New", monospace;
  font-size: 13px;
}

.github-app-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.github-app-footer .panel-note {
  margin: 0;
}

.github-app-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 10px;
}

.ti-table-shell {
  margin-top: 18px;
}

.table-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.session-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: var(--ti-text-secondary);
}

.session-status__dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #cbd5e1;
  box-shadow: 0 0 0 3px rgba(203, 213, 225, 0.2);
  flex: 0 0 auto;
}

.session-status--valid {
  color: #166534;
}

.session-status--valid .session-status__dot {
  background: #22c55e;
  box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.18);
}

.session-status--invalid,
.session-status--missing,
.session-status--unavailable {
  color: #b91c1c;
}

.session-status--invalid .session-status__dot,
.session-status--missing .session-status__dot,
.session-status--unavailable .session-status__dot {
  background: #ef4444;
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.18);
}

.session-status--login_in_progress,
.session-status--configured {
  color: #92400e;
}

.session-status--login_in_progress .session-status__dot,
.session-status--configured .session-status__dot {
  background: #f59e0b;
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.18);
}

.watchlist-toolbar {
  display: grid;
  grid-template-columns: minmax(280px, 420px) auto;
  gap: 16px;
  margin-bottom: 18px;
}

.watchlist-toolbar__item,
.watchlist-option {
  display: grid;
  gap: 8px;
}

.watchlist-toolbar__item--switch {
  align-content: start;
}

.watchlist-form {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.watchlist-toolbar__item span,
.watchlist-option span {
  color: var(--ti-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.enterprise-profile,
.watchlist-terms {
  display: grid;
  gap: 12px;
  margin-top: 18px;
}

.enterprise-profile__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.enterprise-profile__hint {
  color: var(--ti-text-secondary);
  font-size: 12px;
}

.enterprise-profile__actions {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: space-between;
}

.panel-note {
  margin: 16px 0 0;
  color: var(--ti-text-secondary);
}

.watchlist-terms__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.watchlist-terms__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.term-import-input {
  display: none;
}

.watchlist-term-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 160px 96px 80px;
  gap: 10px;
  align-items: center;
}

@media (max-width: 1200px) {
  .github-app-overview,
  .github-app-form__ids {
    grid-template-columns: 1fr 1fr;
  }

  .watchlist-toolbar,
  .watchlist-form,
  .watchlist-term-row,
  .enterprise-profile__grid {
    grid-template-columns: 1fr;
  }

  .watchlist-terms__header {
    align-items: flex-start;
    flex-direction: column;
  }

  .watchlist-terms__actions {
    justify-content: flex-start;
  }
}

@media (max-width: 720px) {
  .github-app-overview,
  .github-app-form__ids {
    grid-template-columns: 1fr;
  }

  .github-app-footer {
    align-items: stretch;
    flex-direction: column;
  }

  .github-app-actions {
    justify-content: flex-end;
  }
}
</style>
