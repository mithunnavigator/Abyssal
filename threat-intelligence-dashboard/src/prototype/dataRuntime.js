import countryCentroidsJson from 'world-countries-centroids/dist/countries.geojson?raw'
import { createRemoteBrowserStream } from '@/utils/remoteBrowserStream'
import { shouldRenderResourceAsHtml, shouldRenderResourceAsImage } from '@/prototype/resourceRendering'

const COUNTRY_COORDINATES = JSON.parse(countryCentroidsJson).features.reduce((coordinates, feature) => {
  const code = feature.properties.ISO
  if (code && !coordinates[code]) coordinates[code] = feature.geometry.coordinates
  return coordinates
}, {})

const INCIDENT_FILES = new Set([
  'event-detail.html',
  'ransomware-detail.html',
  'data-leak-detail.html',
  'vulnerability-detail.html',
])

const REVIEW_FILES = new Set(['netdisk-detail.html', 'library-detail.html', 'code-detail.html'])

const DATA_FILES = new Set([
  'dashboard.html',
  'intelligence.html',
  'ransomware.html',
  'data-leak.html',
  'vulnerabilities.html',
  'monitoring.html',
  'collector-run-detail.html',
  ...INCIDENT_FILES,
  ...REVIEW_FILES,
])

function query(root, selector) {
  return root?.querySelector(selector) || null
}

function queryAll(root, selector) {
  return root ? [...root.querySelectorAll(selector)] : []
}

function showToast(message) {
  let toast = document.querySelector('.toast')
  if (!toast) return
  toast.textContent = message
  toast.classList.add('show')
  window.clearTimeout(showToast.timer)
  showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 2600)
}

const JSON_CACHE_TTL_MS = 15_000
const INTELLIGENCE_PAGE_SIZE = 20
const PAGE_EVENT_LIMIT = 500
const CACHEABLE_JSON_PATHS = new Set([
  '/api/intelligence',
  '/api/intelligence/dashboard',
  '/api/intelligence/ransomware',
  '/api/intelligence/data-leak',
  '/api/events/search',
])
const jsonResponseCache = new Map()
const inFlightJsonRequests = new Map()
const searchResponseCache = new Map()
let searchCacheAccount = ''

async function requestSearch(url, { refresh = false, signal } = {}) {
  const account = localStorage.getItem('dwti-current-user') || ''
  if (account !== searchCacheAccount) {
    searchResponseCache.clear()
    searchCacheAccount = account
  }
  const cached = searchResponseCache.get(url)
  if (!refresh && cached && Date.now() - cached.storedAt < JSON_CACHE_TTL_MS) return cached.payload
  const payload = await requestJsonUncached(url, { signal })
  if (account === (localStorage.getItem('dwti-current-user') || '')) {
    searchResponseCache.delete(url)
    searchResponseCache.set(url, { payload, storedAt: Date.now() })
    while (searchResponseCache.size > 24) searchResponseCache.delete(searchResponseCache.keys().next().value)
  }
  return payload
}

async function requestJson(url, options = {}) {
  const { preferCached = false, ...fetchOptions } = options
  const method = String(fetchOptions.method || 'GET').toUpperCase()
  const pathname = new URL(url, window.location.origin).pathname
  const cacheable = method === 'GET' && CACHEABLE_JSON_PATHS.has(pathname)
  if (cacheable) {
    const cached = jsonResponseCache.get(url)
    const fresh = cached && Date.now() - cached.storedAt < JSON_CACHE_TTL_MS
    if (cached && (fresh || preferCached)) {
      if (!fresh && !inFlightJsonRequests.has(url)) {
        const refresh = requestJsonUncached(url, fetchOptions)
          .then((payload) => {
            jsonResponseCache.set(url, { storedAt: Date.now(), payload })
            return payload
          })
          .catch(() => cached.payload)
          .finally(() => inFlightJsonRequests.delete(url))
        inFlightJsonRequests.set(url, refresh)
      }
      return cached.payload
    }
    const inFlight = inFlightJsonRequests.get(url)
    if (inFlight) return inFlight
  }

  const request = requestJsonUncached(url, fetchOptions)
  if (!cacheable) return request
  inFlightJsonRequests.set(url, request)
  try {
    const payload = await request
    jsonResponseCache.set(url, { storedAt: Date.now(), payload })
    return payload
  } finally {
    inFlightJsonRequests.delete(url)
  }
}

async function requestJsonUncached(url, options = {}) {
  const headers = new Headers(options.headers || {})
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(url, { ...options, headers })
  if (!response.ok) {
    let detail = ''
    try {
      const payload = await response.json()
      detail = payload?.detail || payload?.message || ''
    } catch {
      detail = await response.text().catch(() => '')
    }
    throw new Error(detail || `Request failed (${response.status})`)
  }
  if (response.status === 204) return null
  return response.json()
}

function number(value) {
  return Number(value || 0).toLocaleString('en-US')
}

function parseTimestamp(value) {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NaN
  const text = String(value || '').trim()
  if (!text) return Number.NaN
  const direct = Date.parse(text)
  if (Number.isFinite(direct)) return direct
  const slashDate = text.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?(?:\s+(\d{1,2}):(\d{2}))?$/)
  if (!slashDate) return Number.NaN
  const first = Number(slashDate[1])
  const second = Number(slashDate[2])
  const hasYear = Boolean(slashDate[3])
  const year = hasYear ? Number(slashDate[3]) : new Date().getFullYear()
  const month = hasYear && first > 12 ? second : first
  const day = hasYear && first > 12 ? first : second
  const timestamp = new Date(year, month - 1, day, Number(slashDate[4] || 0), Number(slashDate[5] || 0)).getTime()
  return month >= 1 && month <= 12 && day >= 1 && day <= 31 ? timestamp : Number.NaN
}

function formatDate(value, withTime = true) {
  if (!value) return '—'
  const timestamp = parseTimestamp(value)
  if (!Number.isFinite(timestamp)) return String(value)
  const date = new Date(timestamp)
  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  }).format(date)
}

function usableText(value) {
  const text = String(value || '').trim()
  return /^"?QUERY LENGTH LIMIT EXCEEDED\b/i.test(text) ? '' : text
}

function excerpt(value, limit = 260) {
  const text = usableText(value).replace(/\s+/g, ' ')
  if (!text || text.length <= limit) return text
  return `${text.slice(0, limit).trimEnd()}…`
}

function relativeTime(value) {
  const timestamp = parseTimestamp(value)
  if (!Number.isFinite(timestamp)) return 'Time not provided'
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000))
  if (minutes < 1) return 'Just updated'
  if (minutes < 60) return `${minutes}  min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}  h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}  d ago`
  return formatDate(value, false)
}

function severityOf(item) {
  const raw = String(item?.severity || '').toLowerCase()
  if (['critical', 'high', 'medium', 'low'].includes(raw)) return raw
  const score = Number(item?.riskScore ?? item?.risk_score ?? 0)
  if (score >= 90) return 'critical'
  if (score >= 70) return 'high'
  if (score >= 40) return 'medium'
  return 'low'
}

function severityLabel(value) {
  return { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' }[value] || 'Unknown'
}

function eventType(item) {
  const value = String(item?.normalized_event_type || item?.event_type || item?.raw_source_type || '').toLowerCase()
  if (item?.cveId || item?.cve_id || value.includes('vulnerab')) return 'vulnerability'
  if (value.includes('ransom') || value === 'victim') return 'ransomware'
  if (value.includes('leak') || value === 'forum') return 'data-leak'
  return ''
}

function eventTypeLabel(type) {
  return { vulnerability: 'Vulnerability', ransomware: 'Ransomware', 'data-leak': 'Data leak' }[type] || 'Intelligence'
}

function detailHref(item) {
  const id = encodeURIComponent(String(item?.id || ''))
  const type = eventType(item)
  if (type === 'vulnerability') return `/vulnerability-alerts/${id}`
  if (type === 'ransomware') return `/ransomware/${id}`
  if (type === 'data-leak') return `/data-leak/${id}`
  return `/event/${id}`
}

function setText(root, selector, value) {
  const node = query(root, selector)
  if (node) node.textContent = value == null || value === '' ? '—' : String(value)
}

function setCounts(container, values) {
  queryAll(container, 'article').forEach((card, index) => {
    const target = query(card, 'strong[data-count], strong.num, strong')
    if (!target || index >= values.length) return
    const value = Number(values[index] || 0)
    target.textContent = number(value)
    if (target.hasAttribute('data-count')) target.dataset.count = String(value)
    const note = query(card, 'small')
    if (note) note.textContent = 'Live data'
  })
}

function setSummary(group, pairs) {
  queryAll(group, ':scope > div').forEach((item, index) => {
    if (!pairs[index]) return
    const [label, value] = pairs[index]
    const labelNode = query(item, 'span, dt')
    const valueNode = query(item, 'strong, dd')
    if (labelNode) labelNode.textContent = label
    if (valueNode) valueNode.textContent = value == null || value === '' ? '—' : String(value)
  })
}

function setCell(cell, main, sub = '') {
  if (!cell) return
  cell.replaceChildren()
  cell.append(document.createTextNode(main == null || main === '' ? '—' : String(main)))
  if (sub) {
    const secondary = document.createElement('span')
    secondary.textContent = String(sub)
    cell.appendChild(secondary)
  }
}

function setBadgeCell(cell, label, tone = '') {
  if (!cell) return
  cell.replaceChildren()
  const badge = document.createElement('span')
  badge.className = `badge${tone ? ` badge-${tone}` : ''}`
  badge.textContent = label
  cell.appendChild(badge)
}

function setActionCell(cell, label, href) {
  if (!cell) return
  cell.replaceChildren()
  const link = document.createElement('a')
  link.className = 'btn btn-ghost'
  link.href = href
  link.textContent = label
  cell.appendChild(link)
}

function documentTypeMeta(rawType) {
  const type = String(rawType || '').toLowerCase()
  if (type.includes('pdf')) return { label: 'PDF', className: 'pdf' }
  if (type.includes('xls') || type.includes('sheet')) return { label: 'XLS', className: 'xls' }
  if (type.includes('ppt') || type.includes('presentation')) return { label: 'PPT', className: 'ppt' }
  return { label: 'DOC', className: 'doc' }
}

function setDocumentTitleCell(cell, title, rawType) {
  if (!cell) return
  const meta = documentTypeMeta(rawType)
  const content = document.createElement('span')
  content.className = 'document-title-cell'
  const icon = document.createElement('span')
  icon.className = `inline-doc ${meta.className}`
  icon.textContent = meta.label
  const text = document.createElement('span')
  text.className = 'document-title-text'
  text.textContent = title || '—'
  content.append(icon, text)
  cell.replaceChildren(content)
  cell.title = title || ''
}

function setDocumentSourceCell(cell, platform, label) {
  if (!cell) return
  const marks = {
    baidu_wenku: 'baidu-doc',
    baidu_doc: 'baidu-doc',
    baidu: 'baidu-disk',
    baidu_netdisk: 'baidu-disk',
    baidupan_share: 'baidu-disk',
    aliyun: 'aliyun',
    alipan: 'aliyun',
    aliyundrive_share: 'aliyun',
    quark: 'quark',
    quark_share: 'quark',
    quark_doc: 'quark',
    onedrive: 'onedrive',
    onedrive_share: 'onedrive',
    doc88: 'doc88',
    docin: 'docin',
    csdn: 'csdn',
    csdn_wenku: 'csdn',
    csdn_download: 'csdn',
    tencent_wenku: 'tencent-doc',
    github: 'github',
    gitlab: 'gitlab',
    gitee: 'gitee',
  }
  const site = document.createElement('span')
  site.className = 'source-site'
  const mark = marks[String(platform || '').toLowerCase()]
  if (mark) {
    const logo = document.createElement('span')
    logo.className = `source-logo logo-${mark}`
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
    use.setAttribute('href', `#mark-${mark}`)
    svg.appendChild(use)
    logo.appendChild(svg)
    site.appendChild(logo)
  }
  const text = document.createElement('span')
  text.textContent = label || platform || '—'
  site.appendChild(text)
  cell.replaceChildren(site)
}

function setClassTextCell(cell, label, className) {
  if (!cell) return
  const value = document.createElement('span')
  value.className = className
  value.textContent = label || '—'
  cell.replaceChildren(value)
}

function setResultStatusCell(cell, label) {
  if (!cell) return
  const status = document.createElement('span')
  const value = label || 'Unprocessed'
  const tone = value.includes('Confirmed') ? 'confirmed'
    : value.includes('Processing') && !value.includes('Unprocessed') ? 'processing'
      : value.includes('Invalid') || value.includes('expired') ? 'expired' : 'pending'
  status.className = `result-status ${tone}`
  status.textContent = value
  cell.replaceChildren(status)
}

function replaceFilterOptions(root, selector, placeholder, entries) {
  const select = query(root, selector)
  if (!select) return
  const unique = new Map()
  for (const entry of entries) {
    const value = String(entry?.value ?? entry ?? '').trim()
    const label = String(entry?.label ?? entry ?? '').trim()
    if (value && label && !unique.has(value)) unique.set(value, label)
  }
  const options = [new Option(placeholder, '')]
  for (const [value, label] of unique) options.push(new Option(label, value))
  select.replaceChildren(...options)
}

function formatFullDate(value, withTime = false) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  }).format(date).replaceAll('/', '-')
}

function itemDateValue(item) {
  return item?.updatedTimeRaw
    || item?.updated_time_raw
    || item?.lastSeenAt
    || item?.firstSeenAt
    || item?.disclosureTimeRaw
    || item?.disclosure_time_raw
    || item?.disclosureTime
    || item?.disclosure_time
    || item?.disclosureDate
    || ''
}

function filterByDays(items, days, referenceTime = Date.now()) {
  if (!days) return [...items]
  const cutoff = referenceTime - Number(days) * 24 * 60 * 60 * 1000
  return items.filter((item) => {
    const timestamp = parseTimestamp(itemDateValue(item))
    return Number.isFinite(timestamp) && timestamp >= cutoff && timestamp <= referenceTime + 60 * 60 * 1000
  })
}

function buildDailyTrend(items, days = 7, referenceTime = Date.now()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const buckets = []
  const indexByDate = new Map()
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(referenceTime - offset * 24 * 60 * 60 * 1000)
    const key = formatter.format(date)
    indexByDate.set(key, buckets.length)
    buckets.push({ date: key, value: 0 })
  }
  for (const item of items) {
    const timestamp = parseTimestamp(itemDateValue(item))
    if (!Number.isFinite(timestamp)) continue
    const key = formatter.format(new Date(timestamp))
    const index = indexByDate.get(key)
    if (index !== undefined) buckets[index].value += 1
  }
  return buckets
}

function chartPoints(values, { xStart, xEnd, yTop, yBottom }) {
  const safeValues = values.length ? values.map((value) => Math.max(0, Number(value || 0))) : [0]
  const maximum = Math.max(1, ...safeValues)
  return safeValues.map((value, index) => ({
    x: safeValues.length === 1 ? (xStart + xEnd) / 2 : xStart + (xEnd - xStart) * index / (safeValues.length - 1),
    y: yBottom - (yBottom - yTop) * value / maximum,
    value,
  }))
}

function evenlySample(items, count) {
  if (items.length <= count) return [...items]
  return Array.from({ length: count }, (_, index) => items[Math.round(index * (items.length - 1) / Math.max(1, count - 1))])
}

function linePath(points) {
  return points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ')
}

function areaPath(points, yBottom) {
  if (!points.length) return ''
  return `${linePath(points)} L${points.at(-1).x.toFixed(1)} ${yBottom} L${points[0].x.toFixed(1)} ${yBottom} Z`
}

function setConicChart(node, values, colors, customProperty = '') {
  if (!node) return
  const safeValues = values.map((value) => Math.max(0, Number(value || 0)))
  const total = safeValues.reduce((sum, value) => sum + value, 0)
  let gradient = 'conic-gradient(var(--border) 0 100%)'
  if (total > 0) {
    let start = 0
    const stops = safeValues.map((value, index) => {
      const end = start + value / total * 100
      const stop = `${colors[index % colors.length]} ${start.toFixed(2)}% ${end.toFixed(2)}%`
      start = end
      return stop
    })
    gradient = `conic-gradient(${stops.join(', ')})`
  }
  if (customProperty) node.style.setProperty(customProperty, gradient)
  else node.style.background = gradient
}

function setChartMarkers(group, selector, points, update) {
  if (!group) return
  const nodes = queryAll(group, selector)
  nodes.forEach((node, index) => {
    const point = points[index]
    node.hidden = !point
    node.style.opacity = point ? '1' : '0'
    if (point) update(node, point, index)
  })
}

function sourceLogoKey(value) {
  const label = String(value || '').toLowerCase()
  if (/github/.test(label)) return 'github'
  if (/gitlab/.test(label)) return 'gitlab'
  if (/gitee|Gitee/.test(label)) return 'gitee'
  if (/Baidu.*Wenku|baidu.*wenku|baidu_doc/.test(label)) return 'baidu-doc'
  if (/Baidu.*Netdisk|baidupan|baidu_netdisk/.test(label)) return 'baidu-disk'
  if (/Aliyun|aliyun|alipan/.test(label)) return 'aliyun'
  if (/Quark|quark/.test(label)) return 'quark'
  if (/onedrive/.test(label)) return 'onedrive'
  if (/Doc88|doc88/.test(label)) return 'doc88'
  if (/Docin|docin/.test(label)) return 'docin'
  if (/csdn/.test(label)) return 'csdn'
  if (/Tencent.*(?:Wenku|Docs)|tencent_(?:wenku|docs?)/.test(label)) return 'tencent-doc'
  return ''
}

function setSourceLogo(logo, value) {
  if (!logo) return
  const key = sourceLogoKey(value)
  ;[...logo.classList].filter((name) => name.startsWith('logo-')).forEach((name) => logo.classList.remove(name))
  if (key) logo.classList.add(`logo-${key}`)
  const use = query(logo, 'use')
  if (use) use.setAttribute('href', key ? `#mark-${key}` : '')
  logo.hidden = !key
}

function fillSourceDistribution(container, items, total, percentage = false) {
  if (!container) return
  container.__runtimeRowTemplate ||= container.firstElementChild?.cloneNode(true)
  while (container.children.length < items.length && container.__runtimeRowTemplate) {
    container.appendChild(container.__runtimeRowTemplate.cloneNode(true))
  }
  const rows = [...container.children]
  rows.forEach((row, index) => {
    const item = items[index]
    row.hidden = !item
    if (!item) return
    const name = item.name || item.label || item.key || 'Unknown source'
    const share = Math.round(Number(item.value || 0) / Math.max(1, total) * 100)
    setSourceLogo(query(row, '.source-logo'), name)
    const nestedName = query(row, ':scope > span > strong')
    const nameNode = nestedName || query(row, ':scope > span:not(.source-logo)')
    if (nameNode) nameNode.textContent = name
    const valueNode = nestedName ? query(row, ':scope > span > small') : query(row, ':scope > b')
    if (valueNode) {
      if (valueNode.matches('small')) {
        valueNode.replaceChildren()
        const count = document.createElement('b')
        count.textContent = number(item.value)
        valueNode.append(count, document.createTextNode(` · ${share}%`))
      } else {
        valueNode.textContent = percentage ? `${share}%` : number(item.value)
      }
    }
    row.style.setProperty('--share', `${share}%`)
  })
}

function reviewStatusLabel(value) {
  return {
    new: 'Pending',
    triaged: 'Processing',
    confirmed: 'Confirmed',
    false_positive: 'False positive',
    closed: 'Closed',
    suppressed: 'Suppressed',
  }[String(value || '').toLowerCase()] || value || '—'
}

function setLabeledValues(container, values) {
  if (!container) return
  queryAll(container, ':scope > div').forEach((item) => {
    const labelNode = query(item, ':scope > span, :scope > dt')
    const valueNode = query(item, ':scope > strong, :scope > dd')
    if (!labelNode || !valueNode) return
    const label = labelNode.textContent.trim()
    const value = Object.prototype.hasOwnProperty.call(values, label) ? values[label] : '—'
    valueNode.textContent = value == null || value === '' ? '—' : String(value)
  })
}

