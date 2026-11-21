<template>
  <div class="collector-dashboard">
    <header class="collector-dashboard-head">
      <div>
        <h1>{{ historyMode ? 'Task History' : 'Collection Overview' }}</h1>
        <p v-if="historyMode">View execution results and failure reasons from actual task records</p>
        <p v-else>All sites {{ number(data?.scope?.total_sites) }} <span>·</span> Enabled {{ number(data?.scope?.enabled_sites) }}</p>
      </div>
      <div class="collector-dashboard-controls">
        <label><span class="sr-only">Statistics time range</span><select v-model.number="hours" class="select"><option :value="1">Last 1 hour</option><option :value="24">Last 24 hours</option><option :value="168">Last 7 days</option></select></label>
        <button class="btn btn-secondary" :disabled="loading" @click="refresh()">{{ loading ? 'Refreshing…' : 'Refresh' }}</button>
        <span class="collector-updated" aria-live="polite">{{ data?.updated_at ? 'Updated at ' + time(data.updated_at) : 'Waiting for first load' }}</span>
      </div>
    </header>
    <nav class="collector-page-links" aria-label="Collection pages">
      <RouterLink to="/collector-control/overview" :class="{ active: !historyMode }" :aria-current="!historyMode ? 'page' : undefined">Overview</RouterLink>
      <RouterLink to="/collector-control/sites">Site status</RouterLink>
      <RouterLink to="/collector-control/tasks" :class="{ active: historyMode }" :aria-current="historyMode ? 'page' : undefined">Task History</RouterLink>
    </nav>
    <div v-if="error" class="collector-load-error" role="alert">{{ error }}<span v-if="data">; keeping the last successfully loaded data.</span></div>

    <section v-if="!historyMode" class="collector-trend-panel" aria-label="Site-wide collection trend" :aria-busy="loading">
      <div class="collector-summary">
        <div><span>Newly visible intelligence</span><strong class="collector-green">{{ number(data?.summary?.visible_new) }}</strong><small v-if="data?.coverage?.visible_complete === false" class="collector-incomplete">Records for the selected period are incomplete</small></div>
        <div><span>Pending new posts</span><strong>{{ number(data?.summary?.pending_recent) }}</strong></div>
        <div><span>Execution slots</span><strong>{{ number(data?.summary?.running_jobs) }} <small>/</small> {{ number(data?.summary?.available_slots) }}</strong></div>
        <button type="button" class="collector-attention-metric" @click="showAttention"><span>Sites needing attention</span><strong>{{ number(data?.summary?.attention_sites) }}</strong></button>
      </div>
      <div class="collector-trend-heading">
        <div class="collector-chart-tabs" role="tablist" aria-label="Trend metrics">
          <button v-for="item in chartTabs" :id="'collector-tab-' + item.key" :key="item.key" type="button" role="tab" :aria-selected="chartMode === item.key" aria-controls="collector-trend-chart" :class="{ active: chartMode === item.key }" @click="chartMode = item.key">{{ item.label }}</button>
        </div>
        <span class="collector-chart-help">Click the legend to view one series</span>
      </div>
      <div class="collector-chart-container">
        <div id="collector-trend-chart" ref="chartElement" class="collector-chart" role="tabpanel" :aria-labelledby="'collector-tab-' + chartMode" :aria-label="chartDescription"></div>
        <div v-if="!hasChartData" class="collector-chart-empty" role="status">{{ loading && !data ? 'Loading collection trend…' : chartMode === 'backlog' ? 'No backlog snapshots yet' : 'No statistics for the selected period' }}</div>
      </div>
      <p class="collector-chart-caption">{{ chartCaption }}<span v-if="coverageNote" class="collector-coverage-note">{{ coverageNote }}</span></p>
    </section>

    <section class="collector-record-panel" :aria-label="historyMode ? 'Task records' : 'Site summary'">
      <header class="collector-record-toolbar">
        <h2>{{ historyMode ? 'Task records' : 'Site summary' }}</h2>
        <div class="collector-record-filters">
          <label class="collector-search"><span class="sr-only">{{ historyMode ? 'Search task ID, site or target' : 'Search sites' }}</span><input v-model="searchInput" class="input" type="search" :placeholder="historyMode ? 'Search task ID, site or target' : 'Search sites'"></label>
          <template v-if="historyMode">
            <label><span class="sr-only">Filter tasks by site</span><select v-model="site" class="select"><option value="">All sites</option><option v-for="item in siteOptions" :key="item.site_name" :value="item.site_name">{{ item.display_name || item.site_name }}</option></select></label>
            <label><span class="sr-only">Filter by task status</span><select v-model="taskState" class="select"><option value="">All statuses</option><option v-for="(label, value) in taskStates" :key="value" :value="value">{{ label }}</option></select></label>
          </template>
          <template v-else>
            <label><span class="sr-only">Filter by site status</span><select v-model="state" class="select"><option value="all">All statuses</option><option value="running">Running</option><option value="waiting">Waiting</option><option value="attention">Needs attention</option><option value="disabled">Disabled</option></select></label>
            <label class="collector-attention-toggle"><input v-model="attentionFirst" type="checkbox"><span>Errors first</span></label>
          </template>
        </div>
      </header>
      <div class="collector-table-scroll" :aria-busy="loading">
        <table v-if="!historyMode" class="collector-data-table">
          <thead><tr><th scope="col">Site</th><th scope="col">Current status</th><th scope="col">{{ rangeLabel }} New intelligence</th><th scope="col">Pending new posts</th><th scope="col">Last success</th><th scope="col"><span class="sr-only">Site details</span></th></tr></thead>
          <tbody>
            <template v-for="item in rows" :key="item.site_name">
              <tr :class="{ 'collector-selected-row': expanded === item.site_name }">
                <th scope="row">{{ item.display_name || item.site_name }}</th>
                <td><span class="collector-status" :class="tone(item.state)">{{ item.state || 'Status unknown' }}</span></td>
                <td class="collector-num">{{ number(item.new_visible) }}</td><td class="collector-num">{{ number(item.pending_recent) }}</td>
                <td class="collector-date">{{ time(item.last_success_at, true) }}</td>
                <td class="collector-row-action"><button type="button" :aria-expanded="expanded === item.site_name" :aria-label="(expanded === item.site_name ? 'Collapse' : 'Expand') + (item.display_name || item.site_name) + 'Details'" @click="toggleDetails(item.site_name)">{{ expanded === item.site_name ? '⌄' : '›' }}</button></td>
              </tr>
              <tr v-if="expanded === item.site_name" class="collector-detail-row"><td colspan="6">
                <div class="collector-site-detail">
                  <dl><div><dt>Enabled state</dt><dd>{{ item.enabled ? 'Enabled' : 'Disabled' }}</dd></div><div><dt>Historical backfill pending</dt><dd>{{ number(item.pending_backfill) }}</dd></div><div><dt>Next list schedule</dt><dd>{{ time(item.next_run_at, true) }}</dd></div><div v-if="item.detail_retry_at"><dt>Detail retry time</dt><dd>{{ time(item.detail_retry_at, true) }}</dd></div></dl>
                  <p v-if="item.last_error" class="collector-error-text">{{ item.last_error }}</p>
                  <div class="collector-detail-links"><RouterLink :to="{ path: '/collector-control/tasks', query: { site: item.site_name } }">View this site’s task history</RouterLink><RouterLink to="/collector-control/sites">Open site management</RouterLink></div>
                </div>
              </td></tr>
            </template>
            <tr v-if="!rows.length"><td colspan="6" class="collector-empty-row">{{ loading && !data ? 'Loading sites…' : 'No matching sites' }}</td></tr>
          </tbody>
        </table>
        <table v-else class="collector-data-table collector-task-table">
          <thead><tr><th scope="col">Time</th><th scope="col">Site</th><th scope="col">Task type</th><th scope="col">Status</th><th scope="col">Duration</th><th scope="col">Result</th><th scope="col"><span class="sr-only">Task details</span></th></tr></thead>
          <tbody>
            <template v-for="item in rows" :key="item.job_id">
              <tr :class="{ 'collector-selected-row': expanded === item.job_id }">
                <td class="collector-date">{{ time(item.finished_at || item.started_at || item.enqueued_at, true) }}</td>
                <th scope="row">{{ item.display_name || item.site_name }}</th><td>{{ taskType(item.job_type) }}</td>
                <td><span class="collector-status" :class="tone(item.status)">{{ taskStates[item.status] || item.status || 'Unknown' }}</span></td>
                <td class="collector-num">{{ duration(item.duration_ms) }}</td><td class="collector-result"><span :title="resultText(item)">{{ resultText(item) }}</span></td>
                <td class="collector-row-action"><button type="button" :aria-expanded="expanded === item.job_id" :aria-label="(expanded === item.job_id ? 'Collapse' : 'Expand') + 'Task details'" @click="toggleDetails(item.job_id)">{{ expanded === item.job_id ? '⌄' : '›' }}</button></td>
              </tr>
              <tr v-if="expanded === item.job_id" class="collector-detail-row"><td colspan="7">
                <div class="collector-task-detail">
                  <dl><div><dt>Task ID</dt><dd>{{ item.job_id }}</dd></div><div><dt>Queued at</dt><dd>{{ time(item.enqueued_at, true) }}</dd></div><div><dt>Start time</dt><dd>{{ time(item.started_at, true) }}</dd></div><div><dt>Ended at</dt><dd>{{ time(item.finished_at, true) }}</dd></div></dl>
                  <p v-if="item.error_message" class="collector-error-text">{{ item.error_message }}</p>
                  <p v-if="item.target" class="collector-target"><span>Target:</span><a v-if="safeTarget(item.target)" :href="safeTarget(item.target)" target="_blank" rel="noopener noreferrer">{{ item.target }}</a><span v-else>{{ item.target }}</span></p>
                </div>
              </td></tr>
            </template>
            <tr v-if="!rows.length"><td colspan="7" class="collector-empty-row">{{ loading && !data ? 'Loading tasks…' : 'No matching tasks in the selected period' }}</td></tr>
          </tbody>
        </table>
      </div>
      <footer class="collector-pagination">
        <span>{{ total ? 'Showing ' + firstRow + '–' + lastRow + '  of ' + number(total) + (historyMode ? '  tasks' : '  sites') : historyMode ? '0  tasks' : '0  sites' }}</span>
        <div class="collector-pagination-controls">
          <button type="button" class="btn btn-secondary" :disabled="loading || page <= 1" aria-label="Previous page" @click="page--">‹</button>
          <label class="collector-page-number"><span class="sr-only">Page</span><input :value="page" type="number" min="1" :max="pageCount" @change="jumpPage"></label><span>/ {{ pageCount }} pages</span>
          <button type="button" class="btn btn-secondary" :disabled="loading || page >= pageCount" aria-label="Next page" @click="page++">›</button>
          <label><span class="sr-only">Items per page</span><select v-model.number="pageSize" class="select"><option :value="10">10 / page</option><option :value="20">20 / page</option><option :value="50">50 / page</option></select></label>
        </div>
      </footer>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import * as echarts from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import { AriaComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([BarChart, LineChart, AriaComponent, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])
const route = useRoute()
const historyMode = computed(() => route.name === 'CollectorTasks')
const data = ref(null)
const loading = ref(false)
const error = ref('')
const hours = ref(24)
const page = ref(1)
const pageSize = ref(10)
const searchInput = ref('')
const query = ref('')
const state = ref('all')
const attentionFirst = ref(false)
const site = ref(typeof route.query.site === 'string' ? route.query.site : '')
const taskState = ref('')
const expanded = ref('')
const chartMode = ref('production')
const chartElement = ref(null)
const chartTabs = [{ key: 'production', label: 'Output trend' }, { key: 'throughput', label: 'Task throughput' }, { key: 'backlog', label: 'Backlog change' }]
const taskStates = { running: 'Running', enqueued: 'Waiting to run', succeeded: 'Succeeded', partial: 'Partially completed', failed: 'Failed', skipped: 'Skipped', stale: 'Pending recovery' }
const colors = { blue: '#1681f9', green: '#06a366', orange: '#e49620', red: '#f26d72' }
let chart = null
let resizeObserver = null
let requestController = null
let requestVersion = 0
let pollTimer = null
let searchTimer = null
let mounted = false
let previousBodyClass = ''
const legendSelections = {}
const rows = computed(() => historyMode.value ? data.value?.items || [] : data.value?.sites?.items || [])
const total = computed(() => Number(historyMode.value ? data.value?.total || 0 : data.value?.sites?.total || 0))
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const firstRow = computed(() => (page.value - 1) * pageSize.value + 1)
const lastRow = computed(() => Math.min(total.value, firstRow.value + rows.value.length - 1))
const rangeLabel = computed(() => ({ 1: '1h', 24: '24h', 168: '7 days' }[hours.value]))
const siteOptions = computed(() => {
  const options = Array.isArray(data.value?.sites) ? [...data.value.sites] : []
  if (site.value && !options.some((item) => item.site_name === site.value)) options.unshift({ site_name: site.value, display_name: site.value })
  return options
})
const seriesRows = computed(() => Array.isArray(data.value?.series) ? data.value.series : [])
const chartMetrics = computed(() => chartMode.value === 'production'
  ? [{ key: 'raw_new', name: 'New body text', color: colors.blue }, { key: 'visible_new', name: 'Newly visible intelligence', color: colors.green }]
  : chartMode.value === 'throughput'
    ? [{ key: 'success', name: 'Succeeded', color: colors.blue }, { key: 'failed', name: 'Failed', color: colors.red }, { key: 'partial', name: 'Partially completed', color: colors.orange }]
    : [{ key: 'pending_recent', name: 'New posts', color: colors.blue }, { key: 'pending_backfill', name: 'Historical backfill', color: colors.orange }])
const finite = (value) => typeof value === 'number' && Number.isFinite(value)
const hasChartData = computed(() => chartMetrics.value.some((metric) => seriesRows.value.some((item) => finite(item[metric.key]))))
const intervalLabel = computed(() => {
  const seconds = Number(data.value?.interval_seconds || 3600)
  return seconds < 3600 ? Math.round(seconds / 60) + ' minutes' : (seconds / 3600 === 1 ? '' : seconds / 3600) + ' hours'
})
const chartDescription = computed(() => (chartTabs.find((item) => item.key === chartMode.value)?.label || '') + ', ' + (chartMode.value === 'backlog' ? 'Pending items by sampling time' : 'Every' + intervalLabel.value + ' statistics'))
const chartCaption = computed(() => ({
  production: 'Every' + intervalLabel.value + 'counts new body text and first-visible intelligence; updates to existing content are not counted as new again.',
  throughput: 'Every' + intervalLabel.value + 'completed tasks; retries, waits and skips are kept separately and not counted as successes.',
  backlog: 'Shows the last sample in each period; a rise means the backlog is growing and a fall means it is being worked off, and unsampled periods are left blank.',
}[chartMode.value]))
const coverageNote = computed(() => {
  if (!data.value || chartMode.value === 'throughput') return ''
  const coverage = data.value.coverage || {}
  if (chartMode.value === 'backlog') return coverage.backlog_since ? 'Backlog snapshots recorded since ' + time(coverage.backlog_since, true) + ' .' : 'Backlog snapshots have not started recording yet.'
  const incomplete = []
  if (coverage.raw_complete === false) incomplete.push(coverage.raw_since ? 'Body text recorded since ' + time(coverage.raw_since, true) + ' ' : 'No historical statistics for body text yet')
  if (coverage.visible_complete === false || !coverage.visible_since) incomplete.push(coverage.visible_since ? 'Visible intelligence recorded since ' + time(coverage.visible_since, true) + ' ' : 'No historical statistics for visible intelligence yet')
  return incomplete.length ? incomplete.join('; ') + '; history for the selected period is incomplete.' : 'Visible intelligence statistics start from ' + time(coverage.visible_since, true) + ' .'
})
const requestUrl = computed(() => {
  const params = new URLSearchParams({ hours: String(hours.value), page: String(page.value), page_size: String(pageSize.value), q: query.value })
  if (historyMode.value) { params.set('site', site.value); params.set('status', taskState.value) }
  else { params.set('state', state.value); params.set('attention_first', String(attentionFirst.value)) }
  return '/api/collector/' + (historyMode.value ? 'tasks' : 'overview') + '?' + params
})

function number(value) { return finite(value) ? value.toLocaleString('en-US') : '—' }
function time(value, withDate = false) {
  if (!value) return '—'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', ...(withDate ? { month: '2-digit', day: '2-digit' } : {}), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date)
}
function tone(value) {
  if (['running', 'Running', 'Running'].includes(value)) return 'is-running'
  if (['succeeded', 'Succeeded', 'Normal'].includes(value)) return 'is-success'
  if (['failed', 'Error', 'Failed', 'Parse error', 'Page recognition error', 'Source shut down', 'Session expired'].includes(value)) return 'is-error'
  if (['partial', 'stale', 'Waiting for resources', 'Verification required', 'Backing off', 'Entry migrated', 'Login pending', 'Circuit open', 'Recovering', 'Pending recovery', 'Evidence pending'].includes(value)) return 'is-warning'
  return 'is-neutral'
}
function duration(value) { return !finite(value) ? '—' : value < 1000 ? '<1 s' : value < 60000 ? Math.round(value / 1000) + 's' : (value / 60000).toFixed(1) + ' minutes' }
function taskType(value) { return { seed: 'List check', detail: 'Body collection', ransomware_sync: 'External intelligence sync' }[value] || value || 'Collection tasks' }
function resultText(item) {
  if (item.error_message) return item.error_message
  const result = item.result || {}
  const parts = []
  if (result.new_count) parts.push('New body text ' + result.new_count)
  if (result.updated_count) parts.push('Body updated ' + result.updated_count)
  if (result.unchanged_count) parts.push('Body unchanged ' + result.unchanged_count)
  return parts.join(' · ') || (item.status === 'succeeded' ? taskType(item.job_type) + 'Done' : taskStates[item.status] || '—')
}
function safeTarget(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : '' } catch { return '' }
}
function toggleDetails(id) { expanded.value = expanded.value === id ? '' : id }
function jumpPage(event) {
  const target = Number(event.target.value)
  page.value = Math.min(pageCount.value, Math.max(1, Number.isFinite(target) ? Math.floor(target) : 1))
  event.target.value = page.value
}
function showAttention() { state.value = 'attention'; page.value = 1 }

async function refresh(replace = true) {
  if (!mounted || document.visibilityState === 'hidden' || (loading.value && !replace)) return
  requestController?.abort()
  const controller = new AbortController()
  requestController = controller
  const version = ++requestVersion
  loading.value = true
  error.value = ''
  let timedOut = false
  const timeout = window.setTimeout(() => { timedOut = true; controller.abort() }, 20000)
  try {
    // main.js installs the shared authenticated fetch and expired-session handler.
    const response = await window.fetch(requestUrl.value, { signal: controller.signal })
    if (!response.ok) throw new Error(response.status === 401 ? 'Login expired; please log in again' : response.status === 403 ? 'No permission to view collection data' : 'Failed to load collection data (' + response.status + ')')
    const payload = await response.json()
    if (version !== requestVersion || !mounted) return
    data.value = payload
    const responsePage = Number(historyMode.value ? payload.page : payload.sites?.page)
    if (responsePage && responsePage !== page.value) page.value = responsePage
  } catch (requestError) {
    if (version !== requestVersion || !mounted) return
    if (timedOut) error.value = 'Collection data load timed out; refresh later'
    else if (!controller.signal.aborted) error.value = requestError.message || 'Failed to load collection data'
  } finally {
    window.clearTimeout(timeout)
    if (version === requestVersion) { loading.value = false; requestController = null }
  }
}
function renderChart() {
  if (!chart || historyMode.value) return
  const stacked = chartMode.value === 'throughput'
  chart.setOption({
    animation: false, aria: { enabled: true, description: chartDescription.value },
    textStyle: { fontFamily: 'inherit', color: '#64748b' },
    grid: { top: 60, left: 60, right: 25, bottom: 35 },
    legend: { top: 10, right: 18, itemWidth: 15, itemHeight: 8, textStyle: { color: '#52647d', fontSize: 12 }, selected: legendSelections[chartMode.value] || {} },
    tooltip: {
      trigger: 'axis', renderMode: 'richText', confine: true,
      formatter: (items) => {
        const entries = Array.isArray(items) ? items : [items]
        const point = seriesRows.value[entries[0]?.dataIndex]
        const lines = [time(point?.at, true)]
        if (chartMode.value === 'backlog' && point?.backlog_at) lines.push('Sampled at ' + time(point.backlog_at, true))
        return [...lines, ...entries.map((item) => item.seriesName + ':' + number(item.value))].join('\n')
      },
    },
    xAxis: { type: 'category', data: seriesRows.value.map((item) => time(item.at, hours.value === 168)), boundaryGap: stacked, axisLine: { lineStyle: { color: '#cedae8' } }, axisTick: { show: false }, axisLabel: { hideOverlap: true, color: '#52647d', fontSize: 11 } },
    yAxis: { type: 'value', min: 0, minInterval: 1, name: chartMode.value === 'backlog' ? 'Pending items' : (stacked ? 'Task' : 'records') + ' / ' + intervalLabel.value, nameTextStyle: { align: 'left', padding: [0, 0, 0, -42], color: '#63748b' }, axisLabel: { color: '#63748b', fontSize: 11 }, splitLine: { lineStyle: { color: '#e8eff6' } } },
    series: chartMetrics.value.map((metric) => ({
      name: metric.name, type: stacked ? 'bar' : 'line', stack: stacked ? 'completed' : undefined, barMaxWidth: 24,
      data: seriesRows.value.map((item) => finite(item[metric.key]) ? item[metric.key] : null),
      connectNulls: false, showSymbol: seriesRows.value.length <= 48, symbolSize: 5, lineStyle: { width: 2 },
      itemStyle: { color: metric.color }, emphasis: { focus: 'series' },
    })),
  }, { notMerge: true })
}
function visibilityChanged() {
  if (document.visibilityState === 'hidden') { ++requestVersion; requestController?.abort(); requestController = null; loading.value = false }
  else refresh()
}
watch(searchInput, (value) => {
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => { query.value = value.trim() }, 300)
})
watch(() => route.query.site, (value) => { site.value = typeof value === 'string' ? value : '' })
watch([hours, pageSize, query, state, attentionFirst, site, taskState], () => { page.value = 1 }, { flush: 'sync' })
watch(requestUrl, () => { expanded.value = ''; refresh() }, { flush: 'post' })
watch([chartMode, seriesRows], () => nextTick(renderChart), { flush: 'post' })
onMounted(async () => {
  mounted = true
  previousBodyClass = document.body.className
  document.body.className = 'page-collector-dashboard'
  document.title = (historyMode.value ? 'Task History' : 'Collection Overview') + ' · Abyssal'
  if (chartElement.value) {
    chart = echarts.init(chartElement.value)
    chart.on('legendselectchanged', (event) => { legendSelections[chartMode.value] = event.selected })
    resizeObserver = new ResizeObserver(() => chart?.resize())
    resizeObserver.observe(chartElement.value)
    renderChart()
  }
  document.addEventListener('visibilitychange', visibilityChanged)
  pollTimer = window.setInterval(() => refresh(false), 30000)
  await refresh()
})
onBeforeUnmount(() => {
  mounted = false
  if (document.body.className === 'page-collector-dashboard') document.body.className = previousBodyClass
  ++requestVersion
  requestController?.abort()
  window.clearInterval(pollTimer)
  window.clearTimeout(searchTimer)
  document.removeEventListener('visibilitychange', visibilityChanged)
  resizeObserver?.disconnect()
  chart?.dispose()
  chart = null
})
</script>