function ensureDataState(root) {
  let node = query(root, '.runtime-data-state')
  if (node) return node
  const main = query(root, 'main')
  if (!main) return null
  node = document.createElement('div')
  node.className = 'runtime-data-state'
  node.setAttribute('role', 'status')
  main.prepend(node)
  return node
}

function setDataState(root, state, message = '') {
  const node = ensureDataState(root)
  if (!node) return
  node.dataset.state = state
  node.hidden = state === 'ready'
  node.textContent = message || (state === 'loading' ? 'Loading live data…' : '')
}

function setActionAvailable(element, available, title = '') {
  if (!element) return
  if ('disabled' in element) element.disabled = !available
  element.classList.toggle('runtime-disabled', !available)
  element.setAttribute('aria-disabled', String(!available))
  if (title) element.title = title
}

function prepareDataPage(root, file) {
  setDataState(root, 'loading', 'Loading live data…')
  queryAll(root, '[data-count]').forEach((node) => {
    node.textContent = '—'
    node.dataset.count = ''
  })
  queryAll(root, 'table[data-table]').forEach((table) => clearTable(root, `#${table.id}`))
  queryAll(root, '[data-table-count]').forEach((node) => { node.textContent = '0' })
  queryAll(root, '.actor-rank, .timeline-feed li, .situation-watch-list a, .situation-region-rank .compact-bar, .industry-heat-list > div, .rank-card .bar-row-v2, .vendor-bars > div, .industry-block, .product-bubble, .code-secret-rank > div').forEach((node) => { node.hidden = true })
  queryAll(root, '.source-row').forEach((row) => {
    setText(row, 'small', '0  records · trusted 0')
    setText(row, 'b', '0%')
  })
  queryAll(root, '.monitor-donut-legend > div, .code-source-grid > div, .code-risk-legend > div, .severity-legend > div, .signal-source-list > div').forEach((node) => { node.hidden = true })
  queryAll(root, '.trend-area, .trend-line, .vuln-area-path, .vuln-line-path, .monitor-area, .monitor-line, .code-line, .situation-spark path').forEach((path) => path.setAttribute('d', ''))
  queryAll(root, '.vuln-points circle, .monitor-points circle, .monitor-columns rect, .monitor-peak-ring, .code-dots circle').forEach((node) => { node.style.opacity = '0' })
  queryAll(root, '.monitor-chart-values text, .monitor-chart-dates text, .code-chart-values text, .code-chart-dates text, .vuln-chart-values text, .chart-labels text, .trend-axis-labels span').forEach((node) => { node.textContent = '—' })
  queryAll(root, '.monitor-trend-summary strong, .trend-summary strong').forEach((node) => { node.textContent = '—' })
  queryAll(root, '[data-pagination-for]').forEach((pagination) => {
    pagination.hidden = true
    setText(pagination, '.table-pagination-summary', '')
  })
  setConicChart(query(root, '.situation-donut'), [], ['var(--danger)'], '--runtime-donut')
  queryAll(root, '.severity-donut, .monitor-donut, .code-risk-donut, .signal-ring').forEach((node) => setConicChart(node, [], ['var(--border)']))

  if (file === 'monitoring.html') {
    queryAll(root, '.monitor-kpi-grid small, .code-kpi-layout small').forEach((node) => { node.textContent = 'Waiting for live API' })
    queryAll(root, '.monitor-donut-card .meta, .code-risk-card .meta').forEach((node) => { node.textContent = 'Waiting for live API' })
  }

  if (file === 'dashboard.html') {
    queryAll(root, '.situation-status-strip strong').forEach((node) => { node.textContent = '—' })
    setText(root, '.situation-status-strip > div:first-child small', 'Waiting for live API')
    queryAll(root, '.situation-kpi-head b').forEach((node) => { node.textContent = 'Loading' })
    queryAll(root, '.situation-world .map-point, .situation-map-label').forEach((node) => { node.hidden = true })
    setText(root, '.situation-map-foot > b strong', '—')
    setText(root, '.situation-watch-card .panel-header .badge', '—')
    queryAll(root, '.situation-donut-legend .legend-item b').forEach((node) => { node.textContent = '—' })
    queryAll(root, '.rank-card .rank-badge').forEach((node) => { node.textContent = '—' })
    queryAll(root, '.rank-card .rank-hero strong').forEach((node) => { node.textContent = 'Loading' })
    queryAll(root, '.rank-card .rank-hero span:last-child').forEach((node) => { node.textContent = 'Waiting for live API' })
  }

  if (file === 'intelligence.html') {
    const list = query(root, '#intel-results')
    if (list) {
      list.__runtimeItemTemplate ||= query(list, '.intel-result-item')?.cloneNode(true)
      list.replaceChildren()
    }
    queryAll(root, '.intel-result-tabs b, [data-intel-total]').forEach((node) => { node.textContent = '0' })
  }

  if (INCIDENT_FILES.has(file) || REVIEW_FILES.has(file) || file === 'collector-run-detail.html') {
    setText(root, 'main h1', 'Loading records…')
    queryAll(root, '.detail-summary strong, .detail-kpi strong, .definition-grid strong').forEach((node) => { node.textContent = '—' })
    queryAll(root, '.detail-list, .detail-matrix, .timeline').forEach((container) => replaceRecordContainer(container, []))
    queryAll(root, '.detail-code, .detail-log, .detail-proof').forEach((node) => { node.textContent = '—' })
    queryAll(root, '.source-link-line a').forEach((link) => {
      link.removeAttribute('href')
      link.textContent = '—'
    })
    queryAll(root, '.mirror-frame figcaption > *, .mirror-frame-bar time').forEach((node) => { node.textContent = '—' })
    queryAll(root, '.evidence-actions a, .source-link-line a').forEach((link) => {
      link.removeAttribute('href')
      link.hidden = true
    })
    queryAll(root, '[data-copy]').forEach((button) => {
      button.dataset.copy = ''
      delete button.dataset.runtimeCopy
      setActionAvailable(button, false, 'Waiting for live API data')
    })
    queryAll(root, '[data-runtime-open], [data-runtime-download]').forEach((button) => {
      delete button.dataset.runtimeOpen
      delete button.dataset.runtimeDownload
      setActionAvailable(button, false, 'Waiting for live API data')
    })
  }

  queryAll(root, 'button[data-toast], button[data-disposition]').forEach((button) => {
    setActionAvailable(button, false, 'Waiting for live API status')
  })
}

function replaceRows(table, items, fillRow) {
  const body = query(table, 'tbody')
  if (!body) return
  const template = table.__runtimeRowTemplate?.cloneNode(true)
    || query(body, 'tr')?.cloneNode(true)
    || document.createElement('tr')
  const rows = items.map((item) => {
    const row = template.cloneNode(true)
    row.hidden = false
    fillRow(row, item)
    return row
  })
  body.replaceChildren(...rows)
  const count = table.id ? document.querySelector(`[data-table-count="${table.id}"]`) : null
  if (count) count.textContent = String(items.length)
  const empty = table.id ? document.querySelector(`[data-table-empty="${table.id}"]`) : null
  if (empty) empty.style.display = items.length ? 'none' : 'block'
  table.dispatchEvent(new CustomEvent('prototype:rows-updated'))
}

function clearTable(root, selector) {
  const table = query(root, selector)
  const body = query(table, 'tbody')
  if (body) {
    table.__runtimeRowTemplate ||= query(body, 'tr')?.cloneNode(true)
    body.replaceChildren()
  }
  return table
}