<style scoped>
.collector-dashboard { color: #142235; min-width: 0; }
.collector-dashboard-head { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-bottom: 6px; }
.collector-dashboard-head h1 { margin: 0; font-size: clamp(25px, 2.1vw, 34px); line-height: 1.3; letter-spacing: -.6px; }
.collector-dashboard-head p { margin: 4px 0 0; color: #53667f; font-size: 13px; }
.collector-dashboard-head p span { padding: 0 5px; }
.collector-dashboard-controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
.collector-dashboard-controls .select { min-width: 112px; }
.collector-updated { color: #738198; font-size: 12px; white-space: nowrap; }
.collector-page-links { display: flex; gap: 25px; border-bottom: 1px solid #d8e3ef; margin-bottom: 10px; }
.collector-page-links a { padding: 7px 1px 8px; color: #50627c; text-decoration: none; border-bottom: 2px solid transparent; font-size: 14px; }
.collector-page-links a.active { color: #087bff; border-color: #087bff; font-weight: 700; }
.collector-trend-panel, .collector-record-panel { background: #fff; border: 1px solid #d9e5f1; border-radius: 6px; overflow: hidden; }
.collector-trend-panel { margin-bottom: 12px; }
.collector-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border-bottom: 1px solid #e4ecf4; padding: 12px 0 16px; }
.collector-summary > div, .collector-summary > button { position: relative; display: flex; flex-direction: column; align-items: center; gap: 5px; min-width: 0; border: 0; border-left: 1px solid #dce6f0; padding: 0 15px; background: transparent; color: inherit; font: inherit; }
.collector-summary > :first-child { border-left: 0; }
.collector-summary span { font-size: 13px; font-weight: 600; }
.collector-summary strong { font-size: 31px; line-height: 1.15; font-variant-numeric: tabular-nums; letter-spacing: -.4px; }
.collector-summary strong small { font-size: .75em; padding: 0 7px; font-weight: 400; }
.collector-summary .collector-green { color: #06a366; }
.collector-summary .collector-incomplete { position: absolute; bottom: -13px; color: #987130; font-size: 10px; }
.collector-summary .collector-attention-metric { cursor: pointer; }
.collector-attention-metric strong { color: #df8d06; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 5px; }
.collector-trend-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 18px; }
.collector-chart-tabs { display: flex; gap: 23px; }
.collector-chart-tabs button { border: 0; border-bottom: 2px solid transparent; background: transparent; padding: 10px 0 8px; color: #5b6d86; font: inherit; font-size: 13px; cursor: pointer; }
.collector-chart-tabs button.active { border-color: #087bff; color: #087bff; font-weight: 700; }
.collector-chart-help { color: #8896a9; font-size: 11px; }
.collector-chart-container { position: relative; }
.collector-chart { height: 220px; width: 100%; }
.collector-chart-empty { position: absolute; top: 54px; left: 60px; right: 25px; bottom: 35px; display: flex; align-items: center; justify-content: center; color: #8492a6; font-size: 13px; pointer-events: none; background: #ffffffb8; }
.collector-chart-caption { margin: 0; padding: 0 19px 8px; font-size: 11px; line-height: 1.6; color: #718198; }
.collector-coverage-note { margin-left: 12px; color: #8a6d32; }
.collector-record-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 18px; padding: 8px 18px; }
.collector-record-toolbar h2 { margin: 0; font-size: 16px; line-height: 1.4; white-space: nowrap; }
.collector-record-filters { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 10px; }
.collector-search { width: clamp(180px, 18vw, 290px); }
.collector-search input { width: 100%; }
.collector-record-filters .select { min-width: 130px; max-width: 220px; }
.collector-attention-toggle { display: inline-flex; align-items: center; gap: 6px; color: #52657e; font-size: 12px; white-space: nowrap; cursor: pointer; }
.collector-attention-toggle input { accent-color: #1681f9; }
.collector-table-scroll { position: relative; overflow-x: auto; padding: 0 16px; }
.collector-data-table { border-collapse: collapse; width: 100%; min-width: 690px; font-size: 12px; line-height: 1.5; text-align: left; }
.collector-data-table thead { background: #edf4fb; color: #354d6f; }
.collector-data-table th, .collector-data-table td { border-bottom: 1px solid #e5edf5; padding: 5px 13px; text-align: left; vertical-align: middle; }
.collector-data-table thead th { font-weight: 600; padding-top: 7px; padding-bottom: 7px; }
.collector-data-table tbody th { font-weight: 500; }
.collector-data-table tbody > tr:hover:not(.collector-detail-row) { background: #f8fbfe; }
.collector-date, .collector-num { font-variant-numeric: tabular-nums; white-space: nowrap; }
.collector-status { display: inline-block; border-radius: 4px; padding: 2px 8px; font-size: 11px; line-height: 1.5; white-space: nowrap; }
.collector-status.is-running { background: #e4f1ff; color: #087bf3; }
.collector-status.is-success { background: #e4f8ee; color: #078f5d; }
.collector-status.is-warning { background: #fff2d8; color: #a66803; }
.collector-status.is-error { background: #ffebed; color: #d83a4d; }
.collector-status.is-neutral { background: #edf1f6; color: #5b6d86; }
.collector-row-action { width: 40px; text-align: center !important; }
.collector-row-action button { width: 30px; height: 22px; border: 0; background: transparent; font-size: 20px; line-height: 1; color: #4d6e98; cursor: pointer; }
.collector-selected-row { background: #f0f7ff !important; }
.collector-detail-row > td { background: #f7fafe; padding: 15px 17px; }
.collector-site-detail dl, .collector-task-detail dl { display: flex; flex-wrap: wrap; gap: 12px 28px; margin: 0; }
.collector-site-detail dl > div, .collector-task-detail dl > div { min-width: 120px; }
.collector-task-detail dl > div:first-child { flex-basis: 100%; }
.collector-detail-row dt { color: #6d809b; margin-bottom: 4px; font-size: 11px; }
.collector-detail-row dd { margin: 0; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.collector-detail-links { display: flex; flex-wrap: wrap; gap: 20px; margin-top: 12px; }
.collector-detail-links a, .collector-target a { color: #087bf3; }
.collector-error-text { margin: 11px 0 0; color: #b74d42; overflow-wrap: anywhere; white-space: pre-wrap; }
.collector-result { max-width: 360px; }
.collector-result > span { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; max-width: 32vw; }
.collector-target { margin: 12px 0 0; color: #6d809b; overflow-wrap: anywhere; }
.collector-pagination { display: flex; justify-content: space-between; align-items: center; gap: 14px; padding: 6px 18px; color: #647995; font-size: 12px; }
.collector-pagination-controls { display: flex; align-items: center; gap: 9px; }
.collector-pagination-controls .btn { min-width: 30px; height: 30px; min-height: 30px; padding: 3px 8px; font-size: 20px; }
.collector-pagination-controls .select { height: 32px; min-height: 32px; padding-top: 4px; padding-bottom: 4px; font-size: 12px; }
.collector-pagination-controls > label { display: flex; align-items: center; }
.collector-page-number input { width: 48px; height: 31px; border: 1px solid #cbdbea; border-radius: 4px; text-align: center; color: #086cdf; font: inherit; }
.collector-empty-row { height: 180px; text-align: center !important; color: #8290a2; }
.collector-load-error { margin: 0 0 14px; padding: 10px 13px; background: #fff1f0; border: 1px solid #f3c8c1; border-radius: 4px; color: #b34b40; font-size: 13px; }
@media (max-width: 850px) {
  .collector-dashboard-head { align-items: flex-start; }
  .collector-dashboard-controls { gap: 7px; }
  .collector-updated { flex-basis: 100%; text-align: right; }
  .collector-record-toolbar { align-items: flex-start; flex-direction: column; gap: 10px; }
  .collector-record-filters { width: 100%; justify-content: flex-start; }
  .collector-search { flex: 1; min-width: 180px; }
  .collector-summary strong { font-size: 26px; }
  .collector-summary span { font-size: 11px; }
  .collector-chart-help { display: none; }
  .collector-data-table th, .collector-data-table td { padding-top: 8px; padding-bottom: 8px; }
  .collector-row-action button { height: 25px; }
  .collector-coverage-note { display: block; margin-left: 0; margin-top: 4px; }
}
@media (max-width: 520px) {
  .collector-dashboard-head { flex-direction: column; gap: 12px; }
  .collector-dashboard-controls { justify-content: flex-start; width: 100%; }
  .collector-updated { flex-basis: auto; text-align: left; font-size: 11px; }
  .collector-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px 0; padding: 17px 0; }
  .collector-summary > :nth-child(3) { border-left: 0; }
  .collector-summary strong { font-size: 27px; }
  .collector-chart-tabs { gap: 18px; }
  .collector-chart { height: 245px; }
  .collector-pagination { align-items: flex-start; flex-direction: column; }
  .collector-record-filters .select { min-width: 125px; max-width: 100%; }
  .collector-page-links { gap: 25px; }
}
</style>