function countBy(items, getter) {
  const counts = new Map()
  for (const item of items) {
    const key = String(getter(item) || 'Unknown')
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return [...counts].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
}

function fillNamedRows(container, items) {
  if (!container) return
  const rows = [...container.children]
  const max = Math.max(1, Number(items[0]?.value || 0))
  rows.forEach((row, index) => {
    const item = items[index]
    row.hidden = !item
    if (!item) return
    const labels = queryAll(row, 'span')
    const name = labels.find((node) => !node.classList.contains('source-logo')) || query(row, 'strong')
    const value = query(row, ':scope > strong:last-child, :scope > b:last-child') || query(row, 'strong:last-child')
    if (name) name.textContent = item.name
    if (value && value !== name) value.textContent = number(item.value)
    const bar = query(row, 'i, .bar-fill-v2')
    if (bar) {
      const percentage = `${Math.round(Number(item.value || 0) / max * 100)}%`
      bar.style.setProperty('--bar', percentage)
      bar.style.setProperty('--value', percentage)
      bar.style.setProperty('--score', percentage)
    }
  })
}

function fillRankCard(card, items, subtitle) {
  if (!card) return
  const first = items[0] || { name: 'No data', value: 0 }
  setText(card, '.rank-badge', number(first.value))
  setText(card, '.rank-hero strong', first.name)
  setText(card, '.rank-hero span:last-child', subtitle)
  fillNamedRows(query(card, '.bar-list-v2'), items)
}

function markExports(root, state, tableSelectors) {
  queryAll(root, 'button[data-toast]').forEach((button) => {
    if (!button.textContent.includes('Export')) return
    const panel = button.closest('article, section')
    const table = tableSelectors.map((selector) => query(panel || root, selector) || query(root, selector)).find(Boolean)
    if (!table) return
    button.dataset.runtimeExport = table.id || tableSelectors[0]
    state.tables.set(button.dataset.runtimeExport, table)
    setActionAvailable(button, true)
  })
}

function exportTable(table, filename = 'Abyssal data.csv') {
  if (!table) return
  const lines = queryAll(table, 'tr')
    .filter((row) => !row.hidden)
    .map((row) => queryAll(row, 'th, td').map((cell) => `"${cell.textContent.trim().replaceAll('"', '""')}"`).join(','))
  const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
  showToast('Exported current live data')
}

function installActionGuard(root, state) {
  root.__dataRuntimeAbort?.abort()
  const controller = new AbortController()
  root.__dataRuntimeAbort = controller
  root.addEventListener('click', async (event) => {
    const target = event.target.closest('button, a')
    if (!target || !root.contains(target)) return

    const handled = target.dataset.runtimeExport
      || target.dataset.runtimeCodeExport
      || target.dataset.runtimeRefresh
      || target.dataset.runtimeFilter
      || target.dataset.runtimeReviewStatus
      || target.dataset.runtimeReviewSave
      || target.dataset.runtimeCopy
      || target.dataset.runtimeScroll
      || target.dataset.runtimeTranslate
      || target.dataset.runtimeSource
      || target.dataset.runtimeOpen
      || target.dataset.runtimeDownload
    const unsupported = target.matches('[data-toast], [data-disposition]') && !handled
    if (!handled && !unsupported) return

    event.preventDefault()
    event.stopImmediatePropagation()
    if (unsupported) {
      showToast('No backend API for this action yet; not supported')
      return
    }
    try {
      if (target.dataset.runtimeCodeExport) {
        await exportCodeHits(root, state, target)
      } else if (target.dataset.runtimeExport) {
        exportTable(state.tables.get(target.dataset.runtimeExport))
      } else if (target.dataset.runtimeRefresh) {
        await state.refresh?.()
        showToast('Live data refreshed')
      } else if (target.dataset.runtimeFilter) {
        const input = query(root, target.dataset.runtimeFilter)
        if (input) {
          input.value = target.dataset.runtimeFilterValue || ''
          input.dispatchEvent(new Event('input', { bubbles: true }))
        }
      } else if (target.dataset.runtimeReviewStatus) {
        state.pendingReviewStatus = target.dataset.runtimeReviewStatus
        queryAll(root, '[data-runtime-review-status]').forEach((button) => button.classList.toggle('btn-primary', button === target))
        const status = query(root, '[data-review-state]')
        if (status) status.textContent = target.dataset.disposition || target.textContent.trim()
        showToast('Review verdict selected; please save')
      } else if (target.dataset.runtimeReviewSave) {
        await state.saveReview?.()
      } else if (target.dataset.runtimeCopy) {
        await navigator.clipboard.writeText(target.dataset.runtimeCopy || state.copyText || '')
        showToast('Copied to clipboard')
      } else if (target.dataset.runtimeScroll) {
        query(root, target.dataset.runtimeScroll)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } else if (target.dataset.runtimeTranslate) {
        await state.toggleTranslation?.()
      } else if (target.dataset.runtimeSource) {
        const source = target.dataset.runtimeSource
        queryAll(root, '[data-runtime-source]').forEach((button) => button.classList.toggle('active', button === target))
        if (state.sourceTable) {
          state.sourceTable.dataset.activeTab = source
          state.sourceTable.dataset.page = '1'
          state.sourceTable.dispatchEvent(new CustomEvent('prototype:rows-updated'))
        }
      } else if (target.dataset.runtimeOpen) {
        window.open(target.dataset.runtimeOpen, '_blank', 'noopener,noreferrer')
      } else if (target.dataset.runtimeDownload) {
        const link = document.createElement('a')
        link.href = target.dataset.runtimeDownload
        link.download = ''
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
        link.click()
      }
    } catch (error) {
      showToast(error.message || 'Operation failed')
    }
  }, { capture: true, signal: controller.signal })
}

function showLoadError(root, error) {
  const message = error?.message || 'Failed to load data'
  setDataState(root, 'error', `Failed to load live data:${message}`)
  const title = query(root, '.detail-hero h1')
  if (title) title.textContent = 'Failed to load records'
  showToast(message)
}

async function hydrateDashboard(root, state) {
  const table = clearTable(root, '#dashboard-events-table')
  const range = state.dashboardRange || query(root, '.situation-range .tab.active')?.dataset.tab || '7d'
  const days = { today: 1, '7d': 7, '30d': 30 }[range] || 7
  state.dashboardRange = range
  const payload = await requestJson(`/api/intelligence/dashboard?days=${days}`)
  const kpis = payload.kpis || []
  setCounts(query(root, '.situation-kpi-grid'), kpis.map((item) => item.value || 0))

  const dashboardCards = queryAll(root, '.situation-kpi-grid .situation-kpi')
  dashboardCards.forEach((card, index) => {
    setText(card, '.situation-kpi-head b', kpis[index]?.highlight || 'No new items this period')
  })
  kpis.forEach((item, index) => {
    const path = query(dashboardCards[index], '.situation-spark path')
    if (!path) return
    const points = chartPoints(item.trend || [], { xStart: 2, xEnd: 118, yTop: 4, yBottom: 24 })
    path.setAttribute('d', linePath(points))
  })

  const events = payload.priorityEvents || []
  replaceRows(table, events, (row, item) => {
    const cells = queryAll(row, 'td')
    const type = eventType(item)
    row.dataset.category = type === 'data-leak' ? 'leak' : type
    row.dataset.severity = severityOf(item)
    setCell(cells[0], formatDate(item.updatedTimeRaw || item.disclosureTimeRaw || item.disclosureDate))
    setCell(cells[1], item.title, excerpt(item.summary, 120) || item.category || 'No summary')
    setCell(cells[2], eventTypeLabel(type))
    setCell(cells[3], item.region || item.country)
    setCell(cells[4], item.industry, item.vendor || item.product || item.victim)
    setBadgeCell(cells[5], severityLabel(severityOf(item)), severityOf(item))
    setCell(cells[6], item.monitoringPriority ? `${severityLabel(String(item.monitoringPriority).toLowerCase())} priority` : (item.isExploited ? 'Exploited' : '—'))
    setActionCell(cells[7], 'View', detailHref(item))
  })

  const mapFallback = Boolean(payload.fallback?.geo)
  setText(root, '.situation-live-label span', mapFallback ? 'Cumulative geographic distribution' : 'Geographic distribution this period')
  setText(root, '.situation-region-rank .region-rank-head span:last-child', 'Events')
  const countries = payload.geo?.countries || []
  const maxCountryValue = Math.max(1, ...countries.map((item) => Number(item.value || 0)))
  queryAll(root, '.situation-region-rank .compact-bar').forEach((row, index) => {
    const item = countries[index]
    row.hidden = !item
    if (!item) return
    setText(row, ':scope > span', item.name)
    setText(row, ':scope > b', number(item.value))
    query(row, '.bar-fill-v2')?.style.setProperty('--bar', `${Math.round(Number(item.value || 0) / maxCountryValue * 100)}%`)
  })
  const positionedCountries = countries.filter((item) => COUNTRY_COORDINATES[String(item.code || '').toUpperCase()]).slice(0, 5)
  const mapPoints = queryAll(root, '.situation-world .map-point')
  const mapLabels = queryAll(root, '.situation-map-label')
  mapPoints.forEach((point, index) => {
    const item = positionedCountries[index]
    point.hidden = !item
    if (!item) return
    point.title = `${item.name}: ${number(item.count)} records, risk index ${number(item.risk)}`
  })
  mapLabels.forEach((label, index) => {
    const item = positionedCountries[index]
    label.hidden = !item
    if (!item) return
    label.style.right = 'auto'
    label.textContent = `${item.name} · ${number(item.count)}`
  })
  const mapWorld = query(root, '.situation-world')
  const mapImage = query(root, '.situation-world-map')
  const positionMapAnnotations = () => {
    if (!mapWorld || !mapImage) return
    const boxWidth = mapImage.clientWidth
    const boxHeight = mapImage.clientHeight
    const imageRatio = (mapImage.naturalWidth || 1200) / (mapImage.naturalHeight || 540)
    const boxRatio = boxWidth / Math.max(1, boxHeight)
    const renderedWidth = boxRatio > imageRatio ? boxHeight * imageRatio : boxWidth
    const renderedHeight = boxRatio > imageRatio ? boxHeight : boxWidth / imageRatio
    const originLeft = mapImage.offsetLeft + (boxWidth - renderedWidth) / 2
    const originTop = mapImage.offsetTop + (boxHeight - renderedHeight) / 2
    mapPoints.forEach((point, index) => {
      const item = positionedCountries[index]
      if (!item) return
      const [longitude, latitude] = COUNTRY_COORDINATES[String(item.code).toUpperCase()]
      point.style.left = `${originLeft + (longitude + 180) / 360 * renderedWidth}px`
      point.style.top = `${originTop + (90 - latitude) / 180 * renderedHeight}px`
      point.style.transform = 'translate(-50%, -50%)'
    })
    mapLabels.forEach((label, index) => {
      const item = positionedCountries[index]
      if (!item) return
      const [longitude, latitude] = COUNTRY_COORDINATES[String(item.code).toUpperCase()]
      const pointLeft = originLeft + (longitude + 180) / 360 * renderedWidth
      const pointTop = originTop + (90 - latitude) / 180 * renderedHeight
      const code = String(item.code).toUpperCase()
      let desiredLeft = pointLeft - label.offsetWidth / 2
      let desiredTop = pointTop - label.offsetHeight - 12
      if (code === 'CA') {
        desiredLeft = pointLeft - label.offsetWidth - 10
        desiredTop = pointTop - label.offsetHeight - 4
      } else if (code === 'US') {
        desiredLeft = pointLeft + 10
        desiredTop = pointTop + 4
      }
      const left = Math.max(4, Math.min(mapWorld.clientWidth - label.offsetWidth - 4, desiredLeft))
      const top = Math.max(4, Math.min(mapWorld.clientHeight - label.offsetHeight - 4, desiredTop))
      label.style.left = `${left}px`
      label.style.top = `${top}px`
    })
  }
  root.__situationMapObserver?.disconnect()
  if (typeof ResizeObserver !== 'undefined' && mapWorld) {
    root.__situationMapObserver = new ResizeObserver(positionMapAnnotations)
    root.__situationMapObserver.observe(mapWorld)
  }
  if (mapImage?.complete) positionMapAnnotations()
  else mapImage?.addEventListener('load', positionMapAnnotations, { once: true })
  queryAll(root, '.situation-route').forEach((routeNode) => { routeNode.hidden = true })
  setText(root, '.situation-map-foot > b strong', number(payload.geo?.averageRisk || 0))
  const industries = payload.industries || []
  queryAll(root, '.industry-heat-list > div').forEach((row, index) => {
    const item = industries[index]
    row.hidden = !item
    if (!item) return
    setText(row, 'b', String(index + 1).padStart(2, '0'))
    setText(row, 'strong', item.name)
    setText(row, 'small', `${number(item.count)}  live events`)
    setText(row, 'em', number(item.value))
  })
  queryAll(root, '.situation-watch-list a').forEach((link, index) => {
    const item = events[index]
    link.hidden = !item
    if (!item) return
    const type = eventType(item)
    link.href = detailHref(item)
    const kind = query(link, '.watch-kind')
    if (kind) kind.dataset.kind = type || 'intelligence'
    setText(link, '.watch-kind', eventTypeLabel(type))
    setText(link, 'div strong', item.title || 'Untitled event')
    setText(link, 'div small', [item.region || item.country, item.industry].filter(Boolean).join(' · ') || 'Live intelligence')
    setText(link, ':scope > b', severityLabel(severityOf(item)))
  })
  setText(root, '.situation-watch-card .panel-header .badge', number(Math.min(4, events.length)))
  const distribution = payload.distribution24h || [0, 0, 0, 0]
  queryAll(root, '.situation-donut-legend .legend-item b').forEach((node, index) => {
    node.textContent = number(distribution[index] ?? 0)
  })
  setText(root, '.situation-donut-legend .legend-item:nth-child(4) span', 'File monitoring')
  const distributionTotal = distribution.reduce((sum, value) => sum + value, 0)
  setText(root, '.situation-donut .donut-core strong', number(distributionTotal))
  const donut = query(root, '.situation-donut')
  if (donut) {
    donut.setAttribute('aria-label', `Intelligence type distribution in the last 24 hours: ransomware ${distribution[0]}, data leaks ${distribution[1]}, vulnerabilities ${distribution[2]}, file monitoring ${distribution[3]}`)
    setConicChart(donut, distribution, ['var(--danger)', 'var(--warning)', 'var(--accent)', 'var(--secondary)'], '--runtime-donut')
  }
  const trend = payload.threatTrend || {}
  const labels = trend.labels || []
  const totalTrend = trend.total || []
  const highTrend = trend.highRisk || []
  const totalPoints = chartPoints(totalTrend, { xStart: 36, xEnd: 602, yTop: 28, yBottom: 160 })
  const highPoints = chartPoints(highTrend, { xStart: 36, xEnd: 602, yTop: 28, yBottom: 160 })
  query(root, '.situation-trend-chart .trend-line.total')?.setAttribute('d', linePath(totalPoints))
  query(root, '.situation-trend-chart .trend-line.critical')?.setAttribute('d', linePath(highPoints))
  query(root, '.situation-trend-chart .trend-area')?.setAttribute('d', areaPath(highPoints, 160))
  const trendTotals = trend.severityTotals || [0, 0, 0]
  queryAll(root, '.trend-summary > div strong').forEach((node, index) => { node.textContent = number(trendTotals[index] || 0) })
  const trendLabels = ['Critical', 'High', 'Medium/low']
  queryAll(root, '.trend-summary > div span').forEach((node, index) => { node.textContent = trendLabels[index] || node.textContent })
  const axisNodes = queryAll(root, '.trend-axis-labels span')
  axisNodes.forEach((node, index) => {
    if (!labels.length) {
      node.textContent = '—'
      return
    }
    const labelIndex = axisNodes.length === 1 ? labels.length - 1 : Math.round(index * (labels.length - 1) / (axisNodes.length - 1))
    node.textContent = labels[labelIndex] || '—'
  })
  const monitoring = payload.monitoringStatus || {}
  setText(root, '.situation-status-strip > div:first-child strong', monitoring.statusLabel || monitoring.statusValue || 'Monitoring status not provided')
  setText(root, '.situation-status-strip > div:first-child small', monitoring.subtitle || monitoring.refreshedValue || 'Live API data')
  const statusValues = payload.statusCounts || [countries.length, industries.length, 0]
  queryAll(root, '.situation-status-strip > div').slice(1).forEach((item, index) => {
    setText(item, 'strong', number(statusValues[index] || 0))
  })

  const cards = queryAll(root, '.rank-card')
  fillRankCard(cards[0], payload.rankings?.ransomwareActors || [], payload.fallback?.ransomware ? 'Total in current database' : 'Most active this period')
  fillRankCard(cards[1], payload.rankings?.sensitiveTypes || [], payload.fallback?.dataLeak ? 'Total in current database' : 'Highest share this period')
  fillRankCard(cards[2], payload.rankings?.vulnerabilityVendors || [], 'Key vendors this period')
  const refresh = queryAll(root, 'button[data-toast]').find((button) => button.textContent.includes('Refresh overview'))
  if (refresh) {
    refresh.dataset.runtimeRefresh = 'dashboard'
    setActionAvailable(refresh, true)
  }
  queryAll(root, '.situation-range .tab').forEach((button) => {
    if (button.dataset.runtimeRangeBound) return
    button.dataset.runtimeRangeBound = '1'
    button.addEventListener('click', async () => {
      state.dashboardRange = button.dataset.tab || '7d'
      setDataState(root, 'loading', 'Refreshing live data for the statistics period…')
      try {
        await hydrateDashboard(root, state)
        setDataState(root, 'ready')
      } catch (error) {
        showLoadError(root, error)
      }
    })
  })
  state.refresh = () => hydrateDashboard(root, state)
}

function renderIntelligenceItems(root, events, counts = null) {
  const list = query(root, '#intel-results')
  if (!list) return
  const template = list.__runtimeItemTemplate?.cloneNode(true)
    || query(list, '.intel-result-item')?.cloneNode(true)
  if (!template) return
  const rows = events.map((item) => {
    const row = template.cloneNode(true)
    const type = eventType(item)
    const severity = severityOf(item)
    const eventTime = item.updatedTimeRaw || item.updated_time_raw || item.disclosureTimeRaw || item.disclosure_time_raw || item.disclosure_time || ''
    row.hidden = false
    row.dataset.category = type
    row.dataset.severity = severity
    row.dataset.industry = item.industry || ''
    row.dataset.status = item.is_exploited || item.isExploited ? 'exploited' : 'new'
    row.dataset.date = String(Date.parse(eventTime) || 0)
    row.dataset.severityRank = String({ critical: 4, high: 3, medium: 2, low: 1 }[severity] || 0)
    const thumb = query(row, '.intel-result-thumb')
    if (thumb) {
      const thumbType = type === 'data-leak' ? 'leak' : type
      thumb.className = `intel-result-thumb thumb-${thumbType}`
      thumb.innerHTML = type === 'vulnerability'
        ? '<svg viewBox="0 0 24 24" fill="none"><rect x="7" y="6" width="10" height="13" rx="4"/><path d="M9 6V4m6 2V4M4 10h3m10 0h3M4 15h3m10 0h3M9 12h6m-6 3h6"/></svg>'
        : type === 'ransomware'
          ? '<svg viewBox="0 0 24 24" fill="none"><path d="M6.5 3.5h7l4 4V20h-11Z"/><path d="M13.5 3.5V8h4"/><rect x="9" y="12" width="6.5" height="5.5" rx="1.2"/><path d="M10.6 12v-1a1.65 1.65 0 0 1 3.3 0v1M12.25 14.2v1.2"/></svg>'
          : '<svg viewBox="0 0 24 24" fill="none"><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></svg>'
    }
    const time = query(row, 'time')
    if (time) {
      time.textContent = formatDate(eventTime)
      if (eventTime) time.dateTime = new Date(eventTime).toISOString()
      else time.removeAttribute('datetime')
    }
    const relative = queryAll(row, '.intel-result-meta > span').find((node) => !node.classList.contains('badge'))
    if (relative) relative.textContent = relativeTime(eventTime)
    const badges = queryAll(row, '.intel-result-meta .badge')
    if (badges[0]) badges[0].textContent = severityLabel(severity)
    if (badges[1]) badges[1].textContent = eventTypeLabel(type)
    const title = query(row, 'h2 a')
    if (title) {
      title.textContent = item.title || 'Untitled event'
      title.href = detailHref(item)
      title.target = '_blank'
      title.rel = 'noopener noreferrer'
    }
    setText(row, 'p', excerpt(item.summary || item.detail_text, 260) || 'No summary')
    const context = queryAll(row, '.intel-result-context > *')
    const values = [item.attacker || item.vendor || item.source, item.cveId || item.cve_id || item.category, item.industry, item.region || item.country]
    context.forEach((node, index) => { node.textContent = values[index] || '—' })
    return row
  })
  list.replaceChildren(...rows)
  list.dispatchEvent(new CustomEvent('prototype:rows-updated'))
  const resolvedCounts = counts || {
    all: rows.length,
    ransomware: rows.filter((row) => row.dataset.category === 'ransomware').length,
    'data-leak': rows.filter((row) => row.dataset.category === 'data-leak').length,
    vulnerability: rows.filter((row) => row.dataset.category === 'vulnerability').length,
  }
  for (const type of ['all', 'ransomware', 'data-leak', 'vulnerability']) {
    setText(root, `.intel-result-tabs [data-tab="${type}"] b`, Number(resolvedCounts[type] || 0))
  }
  setText(root, '[data-intel-total]', Number(resolvedCounts.all || 0))
}

function installIntelligenceRefresh(root) {
  if (root.__intelligenceRefreshCleanup) return
  const refresh = () => {
    if (!root.isConnected) {
      root.__intelligenceRefreshCleanup?.()
      return
    }
    if (!document.hidden && navigator.onLine !== false && !root.__intelligencePending) {
      void hydrateIntelligence(root, { background: true })
    }
  }
  const timer = window.setInterval(refresh, 30_000)
  document.addEventListener('visibilitychange', refresh)
  window.addEventListener('online', refresh)
  root.__intelligenceRefreshCleanup = () => {
    window.clearInterval(timer)
    document.removeEventListener('visibilitychange', refresh)
    window.removeEventListener('online', refresh)
    root.__intelligenceRefreshCleanup = null
  }
}

async function hydrateIntelligence(root, { background = false } = {}) {
  const list = query(root, '#intel-results')
  if (list) {
    list.__runtimeItemTemplate ||= query(list, '.intel-result-item')?.cloneNode(true)
  }
  if (!list) return
  if (background && root.__intelligencePending) return
  installIntelligenceRefresh(root)
  root.__intelligenceRequest?.controller?.abort()
  const request = { controller: new AbortController() }
  root.__intelligenceRequest = request
  root.__intelligencePending = request
  const account = localStorage.getItem('dwti-current-user') || ''
  if (list.__searchAccount !== account) {
    delete list.dataset.loaded
    list.__searchAccount = account
  }
  const current = () => root.__intelligenceRequest === request && root.contains(list)
    && account === (localStorage.getItem('dwti-current-user') || '')
  if (!list.dataset.loaded) {
    list.replaceChildren()
    queryAll(root, '.intel-result-tabs b, [data-intel-total]').forEach((node) => { node.textContent = '—' })
  }
  if (!background) setDataState(root, 'loading', list.dataset.loaded ? 'Updating query results; showing previous results for now…' : 'Querying intelligence…')
  const empty = query(root, '[data-table-empty="intel-results"]')
  if (empty) empty.hidden = true
  list.inert = !background
  list.setAttribute('aria-busy', 'true')
  const pagination = query(root, '[data-pagination-for="intel-results"]')
  if (pagination) pagination.inert = !background

  const locationParameters = new URLSearchParams(window.location.search)
  const searchQuery = locationParameters.get('q')?.trim() || ''
  const requestedPage = Math.max(1, Number(locationParameters.get('page') || 1) || 1)
  const requestedType = ['ransomware', 'data-leak', 'vulnerability'].includes(locationParameters.get('type'))
    ? locationParameters.get('type')
    : 'all'
  const requestedSort = ['oldest', 'severity'].includes(locationParameters.get('sort'))
    ? locationParameters.get('sort')
    : 'latest'

  const searchInput = query(root, '[data-table-search="intel-results"]')
  if (searchInput && !background) searchInput.value = searchQuery
  const sortControl = query(root, '[data-intel-sort]')
  if (sortControl && !background) sortControl.value = requestedSort
  list.dataset.activeTab = requestedType
  queryAll(root, '.intel-result-tabs .tab').forEach((button) => {
    const active = button.dataset.tab === requestedType
    button.classList.toggle('active', active)
    button.setAttribute('aria-selected', String(active))
  })

  const navigate = (changes, resetPage = false) => {
    const url = new URL(window.location.href)
    Object.entries(changes).forEach(([key, value]) => {
      if (value == null || value === '' || value === 'all' || (key === 'sort' && value === 'latest')) {
        url.searchParams.delete(key)
      } else {
        url.searchParams.set(key, String(value))
      }
    })
    if (resetPage) url.searchParams.delete('page')
    const target = `${url.pathname}${url.search}`
    if (target === `${window.location.pathname}${window.location.search}`) return
    const link = document.createElement('a')
    link.href = target
    link.hidden = true
    root.appendChild(link)
    link.click()
    link.remove()
  }

  if (!list.__searchNavigationBound) {
    list.__searchNavigationBound = true
    list.addEventListener('prototype:server-refresh', () => hydrateIntelligence(root))
    list.addEventListener('prototype:server-page', (event) => {
      navigate({ page: Math.max(1, Number(event.detail?.page || 1)) })
    })
    list.addEventListener('prototype:server-filter', (event) => {
      navigate({ type: event.detail?.eventType || 'all' }, true)
    })
    list.addEventListener('prototype:server-sort', (event) => {
      navigate({ sort: event.detail?.sort || 'latest' }, true)
    })
  }

  const parameters = new URLSearchParams({
    page: String(requestedPage),
    page_size: String(INTELLIGENCE_PAGE_SIZE),
    event_type: requestedType,
    sort: requestedSort,
  })
  if (searchQuery) parameters.set('q', searchQuery)
  let payload
  const timeout = window.setTimeout(() => request.controller.abort(), 30_000)
  try {
    payload = await requestSearch(`/api/events/search?${parameters}`, { refresh: background, signal: request.controller.signal })
  } catch (error) {
    if (current()) {
      list.inert = false
      list.setAttribute('aria-busy', 'false')
      if (pagination) pagination.inert = false
      const message = error.name === 'AbortError' ? 'Request timeouts' : error.message
      setDataState(root, 'error', `Query failed: ${message}. It will retry automatically, or you can submit the query again.`)
    }
    return
  } finally {
    window.clearTimeout(timeout)
    if (root.__intelligencePending === request) root.__intelligencePending = null
  }
  if (!current()) return
  const responseRevision = payload.revision || JSON.stringify(payload)
  if (background && list.__searchRevision === responseRevision && list.__searchParameters === String(parameters)) {
    list.setAttribute('aria-busy', 'false')
    setDataState(root, 'ready')
    return
  }
  const scrollPosition = { top: window.scrollY, left: window.scrollX, behavior: 'instant' }
  const events = (payload.items || []).filter((item) => eventType(item))
  list.dataset.serverTotal = String(payload.total || 0)
  list.dataset.serverPage = String(payload.page || 1)
  list.dataset.serverPageSize = String(payload.page_size || INTELLIGENCE_PAGE_SIZE)
  list.dataset.serverPageCount = String(payload.page_count || 1)
  if (Number(payload.page || 1) !== requestedPage) {
    const normalizedUrl = new URL(window.location.href)
    if (Number(payload.page || 1) > 1) normalizedUrl.searchParams.set('page', String(payload.page))
    else normalizedUrl.searchParams.delete('page')
    window.history.replaceState({}, '', `${normalizedUrl.pathname}${normalizedUrl.search}`)
  }
  renderIntelligenceItems(root, events, payload.counts || {})
  if (empty) empty.hidden = events.length > 0
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  const recent = events.filter((item) => {
    const timestamp = new Date(item.updatedTimeRaw || item.updated_time_raw || item.disclosureTimeRaw || item.disclosure_time_raw || 0).getTime()
    return Number.isFinite(timestamp) && timestamp >= cutoff
  })
  const values = [
    recent.filter((item) => eventType(item) === 'ransomware').length,
    recent.filter((item) => eventType(item) === 'data-leak').length,
    recent.filter((item) => eventType(item) === 'vulnerability' && (item.is_exploited || item.isExploited)).length,
    new Set(recent.flatMap((item) => [item.victim, item.attacker, item.vendor]).filter(Boolean)).size,
  ]
  queryAll(root, '.intel-corpus-item b').forEach((node, index) => { node.textContent = number(values[index]) })
  list.dataset.loaded = 'true'
  list.__searchRevision = responseRevision
  list.__searchParameters = String(parameters)
  list.inert = false
  list.setAttribute('aria-busy', 'false')
  if (pagination) pagination.inert = false
  setDataState(root, 'ready')
  if (background) window.scrollTo(scrollPosition)
}

async function hydrateRansomware(root, state) {
  const table = clearTable(root, '#ransomware-table')
  const payload = await requestJson(`/api/intelligence/ransomware?limit=${PAGE_EVENT_LIMIT}`)
  const items = payload.ransomwareEvents || []
  replaceFilterOptions(
    root,
    '[data-filter-target="ransomware-table"][data-filter-key="industry"]',
    'All industries',
    items.map((item) => item.industry).filter(Boolean),
  )
  const stageOf = (item) => {
    const stage = String(`${item.category || ''} ${item.title || ''}`).toLowerCase()
    if (/Publish|Public|published|released|leak/.test(stage)) return { key: 'published', label: item.category || 'Published', tone: 'critical' }
    if (/Countdown|Negotiat|countdown|negotiat/.test(stage)) return { key: 'countdown', label: item.category || 'Countdown', tone: 'high' }
    return { key: 'disclosed', label: item.category || 'Newly disclosed', tone: '' }
  }
  replaceRows(table, items, (row, item) => {
    const cells = queryAll(row, 'td')
    const stage = stageOf(item)
    row.dataset.category = stage.key
    row.dataset.industry = item.industry || ''
    setCell(cells[0], formatDate(item.disclosureTimeRaw || item.disclosureDate))
    setCell(cells[1], item.victim || item.title, item.title)
    setCell(cells[2], item.attacker || item.sourceSite)
    setBadgeCell(cells[3], stage.label, stage.tone)
    setCell(cells[4], item.industry)
    setCell(cells[5], item.region || item.country)
    setActionCell(cells[6], 'View', detailHref(item))
  })
  const actorCounts = new Map()
  for (const actor of payload.ransomwareActorRanking || []) {
    const name = String(actor.name || '').trim()
    if (!name) continue
    const key = name.toLocaleLowerCase()
    const current = actorCounts.get(key) || { name, value: 0 }
    current.value += Number(actor.value || 0)
    actorCounts.set(key, current)
  }
  const actors = [...actorCounts.values()].sort((a, b) => b.value - a.value).slice(0, 4)
  const actorRows = queryAll(root, '.actor-rank')
  setText(root, '.actor-focus .panel-header .meta', `${number(items.length)} total`)
  actorRows.forEach((row, index) => {
    const item = actors[index]
    row.hidden = !item
    if (!item) return
    setText(row, 'b', String(index + 1).padStart(2, '0'))
    setText(row, 'strong', item.name)
    setText(row, 'span', `${number(item.value)}  · share ${Math.round(item.value / Math.max(1, items.length) * 100)}%`)
    query(row, 'i')?.style.setProperty('--score', `${Math.round(item.value / Math.max(1, actors[0].value) * 100)}%`)
  })
  if (!actors.length && actorRows[0]) {
    actorRows[0].hidden = false
    setText(actorRows[0], 'b', '—')
    setText(actorRows[0], 'strong', 'No group statistics yet')
    setText(actorRows[0], 'span', 'No ransomware records with group fields have been synced yet')
    query(actorRows[0], 'i')?.style.setProperty('--score', '0%')
  }
  queryAll(root, '.timeline-feed li').forEach((row, index) => {
    const item = items[index]
    row.hidden = !item
    if (!item) return
    setText(row, 'time', formatDate(item.updatedTimeRaw || item.disclosureTimeRaw))
    setText(row, 'strong', item.title)
    setText(row, 'span', item.category || item.region || '—')
  })
  setText(root, '.action-feed .pulse-label', 'API data')
  markExports(root, state, ['#ransomware-table'])
}

function leakSource(item) {
  const raw = String(item.raw_source_type || item.event_type || item.sourceSite || '').toLowerCase()
  if (/telegram|chat|instant/.test(raw)) return 'chat'
  if (/victim|ransom|Ransomware/.test(raw)) return 'ransom'
  if (/forum|Forum/.test(raw)) return 'forum'
  return 'public'
}

async function hydrateDataLeak(root, state) {
  const table = clearTable(root, '#data-leak-table')
  const payload = await requestJson(`/api/intelligence/data-leak?limit=${PAGE_EVENT_LIMIT}`)
  const items = payload.dataLeakEvents || []
  replaceFilterOptions(root, '[data-filter-target="data-leak-table"][data-filter-key="classification"]', 'All event categories', items.map((item) => item.category).filter(Boolean))
  replaceFilterOptions(root, '[data-filter-target="data-leak-table"][data-filter-key="attacker"]', 'All threat actors', items.map((item) => item.attacker || item.sourceSite || 'Not disclosed'))
  replaceFilterOptions(root, '[data-filter-target="data-leak-table"][data-filter-key="industry"]', 'All industries', items.map((item) => item.industry).filter(Boolean))
  replaceRows(table, items, (row, item) => {
    const cells = queryAll(row, 'td')
    const disclosedAt = item.disclosureTimeRaw || item.disclosureDate
    const updatedAt = item.updatedTimeRaw || item.updated_time_raw || disclosedAt
    const classification = item.category || 'Uncategorized'
    const attacker = item.attacker || item.sourceSite || 'Not disclosed'
    row.dataset.discoveredAt = disclosedAt || updatedAt || ''
    row.dataset.classification = classification
    row.dataset.attacker = attacker
    row.dataset.industry = item.industry || ''
    row.dataset.source = leakSource(item)
    setCell(cells[0], formatFullDate(disclosedAt))
    setCell(cells[1], formatFullDate(updatedAt, true))
    setCell(cells[2], item.title || item.victim || 'Untitled event')
    setCell(cells[3], classification)
    setCell(cells[4], attacker)
    setCell(cells[5], item.industry || '—')
    setActionCell(cells[6], 'View', detailHref(item))
  })
  const sourceRows = queryAll(root, '.source-row')
  const sourceKeys = ['forum', 'chat', 'ransom', 'public']
  const recentItems = filterByDays(items, 1)
  setText(root, '.source-monitor .panel-header .meta', 'Last 24 hours')
  sourceRows.forEach((button, index) => {
    const key = sourceKeys[index]
    const sourceItems = recentItems.filter((item) => leakSource(item) === key)
    const count = sourceItems.length
    const trusted = sourceItems.filter((item) => Number(item.confidenceScore || item.confidence_score || 0) >= 70).length
    const total = Math.max(1, recentItems.length)
    setText(button, 'small', `${number(count)}  records · trusted ${number(trusted)}`)
    setText(button, 'b', `${Math.round(count / total * 100)}%`)
    button.dataset.runtimeSource = key
    setActionAvailable(button, true)
  })
  state.sourceTable = table
  const activeSource = query(root, '.source-row.active')?.dataset.runtimeSource
  if (activeSource) {
    table.dataset.activeTab = activeSource
    table.dispatchEvent(new CustomEvent('prototype:rows-updated'))
  }
  markExports(root, state, ['#data-leak-table'])
}

async function hydrateVulnerabilities(root, state) {
  const table = clearTable(root, '#vulnerability-table')
  const days = Number(state.vulnerabilityDays || 7)
  state.vulnerabilityDays = days
  const items = await requestJson(`/api/vulnerabilities?limit=500&days=${days}`)
  replaceFilterOptions(
    root,
    '[data-filter-target="vulnerability-table"][data-filter-key="industry"]',
    'All industries',
    items.map((item) => item.industry).filter(Boolean),
  )
  const severe = items.filter((item) => Number(item.cvss || 0) >= 9).length
  const exploited = items.filter((item) => item.isExploited || item.is_exploited).length
  const patched = items.filter((item) => item.patchAvailable || item.patch_available).length
  setCounts(query(root, '.vuln-intel-kpis'), [items.length, severe, exploited, patched])
  replaceRows(table, items, (row, item) => {
    const cells = queryAll(row, 'td')
    const severity = severityOf(item)
    row.dataset.category = severity
    row.dataset.severity = severity
    row.dataset.industry = item.industry || ''
    setCell(cells[0], formatDate(item.disclosureTimeRaw || item.disclosure_time_raw || item.disclosureDate, false))
    setCell(cells[1], item.cveId || item.cve_id || item.id, item.title)
    setCell(cells[2], item.vendor, item.product)
    setCell(cells[3], item.industry)
    setCell(cells[4], item.cvss ?? '—')
    setBadgeCell(cells[5], item.isExploited || item.is_exploited ? 'Exploited' : 'Unconfirmed', item.isExploited || item.is_exploited ? 'critical' : '')
    setCell(cells[6], item.patchAvailable || item.patch_available ? 'Available' : 'None')
    setActionCell(cells[7], 'View', detailHref(item))
  })
  const severityCounts = ['critical', 'high', 'medium', 'low'].map((key) => ({ name: severityLabel(key), value: items.filter((item) => severityOf(item) === key).length }))
  setText(root, '.severity-donut strong', number(items.length))
  setText(root, '.severity-donut-card .meta', `${number(items.length)} records`)
  fillNamedRows(query(root, '.severity-legend'), severityCounts)
  setConicChart(query(root, '.severity-donut'), severityCounts.map((item) => item.value), ['var(--danger)', 'var(--warning)', 'var(--accent)', 'var(--secondary)'])
  fillNamedRows(query(root, '.vendor-bars'), countBy(items, (item) => item.vendor).slice(0, 5))
  const industry = countBy(items, (item) => item.industry).slice(0, 5)
  queryAll(root, '.industry-block').forEach((button, index) => {
    const item = industry[index]
    button.hidden = !item
    if (!item) return
    setText(button, 'strong', item.name)
    setText(button, 'span', number(item.value))
    button.dataset.runtimeFilter = '[data-table-search="vulnerability-table"]'
    button.dataset.runtimeFilterValue = item.name
    button.removeAttribute('data-toast')
    setActionAvailable(button, true)
  })
  const products = countBy(items, (item) => item.product).slice(0, 5)
  queryAll(root, '.product-bubble').forEach((button, index) => {
    const item = products[index]
    button.hidden = !item
    if (!item) return
    setText(button, 'strong', item.name)
    setText(button, 'span', number(item.value))
    button.dataset.runtimeFilter = '[data-table-search="vulnerability-table"]'
    button.dataset.runtimeFilterValue = item.name
    button.removeAttribute('data-toast')
    setActionAvailable(button, true)
  })
  setText(root, '.ring-kev strong', exploited)
  setConicChart(query(root, '.ring-kev'), [exploited, Math.max(0, items.length - exploited)], ['var(--danger)', 'var(--bg)'])
  setText(root, '.ring-poc strong', '—')
  setConicChart(query(root, '.ring-poc'), [], ['var(--warning)'])
  const signalRows = queryAll(root, '.signal-source-list > div')
  const signalValues = [
    ['Exploitation confirmed', number(exploited)],
    ['Patch available', number(patched)],
    ['PoC Data', '—'],
  ]
  signalRows.forEach((row, index) => {
    const item = signalValues[index]
    row.hidden = !item
    if (!item) return
    setText(row, 'span', item[0])
    setText(row, 'b', item[1])
  })

  const trend = buildDailyTrend(items, days)
  const values = trend.map((item) => item.value)
  const points = chartPoints(values, { xStart: 34, xEnd: 700, yTop: 35, yBottom: 185 })
  query(root, '.vuln-line-path')?.setAttribute('d', linePath(points))
  query(root, '.vuln-area-path')?.setAttribute('d', areaPath(points, 205))
  const markerPoints = evenlySample(points, queryAll(root, '.vuln-points circle').length)
  setChartMarkers(query(root, '.vuln-points'), 'circle', markerPoints, (circle, point) => {
    circle.setAttribute('cx', point.x.toFixed(1))
    circle.setAttribute('cy', point.y.toFixed(1))
  })
  setChartMarkers(query(root, '.vuln-chart-values'), 'text', markerPoints, (node, point) => {
    node.textContent = number(point.value)
    node.setAttribute('x', point.x.toFixed(1))
    node.setAttribute('y', Math.max(20, point.y - 10).toFixed(1))
  })
  const sampledTrend = evenlySample(trend, queryAll(root, '.chart-labels text').length)
  queryAll(root, '.chart-labels text').forEach((node, index) => {
    const point = markerPoints[index]
    const item = sampledTrend[index]
    node.hidden = !item
    if (!item) return
    node.textContent = item.date.slice(5)
    node.setAttribute('x', point.x.toFixed(1))
  })
  setText(root, '.vuln-trend-card .trend-summary strong', number(items.length))
  setText(root, '.vuln-trend-card .panel-header .meta', `Last ${days} days`)
  const chart = query(root, '.vuln-trend-chart')
  if (chart) chart.setAttribute('aria-label', `Live vulnerability disclosure trend for the last ${days} days, ${items.length} in total`)

  const periodButtons = queryAll(root, '[data-od-id="vulnerability-action-section"] .page-actions button')
  periodButtons.forEach((button) => {
    const buttonDays = button.textContent.includes('Today') ? 1 : button.textContent.includes('30') ? 30 : 7
    button.classList.toggle('btn-primary', buttonDays === days)
    button.classList.toggle('btn-secondary', buttonDays !== days)
    if (button.dataset.runtimePeriodBound) return
    button.dataset.runtimePeriodBound = '1'
    button.addEventListener('click', async () => {
      state.vulnerabilityDays = buttonDays
      setDataState(root, 'loading', 'Refreshing live vulnerability data for the statistics period…')
      try {
        await hydrateVulnerabilities(root, state)
        setDataState(root, 'ready')
      } catch (error) {
        showLoadError(root, error)
      }
    })
  })
  state.refresh = () => hydrateVulnerabilities(root, state)
  markExports(root, state, ['#vulnerability-table'])
}

function fillDistribution(container, items, total, percentage = false) {
  if (!container) return
  const rows = [...container.children]
  rows.forEach((row, index) => {
    const item = items[index]
    row.hidden = !item
    if (!item) return
    const labels = queryAll(row, 'span')
    const name = labels[labels.length - 1]
    if (name) name.textContent = item.name || item.label || item.key
    const value = query(row, 'b, strong')
    if (value) value.textContent = percentage ? `${Math.round(item.value / Math.max(1, total) * 100)}%` : number(item.value)
  })
}

function renderMonitorTrend(surface, trendItems) {
  const trend = (trendItems || []).map((item) => ({ date: String(item.date || ''), value: Number(item.value || 0) }))
  const values = trend.map((item) => item.value)
  const points = chartPoints(values, { xStart: 42, xEnd: 718, yTop: 30, yBottom: 184 })
  query(surface, '.monitor-line')?.setAttribute('d', linePath(points))
  query(surface, '.monitor-area')?.setAttribute('d', areaPath(points, 184))
  setChartMarkers(query(surface, '.monitor-points'), 'circle', points, (circle, point) => {
    circle.setAttribute('cx', point.x.toFixed(1))
    circle.setAttribute('cy', point.y.toFixed(1))
  })
  setChartMarkers(query(surface, '.monitor-columns'), 'rect', points, (rect, point) => {
    rect.setAttribute('x', (point.x - 15).toFixed(1))
    rect.setAttribute('y', point.y.toFixed(1))
    rect.setAttribute('width', '30')
    rect.setAttribute('height', Math.max(0, 184 - point.y).toFixed(1))
  })
  queryAll(surface, '.monitor-chart-values text').forEach((node, index) => {
    const point = points[index]
    node.hidden = !point
    if (!point) return
    node.textContent = number(point.value)
    node.setAttribute('x', Math.min(718, Math.max(42, point.x)).toFixed(1))
    node.setAttribute('y', Math.max(18, point.y - 12).toFixed(1))
  })
  queryAll(surface, '.monitor-chart-dates text').forEach((node, index) => {
    const item = trend[index]
    const point = points[index]
    node.hidden = !item
    if (!item) return
    node.textContent = item.date.slice(5) || '—'
    node.setAttribute('x', Math.min(718, Math.max(42, point.x)).toFixed(1))
  })
  const peakValue = values.length ? Math.max(...values) : 0
  const peakIndex = peakValue > 0 ? values.indexOf(peakValue) : -1
  const peakPoint = points[peakIndex]
  const peak = query(surface, '.monitor-peak-ring')
  if (peak) {
    peak.style.opacity = peakPoint ? '1' : '0'
    if (peakPoint) {
      peak.setAttribute('cx', peakPoint.x.toFixed(1))
      peak.setAttribute('cy', peakPoint.y.toFixed(1))
    }
  }
  const total = values.reduce((sum, value) => sum + value, 0)
  const average = values.length ? Math.round(total / values.length) : 0
  const first = values[0] || 0
  const last = values.at(-1) || 0
  const change = first > 0 ? (last - first) / first * 100 : null
  const summaryCards = queryAll(surface, '.monitor-trend-summary > div')
  const summaryValues = [number(total), number(average), number(peakValue), change == null ? '—' : `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`]
  summaryCards.forEach((card, index) => {
    setText(card, 'strong', summaryValues[index])
    if (index === 2) setText(card, 'small', trend[peakIndex]?.date?.slice(5) || '—')
    if (index === 3) {
      const value = query(card, 'strong')
      value?.classList.toggle('is-up', change != null && change > 0)
      value?.classList.toggle('is-down', change != null && change < 0)
    }
  })
  const chart = query(surface, '.monitor-trend-chart')
  if (chart) chart.setAttribute('aria-label', `Live monitoring trend for the last seven days: ${total} in total, peak ${peakValue}`)
}

function renderCodeTrend(root, trendItems) {
  const trend = (trendItems || []).map((item) => ({ date: String(item.date || ''), value: Number(item.value || 0) }))
  const points = chartPoints(trend.map((item) => item.value), { xStart: 42, xEnd: 678, yTop: 36, yBottom: 180 })
  query(root, '.code-line')?.setAttribute('d', linePath(points))
  setChartMarkers(query(root, '.code-dots'), 'circle', points, (circle, point) => {
    circle.setAttribute('cx', point.x.toFixed(1))
    circle.setAttribute('cy', point.y.toFixed(1))
  })
  queryAll(root, '.code-chart-values text').forEach((node, index) => {
    const point = points[index]
    node.hidden = !point
    if (!point) return
    node.textContent = number(point.value)
    node.setAttribute('x', point.x.toFixed(1))
    node.setAttribute('y', Math.max(18, point.y - 14).toFixed(1))
  })
  queryAll(root, '.code-chart-dates text').forEach((node, index) => {
    const item = trend[index]
    const point = points[index]
    node.hidden = !item
    if (!item) return
    node.textContent = item.date.slice(5) || '—'
    node.setAttribute('x', point.x.toFixed(1))
  })
  const chart = query(root, '.code-trend-chart')
  if (chart) chart.setAttribute('aria-label', `Live code monitoring trend for the last seven days, total ${trend.reduce((sum, item) => sum + item.value, 0)} records`)
}

function accessStatusMeta(item) {
  const state = String(item?.accessState || '').toLowerCase()
  const label = item?.accessStateLabel || item?.reviewStatusLabel || reviewStatusLabel(item?.reviewStatus)
  if (['removed', 'forbidden', 'invalid'].includes(state)) return { label, className: 'result-status expired' }
  if (['captcha', 'login_required', 'rate_limited', 'unknown'].includes(state)) return { label, className: 'result-status pending' }
  if (state === 'public') return { label, className: 'result-status active' }
  return { label, className: 'result-status processing' }
}

const DOCUMENT_HIT_PAGE_SIZE = 20

function documentHitPageUrl(root, source, page) {
  const surface = query(root, `.${source === 'netdisk' ? 'netdisk' : 'library'}-surface`)
  const params = new URLSearchParams({
    source_family: source === 'netdisk' ? 'netdisk_aggregator' : 'document_library',
    offset: String((page - 1) * DOCUMENT_HIT_PAGE_SIZE),
    limit: String(DOCUMENT_HIT_PAGE_SIZE),
  })
  queryAll(surface, '[data-document-hit-filter]').forEach((control) => {
    const key = control.dataset.documentHitFilter
    const value = String(control.value || '').trim()
    if (!value) return
    if (key === 'recent_days') params.set('recent_hours', String(Math.max(1, Number(value)) * 24))
    else params.set(key, value)
  })
  return `/api/document-exposures/page?${params.toString()}`
}

async function reloadDocumentMonitoringData(root, state, source, pageState) {
  if (pageState.loading) return
  pageState.loading = true
  const sourceFamily = source === 'netdisk' ? 'netdisk_aggregator' : 'document_library'
  const tableSelector = source === 'netdisk' ? '#netdisk-table' : '#library-table'
  const table = clearTable(root, tableSelector)
  const surface = query(root, `.${source === 'netdisk' ? 'netdisk' : 'library'}-surface`)
  try {
    const [summary, pagePayload] = await Promise.all([
      pageState.summary || requestJson(`/api/document-exposures/summary?source_family=${sourceFamily}`),
      requestJson(documentHitPageUrl(root, source, pageState.page)),
    ])
    pageState.summary = summary
    const items = pagePayload.items || []
    setCodeServerPage(table, pagePayload)
    replaceFilterOptions(
      root,
      `[data-filter-target="${source === 'netdisk' ? 'netdisk-table' : 'library-table'}"][data-filter-key="${source === 'netdisk' ? 'platform' : 'source'}"]`,
      source === 'netdisk' ? 'All platforms' : 'All sources',
      summary.platformOptions || [],
    )
    const kpis = source === 'netdisk'
      ? [summary.totalHits, summary.highRiskCount, summary.passwordShareCount, summary.invalidCount]
      : [summary.publicCount, summary.totalHits, summary.highRiskCount, summary.recentCount]
    setCounts(query(surface, '.monitor-kpi-grid'), kpis)
    replaceRows(table, items, (row, item) => {
      const cells = queryAll(row, 'td')
      const severity = severityOf(item)
      row.dataset.platform = item.platform
      if (source === 'library') row.dataset.source = item.platform
      row.dataset.severity = severity
      row.dataset.discoveredAt = item.lastSeenAt || item.firstSeenAt || ''
      if (source === 'netdisk') {
        setCell(cells[0], item.primaryFileName || item.title)
        setDocumentSourceCell(cells[1], item.platform, item.platformLabel)
        setClassTextCell(cells[2], item.shareCode ? 'Password-protected share' : 'Public share', `share-type ${item.shareCode ? 'password' : 'public'}`)
        setCell(cells[3], item.shareCode || '—')
        setCell(cells[4], item.primaryFileSize || '—')
        setCell(cells[5], (item.matchedTerms || []).map((term) => term.term).join(', '))
        setBadgeCell(cells[6], severityLabel(severity), severity)
        setCell(cells[7], formatDate(item.lastSeenAt || item.firstSeenAt))
        const status = accessStatusMeta(item)
        setClassTextCell(cells[8], status.label, status.className)
        setActionCell(cells[9], 'View', `/document-exposure/detail/netdisk_aggregator/${encodeURIComponent(item.id)}`)
      } else {
        setDocumentTitleCell(cells[0], item.title, item.primaryFileType)
        setDocumentSourceCell(cells[1], item.platform, item.platformLabel)
        setCell(cells[2], item.primaryFileType || '—')
        setCell(cells[3], '—')
        setCell(cells[4], (item.matchedTerms || []).map((term) => term.term).join(', '))
        setCell(cells[5], item.shareOwner || '—')
        setBadgeCell(cells[6], severityLabel(severity), severity)
        setCell(cells[7], formatDate(item.lastSeenAt || item.firstSeenAt))
        const review = item.reviewStatusLabel || reviewStatusLabel(item.reviewStatus)
        const access = item.accessStateLabel || ''
        setResultStatusCell(cells[8], [review, access && access !== review ? access : ''].filter(Boolean).join(' · '))
        setActionCell(cells[9], 'Details', `/document-exposure/detail/document_library/${encodeURIComponent(item.id)}`)
      }
    })
    setText(surface, '.monitor-donut strong', number(summary.totalHits))
    setText(surface, '.monitor-donut-card .meta', `Total ${number(summary.totalHits)}`)
    const distribution = summary.platformDistribution || []
    fillSourceDistribution(query(surface, '.monitor-donut-legend'), distribution, summary.totalHits, source === 'library')
    setConicChart(query(surface, '.monitor-donut'), distribution.map((item) => item.value), ['var(--accent)', 'var(--warning)', 'var(--secondary)', 'var(--success)', 'var(--violet)'])
    renderMonitorTrend(surface, summary.trend || [])
    markExports(surface, state, [tableSelector])
    if (source === 'library') {
      const batchReview = queryAll(surface, 'button[data-toast]').find((button) => button.textContent.includes('Batch review'))
      if (batchReview) setActionAvailable(batchReview, false, 'The backend does not provide a batch review API')
    }
  } finally {
    pageState.loading = false
  }
}

function setupDocumentMonitoringFilters(root, source, pageState, reload) {
  const surface = query(root, `.${source === 'netdisk' ? 'netdisk' : 'library'}-surface`)
  let searchTimer = null
  queryAll(surface, '[data-document-hit-filter]').forEach((control) => {
    const eventName = control.dataset.documentHitFilter === 'query' ? 'input' : 'change'
    control.addEventListener(eventName, () => {
      window.clearTimeout(searchTimer)
      searchTimer = window.setTimeout(() => {
        pageState.page = 1
        reload()
      }, eventName === 'input' ? 300 : 0)
    })
  })
  const table = query(root, source === 'netdisk' ? '#netdisk-table' : '#library-table')
  table?.addEventListener('prototype:server-page', (event) => {
    pageState.page = Math.max(1, Number(event.detail?.page || 1))
    reload()
  })
}

async function hydrateDocumentMonitoring(root, state, source) {
  const pageState = { page: 1, loading: false, summary: null }
  const reload = () => reloadDocumentMonitoringData(root, state, source, pageState)
  setupDocumentMonitoringFilters(root, source, pageState, reload)
  await reload()
}

const CODE_CONTINUOUS_INTERVAL_SECONDS = 3600
const CODE_HIT_PAGE_SIZE = 20

function renderCodeContinuousStatus(root, status = {}, errorMessage = '') {
  const stateNode = query(root, '[data-code-scan-state]')
  const toggle = query(root, '[data-code-scan-toggle]')
  const lastSuccess = query(root, '[data-code-scan-last-success]')
  const result = query(root, '[data-code-scan-result]')
  const evidence = query(root, '[data-code-scan-evidence]')
  const error = query(root, '[data-code-scan-error]')
  const enabled = Boolean(status.enabled)
  const running = Boolean(status.running)
  const configurationMissing = Boolean(status.configuration_missing)

  if (stateNode) {
    stateNode.textContent = configurationMissing ? 'To be configured' : errorMessage ? 'Status error' : running ? 'Scanning' : enabled ? 'Running' : 'Not started'
    stateNode.className = `badge ${configurationMissing ? 'badge-info' : errorMessage ? 'badge-high' : enabled ? 'badge-success' : 'badge-info'}`
  }
  if (lastSuccess) lastSuccess.textContent = status.last_success_at ? formatDate(status.last_success_at) : 'None'
  if (result) result.textContent = `Main ${number(status.new_primary_hit_count)} / Suppressed ${number(status.new_suppressed_hit_count)} / Updated ${number(status.updated_hit_count)}`
  if (evidence) evidence.textContent = `Sensitive ${number(status.new_sensitive_hit_count)} / Leads ${number(status.new_clue_hit_count)}`
  if (toggle) {
    toggle.dataset.enabled = enabled ? '1' : '0'
    toggle.textContent = configurationMissing ? 'Configure first' : enabled ? 'Stop scan' : 'Start scan'
    toggle.classList.toggle('btn-primary', !enabled)
    toggle.classList.toggle('btn-danger', enabled)
  }
  if (error) {
    const message = errorMessage || status.last_error || ''
    error.textContent = message
    error.hidden = !message
  }
}

async function setupCodeContinuousScan(root, watchlists = [], onScanCompleted = null) {
  const panel = query(root, '[data-code-scan-panel]')
  const select = query(root, '[data-code-scan-watchlist]')
  const toggle = query(root, '[data-code-scan-toggle]')
  if (!panel || !select || !toggle) return
  window.clearInterval(root.__codeContinuousStatusTimer)
  root.__codeContinuousStatusTimer = null

  const enabledWatchlists = watchlists.filter((item) => item.enabled !== false)
  select.replaceChildren(...enabledWatchlists.map((item) => new Option(item.name || `Monitoring target ${item.id}`, String(item.id))))
  if (!enabledWatchlists.length) {
    select.replaceChildren(new Option('Configure a monitoring target first', ''))
    toggle.disabled = true
    renderCodeContinuousStatus(root, { configuration_missing: true }, 'Create and enable a code monitoring target in the settings center first.')
    return
  }

  let loading = false
  const lastSuccessByWatchlist = new Map()
  const refreshStatus = async (preferredStatus = null) => {
    const watchlistId = Number(select.value || 0)
    if (!watchlistId || loading) return
    try {
      const status = preferredStatus || await requestJson(`/api/code-monitoring/continuous-status?watchlist_id=${encodeURIComponent(watchlistId)}`)
      renderCodeContinuousStatus(root, status)
      const currentSuccess = String(status.last_success_at || '')
      const hadBaseline = lastSuccessByWatchlist.has(watchlistId)
      const previousSuccess = lastSuccessByWatchlist.get(watchlistId) || ''
      lastSuccessByWatchlist.set(watchlistId, currentSuccess)
      if (hadBaseline && currentSuccess && previousSuccess !== currentSuccess && onScanCompleted) {
        await onScanCompleted()
      }
    } catch (error) {
      renderCodeContinuousStatus(root, {}, error.message || 'Failed to load long-running scan status')
    } finally {
      toggle.disabled = false
    }
  }

  try {
    const activeStatus = await requestJson('/api/code-monitoring/continuous-status')
    const activeId = Number(activeStatus.target_watchlist_id || 0)
    if (activeId && enabledWatchlists.some((item) => Number(item.id) === activeId)) select.value = String(activeId)
    await refreshStatus(activeId === Number(select.value) ? activeStatus : null)
  } catch (error) {
    renderCodeContinuousStatus(root, {}, error.message || 'Failed to load long-running scan status')
    toggle.disabled = false
  }

  if (!root.isConnected) return
  select.addEventListener('change', () => { refreshStatus() })
  toggle.addEventListener('click', async () => {
    const watchlistId = Number(select.value || 0)
    if (!watchlistId || loading) return
    loading = true
    toggle.disabled = true
    toggle.textContent = toggle.dataset.enabled === '1' ? 'Stopping…' : 'Starting…'
    try {
      const enabled = toggle.dataset.enabled === '1'
      const endpoint = enabled ? '/api/code-monitoring/continuous/stop' : '/api/code-monitoring/continuous/start'
      const status = await requestJson(endpoint, {
        method: 'POST',
        body: JSON.stringify(enabled
          ? { watchlist_id: watchlistId }
          : { watchlist_id: watchlistId, interval_seconds: CODE_CONTINUOUS_INTERVAL_SECONDS }),
      })
      renderCodeContinuousStatus(root, status)
      showToast(status.message || (enabled ? 'Long-running scan stopped' : 'Long-running scan started'))
    } catch (error) {
      renderCodeContinuousStatus(root, { enabled: toggle.dataset.enabled === '1' }, error.message || 'Long-running scan operation failed')
    } finally {
      loading = false
      toggle.disabled = false
    }
  })

  root.__codeContinuousStatusTimer = window.setInterval(() => {
    if (!root.isConnected || !query(root, '[data-code-scan-panel]')) {
      window.clearInterval(root.__codeContinuousStatusTimer)
      root.__codeContinuousStatusTimer = null
      return
    }
    refreshStatus()
  }, 15_000)
}

function codeHitPageUrl(root, codeState, bucket) {
  const params = new URLSearchParams({
    bucket,
    offset: String((codeState.pages[bucket] - 1) * CODE_HIT_PAGE_SIZE),
    limit: String(CODE_HIT_PAGE_SIZE),
  })
  queryAll(root, '[data-code-hit-filter]').forEach((control) => {
    const value = String(control.value || '').trim()
    if (value) params.set(control.dataset.codeHitFilter, value)
  })
  return `/api/code-monitoring/hits/page?${params.toString()}`
}

async function exportCodeHits(root, state, button) {
  if (state.codeExportPending) return
  state.codeExportPending = true
  const controls = queryAll(root, '[data-runtime-code-export]').map((control) => ({
    control, disabled: control.disabled, text: control.textContent,
  }))
  controls.forEach(({ control }) => { control.disabled = true })
  button.textContent = 'Exporting…'
  try {
    const clickedAt = Date.now()
    const bucket = button.dataset.runtimeCodeExport
    const params = new URLSearchParams({ bucket })
    queryAll(root, '[data-code-hit-filter]').forEach((control) => {
      const value = String(control.value || '').trim()
      if (value) params.set(control.dataset.codeHitFilter, value)
    })
    const signal = root.__dataRuntimeAbort?.signal
    const payload = await requestJson(`/api/code-monitoring/hits/export?${params}`, { signal })
    const items = payload?.items
    if (!Array.isArray(items) || !Number.isSafeInteger(payload.total) || payload.total !== items.length) {
      throw new Error('Exported data is incomplete; please try again')
    }
    const ids = new Set()
    items.forEach((item) => {
      const id = String(item?.id ?? '')
      if (!id || ids.has(id)) throw new Error('Exported results contain duplicates or missing identifiers; please try again')
      ids.add(id)
    })
    if (signal?.aborted || !root.isConnected) throw new Error('Page changed; export cancelled')
    const headers = ['Records ID', 'Monitoring target', 'Organization', 'Result group', 'Suppressed', 'Suppression reason', 'Source platform',
      'Repository name', 'Branch', 'File path', 'Code link', 'Repository link', 'Sensitive types', 'Matched search terms', 'Hit layer',
      'Risk level', 'Review status', 'First seen', 'Last seen', 'Detail link']
    const rows = items.map((item) => {
      const suppressed = Boolean(item.suppressed) || item.displayBucket === 'suppressed'
      const repositoryUrl = /^https?:\/\//i.test(item.repositoryUrl || '') ? item.repositoryUrl.trim() : ''
      const fileUrl = /^https?:\/\//i.test(item.fileUrl || '') ? item.fileUrl.trim() : ''
      const repositoryPage = fileUrl.split(/[?#]/)[0].replace(/\/+$/, '') === repositoryUrl.split(/[?#]/)[0].replace(/\/+$/, '')
      return [item.id, item.watchlistName, item.organizationName, suppressed ? 'Suppressed leads' : 'Main list',
        suppressed ? 'Yes' : 'No', (item.suppressionReasons || []).join('; '), item.platformLabel || item.platform,
        item.repositoryFullName || item.repositoryName, item.branch, item.filePath, repositoryPage ? '' : fileUrl,
        repositoryUrl, item.sensitiveLabel || item.sensitiveType, item.matchedTerm,
        item.resultLayerLabel || item.resultLayer, severityLabel(severityOf(item)), reviewStatusLabel(item.reviewStatus),
        item.firstSeenAt || '', item.lastSeenAt || '',
        new URL(`/document-exposure/code-monitoring/detail/${encodeURIComponent(item.id)}`, window.location.origin).href]
    })
    const csvCell = (value) => {
      const text = String(value ?? '')
      const safe = /^[\s\uFEFF]*[=+\-@]|^[\t\r\n]/.test(text) ? `'${text}` : text
      return `"${safe.replaceAll('"', '""')}"`
    }
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `Code monitoring ${bucket === 'suppressed' ? 'Suppressed leads' : 'All results'}-${new Date(clickedAt).toISOString().replace(/[:.]/g, '-')}.csv`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    showToast(`Exported ${items.length} records ${bucket === 'suppressed' ? 'Suppressed leads' : 'Code monitoring results'}`)
  } finally {
    state.codeExportPending = false
    controls.forEach(({ control, disabled, text }) => {
      control.disabled = disabled
      control.textContent = text
    })
  }
}

function setCodeServerPage(table, payload) {
  if (!table) return
  const total = Math.max(0, Number(payload.total || 0))
  const limit = Math.max(1, Number(payload.limit || CODE_HIT_PAGE_SIZE))
  const offset = Math.max(0, Number(payload.offset || 0))
  table.dataset.serverPagination = 'true'
  table.dataset.serverTotal = String(total)
  table.dataset.serverPageSize = String(limit)
  table.dataset.serverPage = String(Math.floor(offset / limit) + 1)
  table.dataset.serverPageCount = String(Math.max(1, Math.ceil(total / limit)))
}

function fillPrimaryCodeRows(table, items) {
  replaceRows(table, items, (row, item) => {
    const cells = queryAll(row, 'td')
    const severity = severityOf(item)
    row.dataset.target = item.watchlistName || item.organizationName || ''
    row.dataset.platform = item.platform
    row.dataset.severity = severity === 'critical' ? 'high' : severity
    row.dataset.hit = item.resultLayer
    row.dataset.type = item.sensitiveType
    row.dataset.discoveredAt = item.firstSeenAt || ''
    setCell(cells[0], item.repositoryFullName || item.repositoryName)
    setDocumentSourceCell(cells[1], item.platform, item.platformLabel)
    setCell(cells[2], item.filePath)
    if (cells[2]) cells[2].title = item.filePath || ''
    setCell(cells[3], item.sensitiveLabel)
    setCell(cells[4], item.matchedTerm)
    setClassTextCell(cells[5], item.resultLayerLabel, `hit-level ${item.resultLayer || ''}`)
    setBadgeCell(cells[6], severityLabel(severity), severity)
    setCell(cells[7], formatDate(item.firstSeenAt))
    setCell(cells[8], reviewStatusLabel(item.reviewStatus))
    setActionCell(cells[9], 'Details', `/document-exposure/code-monitoring/detail/${encodeURIComponent(item.id)}`)
  })
}

function fillSuppressedCodeRows(table, items) {
  if (!table) return
  replaceRows(table, items, (row, item) => {
    const cells = queryAll(row, 'td')
    row.dataset.target = item.watchlistName || item.organizationName || ''
    setCell(cells[0], item.repositoryFullName || item.repositoryName)
    row.dataset.discoveredAt = item.firstSeenAt || ''
    setDocumentSourceCell(cells[1], item.platform, item.platformLabel)
    setCell(cells[2], item.filePath)
    if (cells[2]) cells[2].title = item.filePath || ''
    setCell(cells[3], item.matchedTerm)
    setCell(cells[4], item.resultLayerLabel)
    const suppressionReason = (item.suppressionReasons || []).join('; ') || 'Rule suppression'
    setCell(cells[5], suppressionReason)
    if (cells[5]) cells[5].title = suppressionReason
    setBadgeCell(cells[6], severityLabel(severityOf(item)), severityOf(item))
    setCell(cells[7], formatDate(item.firstSeenAt))
    setCell(cells[8], reviewStatusLabel(item.reviewStatus))
    setActionCell(cells[9], 'Details', `/document-exposure/code-monitoring/detail/${encodeURIComponent(item.id)}`)
  })
}

async function reloadCodeMonitoringData(root, state, codeState, resetPages = false) {
  if (codeState.loading) return
  if (resetPages) codeState.pages = { primary: 1, suppressed: 1 }
  codeState.loading = true
  try {
    const [summary, primaryPage, suppressedPage] = await Promise.all([
      requestJson('/api/code-monitoring/summary'),
      requestJson(codeHitPageUrl(root, codeState, 'primary')),
      requestJson(codeHitPageUrl(root, codeState, 'suppressed')),
    ])
    const table = clearTable(root, '#code-table')
    const suppressedTable = clearTable(root, '#suppressed-code-table')
    setCodeServerPage(table, primaryPage)
    setCodeServerPage(suppressedTable, suppressedPage)
    fillPrimaryCodeRows(table, primaryPage.items || [])
    fillSuppressedCodeRows(suppressedTable, suppressedPage.items || [])
    const primaryCount = query(root, '[data-table-count="code-table"]')
    const suppressedCount = query(root, '[data-table-count="suppressed-code-table"]')
    if (primaryCount) primaryCount.textContent = number(primaryPage.total)
    if (suppressedCount) suppressedCount.textContent = number(suppressedPage.total)
    setCounts(query(root, '.code-kpi-layout'), [summary.publicRepositoryCount, summary.sensitiveSnippetCount, summary.clueHitCount, summary.highRiskRepositoryCount])
    fillSourceDistribution(query(root, '.code-source-grid'), summary.platformDistribution || [], summary.totalHits)
    const repositoryRisk = summary.repositoryRiskDistribution || []
    const repositoryCount = Number(summary.repositoryCount || 0)
    setText(root, '.code-risk-donut strong', number(repositoryCount))
    setText(root, '.code-risk-card .meta', `Total repositories ${number(repositoryCount)}`)
    fillDistribution(query(root, '.code-risk-legend'), repositoryRisk, repositoryCount, true)
    setConicChart(query(root, '.code-risk-donut'), repositoryRisk.map((item) => item.value), ['var(--danger)', 'var(--warning)', 'var(--secondary)'])
    fillNamedRows(query(root, '.code-secret-rank'), summary.sensitiveTypeTop || [])
    renderCodeTrend(root, summary.trend || [])
  } finally {
    codeState.loading = false
  }
}

function setupCodeHitFilters(root, codeState, reload) {
  let searchTimer = null
  queryAll(root, '[data-code-hit-filter]').forEach((control) => {
    const eventName = control.dataset.codeHitFilter === 'query' ? 'input' : 'change'
    control.addEventListener(eventName, () => {
      window.clearTimeout(searchTimer)
      searchTimer = window.setTimeout(() => { reload(true) }, eventName === 'input' ? 300 : 0)
    })
  })
  for (const [bucket, selector] of [['primary', '#code-table'], ['suppressed', '#suppressed-code-table']]) {
    query(root, selector)?.addEventListener('prototype:server-page', (event) => {
      codeState.pages[bucket] = Math.max(1, Number(event.detail?.page || 1))
      reload(false)
    })
  }
}

async function hydrateCodeMonitoring(root, state) {
  const codeState = { pages: { primary: 1, suppressed: 1 }, loading: false }
  const reload = (resetPages = false) => reloadCodeMonitoringData(root, state, codeState, resetPages)
  setupCodeHitFilters(root, codeState, reload)
  const [watchlistsPayload] = await Promise.all([
    requestJson('/api/code-monitoring/watchlists'),
    reload(false),
  ])
  const watchlists = Array.isArray(watchlistsPayload) ? watchlistsPayload : (watchlistsPayload.items || watchlistsPayload.watchlists || [])
  const watchlistFilter = query(root, '[data-code-hit-filter="watchlist_id"]')
  if (watchlistFilter) {
    watchlistFilter.replaceChildren(new Option('All monitoring targets', ''), ...watchlists.map((item) => new Option(item.name || `Monitoring target ${item.id}`, String(item.id))))
  }
  setupCodeContinuousScan(root, watchlists, () => reload(true)).catch((error) => {
    renderCodeContinuousStatus(root, {}, error.message || 'Failed to load long-running scan status')
  })
}

function replaceRecordContainer(container, lines) {
  if (!container) return
  const values = lines.length ? lines : ['The current record does not provide structured data']
  const template = container.firstElementChild?.cloneNode(true)
  if (!template) {
    container.textContent = values.join('; ')
    return
  }
  const rows = values.map((line, index) => {
    const row = template.cloneNode(true)
    const children = [...row.children]
    if (children[0]) children[0].textContent = index === 0 ? 'Live evidence' : `Evidence ${index + 1}`
    if (children[1]) children[1].textContent = String(line)
    if (children[2]) children[2].textContent = ''
    if (!children.length) row.textContent = String(line)
    return row
  })
  container.replaceChildren(...rows)
}

function replaceStructuredRows(container, rows) {
  if (!container) return
  const values = (rows || []).filter((item) => item && item.value != null && item.value !== '')
  if (!values.length) {
    container.replaceChildren()
    return
  }
  const template = container.firstElementChild?.cloneNode(true) || document.createElement('div')
  container.replaceChildren(...values.map((item) => {
    const row = template.cloneNode(true)
    row.hidden = false
    const children = [...row.children]
    if (children[0]) children[0].textContent = item.label || 'Live data'
    if (children[1]) children[1].textContent = String(item.value)
    if (children[2]) children[2].textContent = item.note || ''
    if (!children.length) row.textContent = `${item.label ? `${item.label}:` : ''}${item.value}`
    return row
  }))
}

function setDefinitionPairs(container, pairs) {
  if (!container) return
  const rows = queryAll(container, ':scope > div')
  rows.forEach((row, index) => {
    const pair = pairs[index]
    const value = pair?.value
    const available = value != null && value !== '' && (!Array.isArray(value) || value.length > 0)
    row.hidden = !pair || !available
    if (!pair || !available) return
    const labelNode = query(row, ':scope > span, :scope > dt')
    const valueNode = query(row, ':scope > strong, :scope > a, :scope > dd')
    if (labelNode) labelNode.textContent = pair.label
    if (!valueNode) return
    if (pair.url) {
      const link = document.createElement('a')
      link.className = valueNode.className
      link.href = pair.url
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      link.textContent = String(value)
      valueNode.replaceWith(link)
    } else {
      if (valueNode.tagName === 'A') valueNode.removeAttribute('href')
      valueNode.textContent = Array.isArray(value) ? value.join(' / ') : String(value)
    }
  })
}

function setDetailSection(root, id, visible) {
  const section = query(root, `[data-od-id="${id}"]`)
  if (section) section.hidden = !visible
  return section
}

function hideDetailRail(root, id) {
  const rail = setDetailSection(root, id, false)
  rail?.parentElement?.classList.add('runtime-single-column')
}

function normalizedResourceList(...groups) {
  const resources = []
  const seen = new Map()
  groups.flat(Infinity).forEach((item) => {
    const url = typeof item === 'string' ? item : item?.url || item?.href || ''
    if (!url || (!/^https?:\/\//i.test(url) && !String(url).startsWith('/'))) return
    if (seen.has(url)) {
      const existing = seen.get(url)
      if (item?.availability) existing.availability = item.availability
      if (item?.kind && !existing.kind) existing.kind = item.kind
      return
    }
    const resource = {
      url: String(url),
      label: typeof item === 'object' ? (item.label || item.kind || item.name || 'Evidence resource') : 'Evidence resource',
      kind: typeof item === 'object' ? (item.kind || '') : '',
      availability: typeof item === 'object' ? (item.availability || '') : '',
    }
    seen.set(url, resource)
    resources.push(resource)
  })
  return resources
}

function detailRiskLines(detail) {
  const monitoring = (detail.monitoring_matches || detail.monitoringMatches || []).map((item) =>
    typeof item === 'string' ? item : item?.reason || item?.label || item?.name,
  )
  return [
    ...(detail.risk_reasons || detail.riskReasons || []),
    ...(detail.riskAnalysis?.reasons || []),
    ...monitoring,
  ].filter(Boolean)
}

function setHeroSourceLogo(root, platform) {
  const image = query(root, '.detail-source-logo img')
  if (!image) return
  const key = sourceLogoKey(platform)
  const assets = {
    github: '/assets/logos/github.png',
    gitlab: '/assets/logos/gitlab.png',
    gitee: '/assets/logos/gitee.png',
    'baidu-doc': '/assets/logos/baidu-wenku.svg',
    'baidu-disk': '/assets/logos/baidu-netdisk.png',
    aliyun: '/assets/logos/alipan.png',
    quark: '/assets/logos/quark.png',
    onedrive: '/assets/logos/onedrive.png',
    doc88: '/assets/logos/doc88.png',
    docin: '/assets/logos/docin.png',
    csdn: '/assets/logos/csdn.png',
  }
  const asset = assets[key]
  image.hidden = !asset
  if (asset) {
    image.src = asset
    image.alt = `${platform || 'Source platform'} Logo`
  }
}

function configureSourceAccess(root, config) {
  const {
    sectionId,
    openId,
    viewId,
    downloadId,
    sourceUrl = '',
    resources = [],
    fetchedAt = '',
  } = config
  const section = query(root, `[data-od-id="${sectionId}"]`)
  if (!section) return
  const normalized = normalizedResourceList(resources)
  const directSource = /^https?:\/\//i.test(sourceUrl) || String(sourceUrl).startsWith('/') ? sourceUrl : ''
  const open = query(root, `[data-od-id="${openId}"]`)
  const sourceLine = query(section, '.source-link-line')
  const sourceLink = query(sourceLine, 'a')
  const copy = query(sourceLine, 'button')
  const view = query(root, `[data-od-id="${viewId}"]`)
  const download = query(root, `[data-od-id="${downloadId}"]`)
  let status = query(section, '.runtime-resource-status')
  if (!status) {
    status = document.createElement('p')
    status.className = 'runtime-resource-status'
    status.setAttribute('role', 'status')
    section.appendChild(status)
  }
  const figure = query(section, '.mirror-frame')
  const renderResources = () => {
    const usable = normalized.filter((item) => !['missing', 'unavailable'].includes(item.availability))
    const sourceMissing = normalized.some((item) => item.url === directSource && !usable.includes(item))
    const source = (sourceMissing ? '' : directSource) || usable.find((item) => /Original|Advisory|Repository|File/.test(item.label))?.url || ''
    if (open) {
      open.hidden = !source
      if (source) open.href = source
      else open.removeAttribute('href')
    }
    if (sourceLine) sourceLine.hidden = !source
    if (sourceLink) {
      sourceLink.hidden = !source
      if (source) {
        sourceLink.href = source
        sourceLink.textContent = source
      } else sourceLink.removeAttribute('href')
    }
    if (copy) {
      copy.dataset.runtimeCopy = source
      copy.title = source ? '' : 'The API did not provide a usable original link'
      setActionAvailable(copy, Boolean(source))
    }
    const missing = normalized.filter((item) => item.availability === 'missing').length
    const failed = normalized.filter((item) => item.availability === 'unavailable').length
    const mirror = usable.find(shouldRenderResourceAsImage)
      || usable.find((item) => shouldRenderResourceAsHtml(item) && (
        String(item.kind).toLowerCase() === 'html'
        || item.url.startsWith('/collector-output/')
        || /mirror|Mirror/i.test(item.label)
      ))
      || usable.find((item) => /mirror/i.test(item.kind) || /Mirror/i.test(item.label))
    const downloadable = usable.find((item) => /artifact|html|json/i.test(item.kind))
      || usable.find((item) => /Mirror|Raw capture|JSON/i.test(item.label))
    const message = [missing ? `${missing}  resource files are missing; the original references have been kept.` : '', failed ? `${failed}  resources failed to load and cannot be viewed for now.` : ''].filter(Boolean).join(' ')
    status.textContent = message
    status.hidden = !message
    if (view) {
      delete view.dataset.toast
      view.hidden = false
      view.removeAttribute('href')
      view.dataset.runtimeOpen = mirror?.url || ''
      view.title = mirror ? '' : message || 'The API did not provide mirror resources'
      setActionAvailable(view, Boolean(mirror))
    }
    if (download) {
      delete download.dataset.toast
      download.dataset.runtimeDownload = downloadable?.url || ''
      download.title = downloadable ? '' : message || 'The API did not provide a downloadable mirror'
      setActionAvailable(download, Boolean(downloadable))
    }
    if (!figure) return
    figure.hidden = !mirror && !missing && !failed
    figure.dataset.resourceState = mirror ? 'ready' : failed ? 'error' : missing ? 'missing' : 'empty'
    figure.setAttribute('aria-busy', 'false')
    const slot = query(figure, '.mirror-image-slot')
    if (slot) {
      slot.replaceChildren()
      if (mirror && shouldRenderResourceAsImage(mirror)) {
        figure.dataset.resourceState = 'loading'
        figure.setAttribute('aria-busy', 'true')
        status.textContent = `${message} Loading mirror…`.trim()
        status.hidden = false
        const image = document.createElement('img')
        image.className = 'runtime-mirror-image'
        image.alt = mirror.label
        image.hidden = true
        image.addEventListener('load', () => {
          if (query(slot, 'img') !== image) return
          image.hidden = false
          figure.dataset.resourceState = 'ready'
          figure.setAttribute('aria-busy', 'false')
          status.textContent = message
          status.hidden = !message
        })
        image.addEventListener('error', () => {
          if (query(slot, 'img') !== image) return
          mirror.availability = 'unavailable'
          renderResources()
        })
        slot.appendChild(image)
        image.src = mirror.url
      } else if (mirror && shouldRenderResourceAsHtml(mirror)) {
        const frame = document.createElement('iframe')
        frame.className = 'runtime-mirror-html'
        frame.title = mirror.label
        frame.setAttribute('sandbox', '')
        frame.referrerPolicy = 'no-referrer'
        frame.src = mirror.url
        slot.removeAttribute('role')
        slot.removeAttribute('aria-label')
        slot.appendChild(frame)
      } else {
        const label = document.createElement('strong')
        label.textContent = mirror?.label || (failed ? 'Failed to load mirror' : 'Mirror file missing')
        slot.appendChild(label)
      }
    }
    setText(figure, 'figcaption strong', mirror?.label || '—')
    setText(figure, 'figcaption span', normalized.length ? `${normalized.length}  resource references ${missing + failed ? `, ${missing + failed} unavailable` : ''}` : '—')
    setText(figure, 'figcaption code', '')
    setText(figure, '.mirror-frame-bar time', formatDate(fetchedAt))
  }
  renderResources()
  section.hidden = !directSource && !normalized.length
}

function bindIncidentBody(root, state, detail, id, sectionId) {
  const section = setDetailSection(root, sectionId, true)
  if (!section) return
  const original = usableText(detail.detail_text) || usableText(detail.summary) || usableText(detail.original_summary)
  setText(section, 'pre', original || (detail.summary_unavailable ? 'Original summary unavailable; the source needs to be resynced' : 'The current API did not provide body evidence'))
  let accessNotice = query(section, '[data-content-access-notice]')
  if (detail.content_access === 'partial') {
    if (!accessNotice) {
      accessNotice = document.createElement('p')
      accessNotice.className = 'muted'
      accessNotice.dataset.contentAccessNotice = '1'
      accessNotice.textContent = 'Showing guest-visible content; some content requires login to view'
      query(section, 'pre')?.before(accessNotice)
    }
  } else {
    accessNotice?.remove()
  }
  const translate = query(section, 'button[data-toast], [data-runtime-translate]')
  if (!translate) return
  delete translate.dataset.toast
  translate.hidden = detail.normalized_event_type === 'vulnerability'
  translate.title = original ? '' : 'The current record has no translatable body'
  setActionAvailable(translate, Boolean(original))
  if (!original || translate.hidden) return
  translate.dataset.runtimeTranslate = '1'
  translate.textContent = 'Translate body'
  let translated = ''
  let showingTranslated = false
  state.toggleTranslation = async () => {
    if (!translated) {
      const payload = await requestJson(`/api/events/${encodeURIComponent(id)}?translate_detail=true`)
      translated = usableText(payload.detail_text) || original
      if (payload.translation_applied === false || translated === original) {
        translated = ''
        throw new Error(payload.translation_error === 'rate_limited' ? 'The translation service is receiving too many requests; please try again later' : 'The translation service is temporarily unavailable; please try again later')
      }
    }
    showingTranslated = !showingTranslated
    setText(section, 'pre', showingTranslated ? translated : original)
    translate.textContent = showingTranslated ? 'Show original' : 'Show translation'
  }
}

function bindDetailBase(root, detail, summaryPairs, kpiPairs) {
  setText(root, 'main h1', detail.title || detail.repositoryFullName || detail.repositoryName || 'Untitled record')
  setText(root, '[data-detail-record-id]', detail.identifier || detail.id)
  setText(root, '.lead', usableText(detail.summary) || usableText(detail.detail_text) || usableText(detail.codePreview) || 'No summary')
  setSummary(query(root, '.detail-summary'), summaryPairs)
  const kpis = queryAll(root, '.detail-kpi')
  kpis.forEach((card, index) => {
    if (!kpiPairs[index]) return
    const [label, value, note] = kpiPairs[index]
    setText(card, 'span', label)
    setText(card, 'strong', value)
    setText(card, 'small', note || 'Live data')
  })
  const badge = query(root, '.detail-hero .badge')
  if (badge) badge.textContent = severityLabel(severityOf(detail))
}

function reviewerName() {
  try {
    const user = JSON.parse(localStorage.getItem('dwti-current-user') || 'null')
    return user?.display_name || user?.username || ''
  } catch {
    return ''
  }
}

function hydrateAccount(root) {
  try {
    const user = JSON.parse(localStorage.getItem('dwti-current-user') || 'null')
    const label = user?.display_name || user?.username || 'Personal'
    queryAll(root, '.avatar').forEach((node) => { node.textContent = label })
  } catch {
    queryAll(root, '.avatar').forEach((node) => { node.textContent = 'Personal' })
  }
}

function openCollectorRemoteLogin(site, options = {}) {
  const platform = String(options.platform || site?.auth_platform || '').trim()
  if (!platform || document.querySelector('.collector-browser-overlay')) return
  const displayLabel = String(options.label || site?.display_name || site?.site_name || platform).trim()

  const overlay = document.createElement('div')
  overlay.className = 'collector-browser-overlay'
  overlay.innerHTML = `
    <section class="collector-browser-dialog" role="dialog" aria-modal="true" aria-labelledby="collector-browser-title">
      <header class="collector-browser-head">
        <div>
          <h2 id="collector-browser-title" data-browser-dialog-title>Login</h2>
        </div>
        <div class="collector-browser-head-actions">
          <span class="badge" data-browser-status hidden>Starting</span>
          <button class="btn btn-secondary" type="button" data-browser-captcha hidden>Recognize CAPTCHA</button>
          <button class="btn btn-secondary" type="button" data-browser-captcha-report hidden>Report error for refund</button>
          <button class="btn btn-primary" type="button" data-browser-save>Save session</button>
          <button class="btn btn-secondary" type="button" data-browser-close>Close</button>
        </div>
      </header>
      <div class="collector-browser-layout">
        <div class="collector-browser-workspace">
          <div class="collector-browser-canvas" data-browser-canvas tabindex="0" aria-label="Internal browser view; click to interact with the page">
            <img data-browser-screenshot alt="Internal browser login page" hidden>
            <div class="collector-browser-empty" data-browser-empty>Starting internal browser via Tor…</div>
          </div>
          <p class="collector-browser-error" data-browser-error hidden></p>
        </div>
      </div>
    </section>`
  document.body.appendChild(overlay)

  let sessionId = ''
  let browserState = null
  let closed = false
  let busy = false
  let refreshTimer = null
  let browserStream = null
  let streamPath = ''
  const statusNode = query(overlay, '[data-browser-status]')
  const screenshot = query(overlay, '[data-browser-screenshot]')
  const empty = query(overlay, '[data-browser-empty]')
  const errorNode = query(overlay, '[data-browser-error]')
  const canvas = query(overlay, '[data-browser-canvas]')
  const captchaButton = query(overlay, '[data-browser-captcha]')
  const captchaReportButton = query(overlay, '[data-browser-captcha-report]')

  const setStatus = (label, tone = '') => {
    statusNode.textContent = label
    statusNode.className = `badge ${tone}`.trim()
  }

  const connectStream = (path) => {
    if (!path || path === streamPath) return
    browserStream?.close()
    streamPath = path
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
    browserStream = createRemoteBrowserStream({
      image: screenshot,
      focusTarget: canvas,
      websocketUrl: `${scheme}://${window.location.host}${path}`,
      onStatus: (status) => {
        if (status === 'connected') {
          empty.hidden = true
          setStatus('Live browser connected', 'badge-success')
        } else if (status === 'connecting') {
          setStatus('Connecting to live browser')
        } else if (!closed) {
          setStatus('Live browser disconnected', 'badge-high')
        }
      },
      onError: (message) => {
        errorNode.hidden = false
        errorNode.textContent = message
      },
    })
  }

  const renderState = (payload) => {
    browserState = payload || browserState
    if (!browserState) return
    captchaButton.hidden = !browserState.captcha_recognition_available
    captchaReportButton.hidden = !browserState.captcha_error_report_available
    setText(overlay, '[data-browser-dialog-title]', `${displayLabel} Login`)
    if (browserState.stream_ws_path) connectStream(browserState.stream_ws_path)
    if (browserState.screenshot) {
      screenshot.src = browserState.screenshot
      screenshot.hidden = false
      empty.hidden = true
    } else if (!browserState.stream_ws_path) {
      screenshot.hidden = true
      empty.hidden = false
      empty.textContent = browserState.last_error ? 'The target page cannot be loaded right now; click to reload the page' : 'Waiting for internal browser view'
    }
    const lastError = String(browserState.last_error || '').trim()
    errorNode.hidden = !lastError
    errorNode.textContent = lastError ? `Page load notice:${lastError}` : ''
    setStatus(lastError ? 'Page waiting to retry' : 'Browser connected', lastError ? 'badge-high' : 'badge-success')
  }

  const control = async (action, payload = {}) => {
    if (!sessionId || busy) return null
    busy = true
    try {
      const state = await requestJson(`/api/platform-sessions/remote-login/${encodeURIComponent(sessionId)}/control`, {
        method: 'POST',
        body: JSON.stringify({ action, ...payload }),
      })
      renderState(state)
      return state
    } catch (error) {
      setStatus('Operation failed', 'badge-high')
      errorNode.hidden = false
      errorNode.textContent = error.message || 'Internal browser operation failed'
      return null
    } finally {
      busy = false
    }
  }

  const refreshState = async () => {
    if (!sessionId || busy || closed) return
    busy = true
    try {
      renderState(await requestJson(`/api/platform-sessions/remote-login/${encodeURIComponent(sessionId)}`))
    } catch (error) {
      setStatus('Connection interrupted', 'badge-high')
      errorNode.hidden = false
      errorNode.textContent = error.message || 'Cannot refresh the internal browser view'
    } finally {
      busy = false
    }
  }

  const stopPolling = () => {
    if (refreshTimer) window.clearInterval(refreshTimer)
    refreshTimer = null
  }

  const closeDialog = async (closeSession = true) => {
    if (closed) return
    closed = true
    stopPolling()
    browserStream?.close()
    browserStream = null
    streamPath = ''
    if (closeSession && sessionId) {
      await requestJson(`/api/platform-sessions/remote-login/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }).catch(() => null)
    }
    overlay.remove()
  }

  query(overlay, '[data-browser-close]').addEventListener('click', () => closeDialog())
  query(overlay, '[data-browser-captcha]').addEventListener('click', async () => {
    setStatus('Recognizing CAPTCHA')
    const state = await control('solve_captcha')
    if (state?.action_result?.captcha_filled) {
      setStatus('CAPTCHA filled in', 'badge-success')
      showToast('CAPTCHA recognition result has been filled into the login page')
    }
  })
  query(overlay, '[data-browser-captcha-report]').addEventListener('click', async () => {
    setStatus('Reporting error for refund')
    const state = await control('report_captcha_error')
    if (state?.action_result?.reported) {
      setStatus('Error reported for refund', 'badge-success')
      showToast('This CAPTCHA recognition has been reported to Chaojiying as an error')
    }
  })
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeDialog()
  })
  screenshot.addEventListener('click', (event) => {
    if (streamPath) return
    const viewport = browserState?.viewport || {}
    const bounds = screenshot.getBoundingClientRect()
    if (!bounds.width || !bounds.height || !viewport.width || !viewport.height) return
    control('click', {
      x: Math.round((event.clientX - bounds.left) * Number(viewport.width) / bounds.width),
      y: Math.round((event.clientY - bounds.top) * Number(viewport.height) / bounds.height),
    })
  })
  query(overlay, '[data-browser-save]').addEventListener('click', async () => {
    if (!sessionId || busy) return
    busy = true
    setStatus('Verifying session')
    try {
      await requestJson(`/api/platform-sessions/remote-login/${encodeURIComponent(sessionId)}/finish`, {
        method: 'POST',
        body: JSON.stringify({ account_label: displayLabel }),
      })
      sessionId = ''
      if (options.runSiteOnSave !== false && site?.site_name) {
        const runResult = await requestJson('/api/jobs/run-site', {
          method: 'POST',
          body: JSON.stringify({ site_name: site.site_name, force: true }),
        })
        if (runResult?.reason === 'auth_required') throw new Error(runResult.message || 'Login session has not taken effect yet')
        setStatus('Saved and rerun', 'badge-success')
        showToast('Login session saved; site task rerun')
        const url = new URL(window.location.href)
        url.searchParams.delete('login')
        window.history.replaceState({}, '', url)
      } else {
        setStatus('Session saved', 'badge-success')
        showToast('Platform login session saved')
      }
      window.setTimeout(() => window.location.reload(), 900)
    } catch (error) {
      setStatus('Save failed', 'badge-high')
      errorNode.hidden = false
      errorNode.textContent = error.message || 'Failed to save login session'
    } finally {
      busy = false
    }
  })

  ;(async () => {
    try {
      if (options.initialState?.session_id) {
        sessionId = String(options.initialState.session_id)
        renderState(options.initialState)
        refreshTimer = window.setInterval(refreshState, 3000)
        return
      }
      if (platform === 'changan') {
        let tor = await requestJson('/api/tor-bridge/status')
        if (!tor.connected) {
          setStatus('Connecting Tor')
          tor = await requestJson('/api/tor-bridge/start', { method: 'POST' })
          const deadline = Date.now() + 45_000
          while (!tor.connected && Date.now() < deadline) {
            if (tor.connection_state === 'error') throw new Error(tor.last_error || 'Tor Connection failed')
            await new Promise((resolve) => window.setTimeout(resolve, 1200))
            tor = await requestJson('/api/tor-bridge/status')
          }
          if (!tor.connected) throw new Error('Tor Connection not completed yet; check the bridge status and try again')
        }
      }
      const state = await requestJson(`/api/platform-sessions/${encodeURIComponent(platform)}/remote-login/start`, { method: 'POST' })
      sessionId = String(state.session_id || '')
      renderState(state)
      refreshTimer = window.setInterval(refreshState, 3000)
    } catch (error) {
      setStatus('Start failed', 'badge-high')
      empty.textContent = 'Failed to start internal browser'
      errorNode.hidden = false
      errorNode.textContent = error.message || 'Cannot create internal browser session'
    }
  })()
}

export function openPlatformRemoteLogin(platform, initialState, options = {}) {
  const normalizedPlatform = String(platform || '').trim()
  if (!normalizedPlatform) return
  openCollectorRemoteLogin(
    {
      auth_platform: normalizedPlatform,
      display_name: options.label || initialState?.label || normalizedPlatform,
    },
    {
      ...options,
      platform: normalizedPlatform,
      initialState,
      runSiteOnSave: false,
    },
  )
}

async function hydrateCollectorRunDetail(root, route) {
  const payload = await requestJson('/api/jobs')
  const siteName = String(route?.query?.site || '')
  const jobType = String(route?.query?.job || 'Collection tasks')
  const site = (payload.site_health || []).find((item) =>
    [item.site_name, item.display_name].map(String).includes(siteName),
  ) || null
  if (!site) throw new Error(siteName ? `Site run summary not found:${siteName}` : 'The current link does not specify a verifiable site')
  const failure = (payload.recent_failures || []).find((item) =>
    String(item.site_name || '') === String(site?.site_name || siteName),
  ) || null
  const status = site?.overall_status || (failure ? 'Error' : 'Not running')
  setText(root, '[data-detail-record-id]', site?.site_name || String(route?.params?.runId || 'latest'))
  setText(root, 'main h1', `${site?.display_name || siteName || 'Collection tasks'} · ${jobType}`)
  setText(root, '.lead', failure?.error_message || site?.last_error || 'The backend currently only provides site-level run summaries, not per-task progress, logs or control APIs.')
  setText(root, '.detail-hero .badge', status)
  setSummary(query(root, '.detail-summary'), [
    ['Run status', status],
    ['Seed tasks', site?.seed_status || 'Not running'],
    ['Processed', number((site?.forum_details_count || 0) + (site?.victims_count || 0))],
    ['Detail tasks', site?.detail_status || 'Not running'],
  ])
  const kpiValues = [
    ['Last success', site?.last_success_at || '—', 'Site-level status'],
    ['Running tasks', number(site?.running_jobs || 0), 'Site-level status'],
    ['Consecutive failures', number(site?.consecutive_failures || 0), `Threshold ${number(site?.failure_threshold || 0)}`],
    ['Authorization status', site?.auth_required ? (site?.auth_message || site?.auth_status || 'Login required') : 'No login required', 'Site-level status'],
  ]
  queryAll(root, '.detail-kpi').forEach((card, index) => {
    const item = kpiValues[index]
    if (!item) return
    setText(card, 'span', item[0])
    setText(card, 'strong', item[1])
    setText(card, 'small', item[2])
  })
  const frontier = site?.frontier
  const progress = setDetailSection(root, 'collector-run-progress', Boolean(frontier?.enabled))
  if (frontier?.enabled) {
    setText(progress, '.panel-header h2', 'Detail queue and historical backfill')
    setText(progress, '.panel-header p', 'Counts discovered tasks; queue completed does not mean all of the site’s historical data has been fetched.')
    const progressBar = query(progress, '.detail-progress')
    if (progressBar) progressBar.hidden = true
    const progressBadge = query(progress, '.panel-header .badge')
    if (progressBadge) {
      progressBadge.textContent = site.enabled === false ? 'Site disabled' : frontier.backfill_paused ? 'Backfill paused due to backlog' : 'Newest pages first'
      progressBadge.className = `badge ${frontier.backfill_paused ? 'badge-high' : 'badge-success'}`
    }
    const pageCursors = Array.isArray(frontier.page_cursors) ? frontier.page_cursors : []
    replaceStructuredRows(query(progress, '.detail-list'), [
      { label: 'Pending', value: number(frontier.pending || 0), note: 'Includes tasks waiting for automatic retry' },
      { label: 'Running', value: number(frontier.inflight || 0), note: 'Claimed or queued for execution' },
      { label: 'Queue completed', value: number(frontier.completed || 0), note: 'The current version of discovered tasks is complete' },
      { label: 'Historical backfill', value: site.enabled === false ? 'Site disabled; progress kept' : frontier.backfill_paused ? 'Backlog reached the limit; backfill paused' : `Up to ${number(frontier.backfill_pages_per_run || 0)} pages per round`, note: site.enabled === false ? '' : 'Continue checking newest pages' },
      ...pageCursors.map((cursor, index) => ({
        label: `Section ${index + 1}`,
        value: cursor.completed_at ? 'This round has scanned the list to the last page' : `Next backfill page: ${number(cursor.next_page || 2)}`,
        note: cursor.source_url || '',
      })),
      ...(!pageCursors.length ? [{ label: 'Pagination cursor', value: 'No historical backfill records yet', note: '' }] : []),
    ])
  }
  setDetailSection(root, 'collector-run-configuration', false)
  setDetailSection(root, 'collector-run-log', false)
  hideDetailRail(root, 'collector-action-rail')
  const health = setDetailSection(root, 'collector-run-health', Boolean(site))
  const healthBadge = query(health, '.panel-header .badge')
  if (healthBadge) {
    healthBadge.textContent = status
    healthBadge.classList.remove('badge-success', 'badge-high', 'badge-critical')
    healthBadge.classList.add(failure || Number(site?.consecutive_failures || 0) > 0 ? 'badge-high' : 'badge-success')
  }
  replaceStructuredRows(query(health, '.detail-list'), [
    { label: 'Site status', value: status, note: payload.updated_at || '' },
    { label: 'Authorization status', value: site?.auth_required ? (site?.auth_status || 'Login required') : 'No login required', note: site?.auth_platform || '' },
    { label: 'Circuit breaker', value: site?.circuit_breaker_open ? 'Open' : 'Closed', note: site?.failure_cooldown_until || '' },
    { label: 'Blocking reason', value: site?.blockingReason || 'None', note: site?.error_category || '' },
  ])
  if (site?.auth_required && site?.auth_platform) {
    const header = query(health, '.panel-header')
    const actions = document.createElement('div')
    actions.className = 'collector-auth-actions'
    if (healthBadge) actions.appendChild(healthBadge)
    const loginButton = document.createElement('button')
    loginButton.type = 'button'
    loginButton.className = 'btn btn-primary'
    loginButton.textContent = 'Open internal browser login'
    loginButton.addEventListener('click', () => openCollectorRemoteLogin(site))
    actions.appendChild(loginButton)
    header?.appendChild(actions)
    if (String(route?.query?.login || '') === '1') openCollectorRemoteLogin(site)
  }
  const failures = (payload.recent_failures || []).filter((item) =>
    String(item.site_name || '') === String(site?.site_name || siteName),
  )
  const retrySection = setDetailSection(root, 'collector-run-retries', failures.length > 0)
  const retryBadge = query(retrySection, '.panel-header .badge')
  if (retryBadge) {
    retryBadge.textContent = failures.length ? `${number(failures.length)}  failure records` : 'No failure records'
    retryBadge.classList.remove('badge-success', 'badge-high', 'badge-critical')
    retryBadge.classList.add(failures.length ? 'badge-high' : 'badge-success')
  }
  replaceStructuredRows(query(retrySection, '.detail-list'), failures.map((item) => ({
    label: item.finished_at || 'Last failure',
    value: item.error_message || item.status || 'Collection failed',
    note: item.error_category || item.job_type || '',
  })))
}

async function hydrateIncidentDetail(root, state, file, id) {
  const vulnerability = file === 'vulnerability-detail.html'
  const endpoint = vulnerability ? `/api/vulnerabilities/${encodeURIComponent(id)}` : `/api/events/${encodeURIComponent(id)}`
  const detail = await requestJson(endpoint)
  state.incidentDetail = detail
  const riskLines = [...new Set(detailRiskLines(detail))]
  const referenceResources = normalizedResourceList(
    detail.reference_urls,
    detail.mirror_resources,
    detail.screenshot_resources,
    detail.sample_links,
    detail.json_preview_url ? [{ label: 'JSON Records', url: detail.json_preview_url, kind: 'artifact', availability: detail.json_preview_availability }] : [],
  )
  const usableReference = referenceResources.find((item) => !['missing', 'unavailable'].includes(item.availability))
  const firstReference = usableReference || referenceResources[0]
  const directSource = detail.disclosure_url || detail.source_url || detail.advisory_url || ''
  const sourceMissing = referenceResources.some((item) => item.url === directSource && ['missing', 'unavailable'].includes(item.availability))
  const sourceUrl = (sourceMissing ? '' : directSource) || usableReference?.url || ''
  const affectedVersions = (detail.affected_version_items || detail.affected_versions || [])
    .map((item) => typeof item === 'string' ? item : item?.display || item?.raw || item?.version || item?.label || item?.value)
    .filter(Boolean)
  const bodySections = {
    'event-detail.html': 'detail-evidence',
    'ransomware-detail.html': 'ransomware-event-detail',
    'data-leak-detail.html': 'data-leak-event-detail',
    'vulnerability-detail.html': 'vulnerability-event-detail',
  }
  bindIncidentBody(root, state, detail, id, bodySections[file])

  if (file === 'event-detail.html') {
    bindDetailBase(root, detail, [
      ['Risk level', severityLabel(severityOf(detail))],
      ['Source', detail.source || detail.raw_source_type_label || '—'],
      ['Disclosure time', formatDate(detail.disclosure_time)],
      ['Risk score', detail.risk_score != null ? `${number(detail.risk_score)} / 100` : '—'],
    ], [])
    setDefinitionPairs(query(root, '[data-od-id="detail-key-information"] .definition-grid'), [
      { label: 'Event type', value: eventTypeLabel(eventType(detail)) },
      { label: 'Source', value: detail.source || detail.raw_source_type_label },
      { label: 'Disclosure time', value: formatFullDate(detail.disclosure_time) },
      { label: 'Region', value: detail.region || detail.country },
      { label: 'Industry', value: detail.industry },
      { label: 'Related entity', value: detail.victim || detail.vendor || detail.product || detail.attacker },
    ])
    const riskSection = setDetailSection(root, 'detail-risk-reasoning', riskLines.length > 0)
    replaceStructuredRows(query(riskSection, '.queue-list'), riskLines.slice(0, 6).map((line, index) => ({
      label: `Basis ${index + 1}`,
      value: line,
      note: 'Risk basis returned by the API',
    })))
    const evidence = query(root, '[data-od-id="detail-evidence"]')
    setDefinitionPairs(query(evidence, '.definition-grid'), [
      { label: 'Source category', value: detail.raw_source_type_label || detail.source || 'Unlabeled' },
      { label: 'Reference link', value: !usableReference && firstReference ? `${firstReference.label} (file missing)` : firstReference?.label || sourceUrl, url: usableReference?.url || sourceUrl },
      { label: 'Sample evidence', value: detail.has_sample_evidence ? `${number(detail.sample_link_count || detail.sample_links?.length)} ` : 'Not provided' },
    ])
    hideDetailRail(root, 'detail-action-rail')
    return
  }

  if (vulnerability) {
    bindDetailBase(root, detail, [
      ['Action priority', ['critical', 'high'].includes(severityOf(detail)) ? 'Check first' : 'Keep tracking'],
      ['CVSS', detail.cvss ?? '—'],
      ['Patch status', detail.patch_available ? 'Patch available' : 'Patch not confirmed'],
      ['Exploitation status', detail.is_exploited ? 'In-the-wild exploitation confirmed' : 'In-the-wild exploitation not confirmed'],
    ], [
      ['Risk score', detail.risk_score != null ? `${number(detail.risk_score)} / 100` : '—', 'API score'],
      ['In-the-wild exploitation', detail.is_exploited ? 'Confirmed' : 'Unconfirmed', 'Public intelligence record'],
      ['Affected versions', affectedVersions.length ? `${affectedVersions.length}  items` : 'Not provided', ''],
      ['Disclosure time', formatDate(detail.disclosure_time), detail.source || 'Public source'],
    ])
    setDefinitionPairs(query(root, '[data-od-id="vulnerability-affected-scope"] .definition-grid'), [
      { label: 'Vendor', value: detail.vendor },
      { label: 'Product', value: detail.product },
      { label: 'Affected versions', value: affectedVersions },
      { label: 'In-the-wild exploitation', value: detail.is_exploited ? 'Confirmed' : 'Unconfirmed' },
      { label: 'Patch status', value: detail.patch_available ? 'Patch available' : 'Patch not confirmed' },
      { label: 'PoC Status', value: Object.prototype.hasOwnProperty.call(detail, 'has_poc') ? (detail.has_poc ? 'Recorded' : 'Not recorded') : '' },
    ])
    const evidenceSection = setDetailSection(root, 'vulnerability-exploit-evidence', riskLines.length > 0)
    replaceStructuredRows(query(evidenceSection, '.detail-list'), riskLines.slice(0, 6).map((line, index) => ({
      label: `Exploitation basis ${index + 1}`,
      value: line,
      note: detail.source || 'Public source',
    })))
    setDetailSection(root, 'vulnerability-asset-plan', false)
    const remediation = setDetailSection(root, 'vulnerability-remediation', Boolean(detail.patch_available))
    replaceStructuredRows(query(remediation, '.timeline'), detail.patch_available ? [{
      label: 'Patch status',
      value: 'The API record has a patch',
      note: sourceUrl ? 'Check the original advisory for exact versions and steps' : 'The API did not provide a patch link',
    }] : [])
    const sourceSection = setDetailSection(root, 'vulnerability-sources', Boolean(sourceUrl || referenceResources.length))
    replaceStructuredRows(query(sourceSection, '.detail-list'), referenceResources.slice(0, 6).map((item) => ({
      label: item.label,
      value: item.url,
      note: item.availability === 'missing' ? 'File missing; reference kept' : 'Live API resource',
    })))
    configureSourceAccess(root, {
      sectionId: 'vulnerability-sources', openId: 'vulnerability-open-source', viewId: 'vulnerability-view-mirror', downloadId: 'vulnerability-download-mirror',
      sourceUrl, resources: referenceResources, fetchedAt: detail.updated_time || detail.disclosure_time,
    })
    hideDetailRail(root, 'vulnerability-action-rail')
    return
  }

  if (file === 'ransomware-detail.html') {
    bindDetailBase(root, detail, [
      ['Action stage', detail.category || detail.leak_type || 'Disclosed'],
      ['Group', detail.attacker || 'Unlabeled'],
      ['Confidence', detail.confidence_score != null ? `${number(detail.confidence_score)} / 100` : 'Not provided'],
      ['Disclosure time', formatDate(detail.disclosure_time)],
    ], [
      ['Victim region', detail.region || detail.country || '—', detail.industry || '—'],
      ['Sample evidence', number(detail.sample_link_count || detail.sample_links?.length || 0), detail.has_sample_evidence ? 'Recorded' : 'Not recorded'],
      ['First disclosed', formatDate(detail.disclosure_time), detail.source || 'Leak site'],
      ['Risk score', detail.risk_score != null ? `${number(detail.risk_score)} / 100` : '—', 'API score'],
    ])
    setDefinitionPairs(query(root, '[data-od-id="ransomware-victim-profile"] .definition-grid'), [
      { label: 'Victim organization', value: detail.victim },
      { label: 'Industry', value: detail.industry },
      { label: 'Ransomware group', value: detail.attacker },
      { label: 'Disclosure source', value: detail.source || detail.raw_source_type_label },
      { label: 'Disclosure time', value: formatFullDate(detail.disclosure_time) },
      { label: 'Publication status', value: detail.category || detail.leak_type },
    ])
    setDetailSection(root, 'ransomware-attack-chain', false)
    setDetailSection(root, 'ransomware-artifacts', false)
    configureSourceAccess(root, {
      sectionId: 'ransomware-evidence', openId: 'ransomware-open-source', viewId: 'ransomware-view-mirror', downloadId: 'ransomware-download-mirror',
      sourceUrl, resources: referenceResources, fetchedAt: detail.updated_time || detail.disclosure_time,
    })
    hideDetailRail(root, 'ransomware-action-rail')
    return
  }

  bindDetailBase(root, detail, [
    ['Verification score', detail.confidence_score != null ? `${number(detail.confidence_score)} / 100` : 'Not provided'],
    ['Sample evidence', number(detail.sample_link_count || detail.sample_links?.length || 0)],
    ['Leak type', detail.leak_type || detail.category || 'Unlabeled'],
    ['Risk level', severityLabel(severityOf(detail))],
  ], [
    ['Source credibility', detail.confidence_score != null ? `${number(detail.confidence_score)} / 100` : '—', 'API score'],
    ['Risk basis', number(riskLines.length), 'Structured basis'],
    ['Disclosure time', formatDate(detail.disclosure_time), detail.source || 'Public source'],
    ['Affected entities', detail.victim || 'Unconfirmed', detail.industry || '—'],
  ])
  setDefinitionPairs(query(root, '[data-od-id="data-leak-source-chain"] .definition-grid'), [
    { label: 'Source channel', value: detail.source || detail.raw_source_type_label },
    { label: 'Seller', value: detail.attacker },
    { label: 'Leak type', value: detail.leak_type || detail.category },
    { label: 'Collected at', value: formatFullDate(detail.updated_time || detail.disclosure_time) },
    { label: 'Affected entity', value: detail.victim },
    { label: 'Sample evidence', value: detail.has_sample_evidence ? `${number(detail.sample_link_count || detail.sample_links?.length)} ` : 'Not provided' },
  ])
  setDetailSection(root, 'data-leak-field-matrix', false)
  setDetailSection(root, 'data-leak-sample-preview', false)
  setDetailSection(root, 'data-leak-dedup', false)
  configureSourceAccess(root, {
    sectionId: 'data-leak-mirror-evidence', openId: 'data-leak-open-source', viewId: 'data-leak-view-mirror', downloadId: 'data-leak-download-mirror',
    sourceUrl, resources: referenceResources, fetchedAt: detail.updated_time || detail.disclosure_time,
  })
  hideDetailRail(root, 'data-leak-action-rail')
}

function configureReviewActions(root, state, file, endpoint, currentStatus) {
  const supported = file === 'code-detail.html'
    ? new Map([['Confirm sensitive exposure', 'confirmed'], ['Mark as false positive', 'false_positive']])
    : file === 'netdisk-detail.html'
      ? new Map([['Confirm company-related', 'confirmed'], ['Mark link expired', 'closed'], ['Mark as false positive', 'false_positive']])
      : new Map([['Confirm company document', 'confirmed'], ['Mark as public material', 'false_positive'], ['Mark as false positive', 'false_positive']])
  queryAll(root, '[data-disposition]').forEach((button) => {
    const status = supported.get(button.textContent.trim())
    if (status) {
      button.dataset.runtimeReviewStatus = status
      setActionAvailable(button, true)
    } else {
      setActionAvailable(button, false, 'The backend does not currently provide an API for this action')
    }
  })
  const save = queryAll(root, 'button[data-toast]').find((button) => button.textContent.includes('Save'))
  if (save) {
    delete save.dataset.toast
    save.dataset.runtimeReviewSave = '1'
    setActionAvailable(save, true)
  }
  state.pendingReviewStatus = currentStatus || 'new'
  setText(root, '[data-review-state]', reviewStatusLabel(state.pendingReviewStatus))
  state.saveReview = async () => {
    const note = query(root, 'textarea')?.value.trim() || ''
    await requestJson(endpoint, {
      method: 'POST',
      body: JSON.stringify({ status: state.pendingReviewStatus, reviewer: reviewerName(), note }),
    })
    showToast('Review verdict saved')
    await state.refresh?.()
  }
}

function renderRuntimeFileTree(tree, files) {
  const root = { children: new Map() }
  const normalizePath = (value) => String(value || '').replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '')

  files.forEach((item, index) => {
    const path = normalizePath(item.path || item.name || `file-${index}`)
    const parts = path.split('/').filter(Boolean)
    if (/^sharelink\d+(?:-|$)/i.test(parts[0] || '')) parts.shift()
    if (!parts.length) return

    let parent = root
    let visiblePath = ''
    parts.forEach((name, partIndex) => {
      visiblePath = visiblePath ? `${visiblePath}/${name}` : name
      const leaf = partIndex === parts.length - 1
      let node = parent.children.get(name)
      if (!node) {
        node = { name, path: visiblePath, size: '', type: '', isDir: !leaf, inferred: false, children: new Map() }
        parent.children.set(name, node)
      }
      if (leaf) {
        node.path = path
        node.size = item.size || ''
        node.type = item.type || ''
        node.inferred = Boolean(item.inferred)
        node.isDir = Boolean(item.isDir || item.is_dir || ['folder', 'dir', 'directory'].includes(String(item.type || '').toLowerCase()))
      } else {
        node.isDir = true
      }
      parent = node
    })
  })

  const descendantCount = (node) => Array.from(node.children.values())
    .reduce((count, child) => count + 1 + descendantCount(child), 0)

  const fileIcon = (node) => {
    const type = String(node.type || node.name.split('.').pop() || '').toLowerCase()
    if (['xls', 'xlsx', 'csv'].includes(type)) return ['xlsx', 'XLS']
    if (['doc', 'docx'].includes(type)) return ['doc', 'DOC']
    if (['ppt', 'pptx'].includes(type)) return ['ppt', 'PPT']
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(type)) return ['image', 'IMG']
    if (['mp4', 'mov', 'm4v', 'avi', 'mkv'].includes(type)) return ['video', 'VID']
    if (['zip', 'rar', '7z'].includes(type)) return ['zip', 'ZIP']
    if (type === 'pdf') return ['pdf', 'PDF']
    return ['file', 'FILE']
  }

  const renderNode = (node, level) => {
    if (node.isDir || node.children.size) {
      const folder = document.createElement('details')
      folder.className = `tree-folder${level === 0 ? ' tree-root' : ''}`
      folder.open = level <= 1
      folder.dataset.treeEntry = ''
      folder.dataset.treeKind = 'folder'
      folder.dataset.treeLevel = String(level)

      const summary = document.createElement('summary')
      const chevron = document.createElement('span')
      chevron.className = 'tree-chevron'
      chevron.ariaHidden = 'true'
      const icon = document.createElement('span')
      icon.className = 'tree-folder-icon'
      icon.ariaHidden = 'true'
      const name = document.createElement('strong')
      name.textContent = node.name
      name.title = node.path
      const count = document.createElement('span')
      count.className = 'tree-count'
      count.textContent = `${descendantCount(node)}  items`
      summary.append(chevron, icon, name, count)

      const children = document.createElement('div')
      children.className = 'tree-children'
      children.append(...Array.from(node.children.values()).map((child) => renderNode(child, level + 1)))
      folder.append(summary, children)
      return folder
    }

    const row = document.createElement('div')
    row.className = 'tree-file'
    row.dataset.treeEntry = ''
    row.dataset.treeKind = 'file'
    row.dataset.treeLevel = String(level)
    const branch = document.createElement('span')
    branch.className = 'tree-branch'
    branch.ariaHidden = 'true'
    const [iconClass, iconLabel] = fileIcon(node)
    const icon = document.createElement('span')
    icon.className = `tree-file-icon ${iconClass}`
    icon.textContent = iconLabel
    const name = document.createElement('strong')
    name.textContent = node.name
    name.title = node.path
    const evidence = document.createElement('span')
    evidence.className = 'tree-hit'
    const size = document.createElement('span')
    size.className = 'tree-size'
    size.textContent = node.size || ''
    row.append(branch, icon, name, evidence, size)
    return row
  }

  const empty = document.createElement('div')
  empty.className = 'file-tree-empty'
  empty.dataset.treeEmpty = ''
  empty.textContent = 'No matching files or directories'
  empty.hidden = root.children.size > 0
  tree.classList.remove('runtime-file-list')
  tree.replaceChildren(...Array.from(root.children.values()).map((node) => renderNode(node, 0)), empty)
  document.querySelector(`[data-tree-search="${tree.id}"]`)?.dispatchEvent(new Event('input'))
}

async function hydrateDocumentDetail(root, state, file, id) {
  const detail = await requestJson(`/api/document-exposures/${encodeURIComponent(id)}`)
  const netdisk = file === 'netdisk-detail.html'
  const platform = detail.platformLabel || detail.platform || 'Unknown platform'
  const accessLabel = detail.accessStateLabel || detail.accessState || 'Not provided'
  const files = detail.fileList || []
  const terms = (detail.matchedTerms || []).map((item) => typeof item === 'string' ? item : item?.term || item?.label).filter(Boolean)
  const riskLines = [...new Set(detailRiskLines(detail))]
  const snapshot = detail.latestSnapshot || {}
  const resources = normalizedResourceList(detail.previewAssets, [
    snapshot.screenshotUrl ? { kind: 'screenshot', label: 'Page screenshot', url: snapshot.screenshotUrl } : null,
    snapshot.htmlUrl ? { kind: 'html', label: 'Page mirror', url: snapshot.htmlUrl } : null,
  ])
  bindDetailBase(root, detail, [
    ['Risk level', severityLabel(severityOf(detail))],
    [netdisk ? 'Link status' : 'Access status', accessLabel],
    [netdisk ? 'File count' : 'Evidence count', number(netdisk ? files.length || detail.fileCount : detail.evidenceCount)],
    ['Review status', reviewStatusLabel(detail.reviewStatus)],
  ], [
    ['Source platform', platform, 'Real source'],
    [netdisk ? 'Share type' : 'Document type', netdisk ? (detail.shareMeta?.shareType || 'Not provided') : (detail.documentMeta?.primaryFileType || 'Not provided'), netdisk ? (detail.fileListMeta?.label || '') : `${number(detail.evidenceCount || 0)}  evidence items`],
    ['Access status', accessLabel, `Confidence ${number(detail.confidenceScore || 0)}`],
    ['Discovered at', formatDate(detail.lastSeenAt || detail.firstSeenAt), detail.discoverySourceLabel || 'Real collection record'],
  ])
  setHeroSourceLogo(root, platform)
  setText(root, '.detail-hero .badge', netdisk ? accessLabel : severityLabel(severityOf(detail)))

  if (netdisk) {
    setDefinitionPairs(query(root, '[data-od-id="netdisk-share-information"] .definition-grid'), [
      { label: 'Monitoring target', value: detail.watchlistName || detail.organizationName },
      { label: 'Source platform', value: platform },
      { label: 'Share link', value: detail.canonicalUrl, url: detail.canonicalUrl },
      { label: 'Extraction code', value: detail.shareMeta?.shareCode ? 'Saved' : 'Not provided' },
      { label: 'Shared by', value: detail.shareOwner },
      { label: 'Last rechecked', value: formatFullDate(detail.lastSeenAt) },
    ])
    configureSourceAccess(root, {
      sectionId: 'netdisk-source-access', openId: 'netdisk-open-source', viewId: 'netdisk-view-mirror', downloadId: 'netdisk-download-mirror',
      sourceUrl: detail.canonicalUrl, resources, fetchedAt: snapshot.fetchedAt || detail.lastSeenAt,
    })
    const tree = query(root, '#netdisk-file-tree')
    if (tree) {
      renderRuntimeFileTree(tree, files)
    }
    setText(root, '.file-tree-total', `${detail.fileListMeta?.label || 'File list'} · ${number(files.length)}  items`)
    const evidenceSection = setDetailSection(root, 'netdisk-keyword-evidence', terms.length > 0 || riskLines.length > 0)
    replaceStructuredRows(query(evidenceSection, '.detail-list'), [
      ...terms.map((term) => ({ label: 'Matched keywords', value: term, note: 'Monitoring target match' })),
      ...riskLines.map((line) => ({ label: 'Risk basis', value: line, note: 'API analysis' })),
    ].slice(0, 8))
    const healthSection = setDetailSection(root, 'netdisk-link-health', Boolean(detail.accessState || detail.lastSeenAt))
    replaceStructuredRows(query(healthSection, '.detail-list'), [
      { label: 'Access status', value: accessLabel, note: detail.accessState || '' },
      { label: 'Last rechecked', value: formatFullDate(detail.lastSeenAt), note: platform },
      { label: 'Confidence', value: `${number(detail.confidenceScore || 0)} / 100`, note: detail.fileListMeta?.label || '' },
    ])
  } else {
    setDefinitionPairs(query(root, '[data-od-id="library-document-metadata"] .definition-grid'), [
      { label: 'Monitoring target', value: detail.watchlistName || detail.organizationName },
      { label: 'Document title', value: detail.title },
      { label: 'Uploader', value: detail.shareOwner },
      { label: 'Document type', value: detail.documentMeta?.primaryFileType },
      { label: 'Source link', value: detail.canonicalUrl, url: detail.canonicalUrl },
      { label: 'Last rechecked', value: formatFullDate(detail.lastSeenAt) },
    ])
    configureSourceAccess(root, {
      sectionId: 'library-source-access', openId: 'library-open-source', viewId: 'library-view-mirror', downloadId: 'library-download-mirror',
      sourceUrl: detail.canonicalUrl, resources, fetchedAt: snapshot.fetchedAt || detail.lastSeenAt,
    })
    const previewText = snapshot.ocrText || snapshot.previewText || detail.summary || ''
    const proofSection = setDetailSection(root, 'library-page-evidence', Boolean(previewText || terms.length))
    queryAll(proofSection, '.detail-proof').forEach((proof, index) => {
      const value = index === 0 ? previewText : ''
      proof.hidden = !value
      if (!value) return
      const label = document.createElement('span')
      label.textContent = snapshot.ocrText ? 'OCR Collected content' : 'Page collection summary'
      const content = document.createElement('strong')
      content.textContent = value.slice(0, 700)
      const source = document.createElement('code')
      source.textContent = snapshot.pageTitle || detail.title || platform
      proof.replaceChildren(label, content, source)
    })
    replaceStructuredRows(query(proofSection, '.detail-list'), terms.map((term) => ({
      label: 'Matched keywords', value: term, note: 'API match',
    })))
    const focus = queryAll(proofSection, 'button[data-toast]').find((button) => button.textContent.includes('View key pages'))
    if (focus && previewText) {
      delete focus.dataset.toast
      focus.dataset.runtimeScroll = '.detail-proof:not([hidden])'
      setActionAvailable(focus, true)
    }
    const ownership = setDetailSection(root, 'library-ownership-check', Boolean(detail.watchlistName || detail.organizationName || terms.length))
    replaceStructuredRows(query(ownership, '.detail-list'), [
      { label: 'Monitoring target', value: detail.watchlistName || detail.organizationName, note: 'Monitoring configuration' },
      { label: 'Organization name', value: detail.organizationName, note: 'Company association' },
      { label: 'Matched keywords', value: terms.join(' / '), note: terms.length ? `${terms.length} ` : '' },
    ])
    const reasoning = setDetailSection(root, 'library-risk-reasoning', riskLines.length > 0)
    replaceStructuredRows(query(reasoning, '.detail-list'), riskLines.map((line) => ({
      label: 'Risk basis', value: line, note: `${number(detail.riskScore || 0)} / 100`,
    })))
  }

  const exportButton = queryAll(root, 'button[data-toast]').find((button) => button.textContent.includes('Export list'))
  if (exportButton && netdisk) {
    const virtualTable = document.createElement('table')
    const body = document.createElement('tbody')
    files.forEach((item) => {
      const row = document.createElement('tr')
      ;[item.path || item.name, item.type, item.size].forEach((value) => {
        const cell = document.createElement('td')
        cell.textContent = value || '—'
        row.appendChild(cell)
      })
      body.appendChild(row)
    })
    virtualTable.appendChild(body)
    const key = 'document-files'
    delete exportButton.dataset.toast
    exportButton.dataset.runtimeExport = key
    state.tables.set(key, virtualTable)
    setActionAvailable(exportButton, true)
  }
  configureReviewActions(root, state, file, `/api/document-exposures/${encodeURIComponent(id)}/review`, detail.reviewStatus)
}

async function hydrateCodeDetail(root, state, id) {
  const detail = await requestJson(`/api/code-monitoring/hits/${encodeURIComponent(id)}`)
  const platform = detail.platformLabel || detail.platform || 'Unknown platform'
  const resources = normalizedResourceList(detail.previewAssets, detail.sourceLinks)
  const riskLines = [...new Set(detailRiskLines(detail))]
  bindDetailBase(root, detail, [
    ['Hit layer', detail.resultLayerLabel || detail.resultLayer],
    ['Risk level', severityLabel(severityOf(detail))],
    ['Repository status', detail.visibility || '—'],
    ['Review status', reviewStatusLabel(detail.reviewStatus)],
  ], [
    ['Source platform', platform, 'Real source'],
    ['File path', detail.filePath || '—', detail.branch || '—'],
    ['Sensitive findings', `${(detail.findings || []).length}  items`, detail.sensitiveLabel || detail.matchedRule || '—'],
    ['Last found', formatDate(detail.lastSeenAt), `${number(detail.evidenceCount || 0)}  evidence items`],
  ])
  setHeroSourceLogo(root, platform)
  setDefinitionPairs(query(root, '[data-od-id="code-repository-information"] .definition-grid'), [
    { label: 'Monitoring target', value: detail.watchlistName || detail.organizationName },
    { label: 'Repository', value: detail.repositoryFullName },
    { label: 'Branch', value: detail.branch },
    { label: 'File path', value: detail.filePath },
    { label: 'Language', value: detail.language },
    { label: 'Discovered at', value: formatFullDate(detail.lastSeenAt || detail.firstSeenAt) },
  ])
  configureSourceAccess(root, {
    sectionId: 'code-source-access', openId: 'code-open-source', viewId: 'code-view-mirror', downloadId: 'code-download-mirror',
    sourceUrl: detail.fileUrl || detail.repositoryUrl, resources, fetchedAt: detail.latestSnapshot?.fetchedAt || detail.lastSeenAt,
  })
  state.copyText = detail.codePreview || ''
  const copy = queryAll(root, 'button[data-toast]').find((button) => button.textContent.includes('Copy snippet'))
  if (copy) {
    delete copy.dataset.toast
    copy.dataset.runtimeCopy = detail.codePreview || ''
    setActionAvailable(copy, Boolean(detail.codePreview), detail.codePreview ? '' : 'The API did not provide a code snippet')
  }
  queryAll(root, '.detail-code').forEach((code) => { code.textContent = detail.codePreview || 'No code preview yet' })
  const findings = setDetailSection(root, 'code-sensitive-findings', (detail.findings || []).length > 0)
  replaceStructuredRows(query(findings, '.detail-list'), (detail.findings || []).map((item) => ({
    label: item.label || item.ruleLabel || 'Sensitive findings',
    value: item.ruleKey || detail.matchedRule || 'Rule hits',
    note: item.secretLike ? 'Secret value characteristics' : `Weight ${number(item.weight || 0)}`,
  })))
  const anchors = (detail.enterpriseAnchors || []).map((item) => ({
    label: typeof item === 'string' ? 'Company anchor' : (item.label || item.type || 'Company anchor'),
    value: typeof item === 'string' ? item : (item.value || item.term || item.name || 'Matched'),
    note: detail.enterpriseMatchLevel || '',
  }))
  const enterprise = setDetailSection(root, 'code-enterprise-context', anchors.length > 0)
  replaceStructuredRows(query(enterprise, '.detail-list'), anchors)
  const context = setDetailSection(root, 'code-context-review', true)
  replaceStructuredRows(query(context, '.detail-matrix'), [
    { label: 'Sensitive types', value: detail.sensitiveLabel || detail.sensitiveType || 'Unlabeled' },
    { label: 'Matched rules', value: detail.matchedRule || 'Unlabeled' },
    { label: 'Company association', value: detail.enterpriseMatchLevel || 'none' },
    { label: 'Suppression status', value: detail.suppressed ? 'Suppressed' : 'Not suppressed' },
  ])
  replaceStructuredRows(query(context, '.detail-list'), [
    ...riskLines.map((line) => ({ label: 'Risk basis', value: line, note: 'API analysis' })),
    ...(detail.suppressionReasons || []).map((line) => ({ label: 'Suppression basis', value: line, note: 'API analysis' })),
  ])
  configureReviewActions(root, state, 'code-detail.html', `/api/code-monitoring/hits/${encodeURIComponent(id)}/review`, detail.reviewStatus)
}

export function disposePrototypeScreen(root) {
  if (!root) return
  root.__intelligenceRefreshCleanup?.()
  root.__intelligenceRequest?.controller?.abort()
  root.__intelligenceRequest = null
  root.__intelligencePending = null
  if (root.__codeContinuousStatusTimer) {
    window.clearInterval(root.__codeContinuousStatusTimer)
    root.__codeContinuousStatusTimer = null
  }
}

export async function hydratePrototypeScreen({ root, route, file }) {
  if (!root) return
  hydrateAccount(root)
  if (!DATA_FILES.has(file)) return
  if (file === 'intelligence.html') {
    await hydrateIntelligence(root)
    return
  }
  prepareDataPage(root, file)
  const state = { tables: new Map(), refresh: null }
  installActionGuard(root, state)
  const id = String(route?.params?.eventId || route?.params?.hitId || document.body.dataset.prototypeRecordId || '')

  try {
    if (file === 'dashboard.html') await hydrateDashboard(root, state)
    else if (file === 'intelligence.html') await hydrateIntelligence(root)
    else if (file === 'ransomware.html') await hydrateRansomware(root, state)
    else if (file === 'data-leak.html') await hydrateDataLeak(root, state)
    else if (file === 'vulnerabilities.html') await hydrateVulnerabilities(root, state)
    else if (file === 'monitoring.html') {
      const source = route?.meta?.source || document.body.dataset.prototypeSource || 'netdisk'
      if (source === 'code') await hydrateCodeMonitoring(root, state)
      else await hydrateDocumentMonitoring(root, state, source)
    } else if (INCIDENT_FILES.has(file)) {
      await hydrateIncidentDetail(root, state, file, id)
    } else if (REVIEW_FILES.has(file)) {
      state.refresh = file === 'code-detail.html'
        ? () => hydrateCodeDetail(root, state, id)
        : () => hydrateDocumentDetail(root, state, file, id)
      await state.refresh()
    } else if (file === 'collector-run-detail.html') await hydrateCollectorRunDetail(root, route)
    setDataState(root, 'ready')
  } catch (error) {
    showLoadError(root, error)
  }
}
