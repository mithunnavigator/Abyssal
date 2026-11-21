<template>
  <div class="monitor-detail ti-page">
    <section class="detail-shell">
      <header class="detail-shell__header">
        <div>
          <el-button text class="back-button" @click="goBack">Back to code monitoring</el-button>
          <div class="detail-shell__eyebrow">Code Monitoring</div>
          <h2 class="detail-shell__title">{{ detail.repositoryFullName || detail.repositoryName || '-' }}</h2>
          <div class="detail-shell__meta">
            <span>{{ detail.platformLabel || '-' }}</span>
            <span>{{ detail.filePath || '-' }}</span>
            <span>{{ formatDateTime(detail.lastSeenAt) || '-' }}</span>
          </div>
        </div>
        <div class="detail-shell__tags">
          <span :class="['layer-tag', `layer-tag--${detail.resultLayer || 'sensitive'}`]">{{ detail.resultLayerLabel || (detail.resultLayer === 'clue' ? 'Lead hit' : 'Sensitive hit') }}</span>
          <span :class="['severity-tag', `severity-tag--${detail.severity || 'low'}`]">{{ formatSeverity(detail.severity) }}</span>
          <span v-if="detail.displayBucket === 'suppressed'" class="neutral-tag neutral-tag--suppressed">Suppressed weak lead</span>
          <span class="neutral-tag">{{ detail.sensitiveLabel || detail.sensitiveType || '-' }}</span>
        </div>
      </header>

      <section class="detail-grid">
        <article class="detail-card">
          <div class="detail-card__header">
            <div>
              <div class="detail-card__eyebrow">Basics</div>
              <h3>Repository and file information</h3>
            </div>
          </div>
          <dl class="info-grid">
            <template v-for="item in infoItems" :key="item.label">
              <dt>{{ item.label }}</dt>
              <dd v-if="item.highlight" v-html="item.value" />
              <dd v-else>{{ item.value }}</dd>
            </template>
          </dl>
          <div class="asset-links">
            <a
              v-for="item in detail.sourceLinks || []"
              :key="item.label"
              :href="item.url"
              target="_blank"
              rel="noreferrer"
              class="asset-link"
            >
              {{ item.label }}
            </a>
            <a
              v-for="asset in detail.previewAssets || []"
              :key="asset.url"
              :href="asset.url"
              target="_blank"
              rel="noreferrer"
              class="asset-link"
            >
              {{ asset.label }}
            </a>
          </div>
        </article>

        <article class="detail-card">
          <div class="detail-card__header">
            <div>
              <div class="detail-card__eyebrow">Evidence</div>
              <h3>Page snapshot</h3>
            </div>
          </div>
          <div class="preview-stage">
            <a
              v-if="detail.latestSnapshot?.htmlUrl"
              :href="detail.latestSnapshot.htmlUrl"
              target="_blank"
              rel="noreferrer"
              class="preview-stage__link"
            >
              Open page snapshot
            </a>
            <div v-else class="preview-stage__empty">No page snapshot is available for this hit</div>
          </div>
        </article>
      </section>

      <section class="detail-grid detail-grid--bottom">
        <article class="detail-card">
          <div class="detail-card__header">
            <div>
              <div class="detail-card__eyebrow">Preview</div>
              <h3>Masked code snippet</h3>
            </div>
          </div>
          <pre class="code-preview" v-html="highlightedCodePreview" />
        </article>

        <article class="detail-card">
          <div class="detail-card__header">
            <div>
              <div class="detail-card__eyebrow">Findings</div>
              <h3>Sensitive information detection</h3>
            </div>
          </div>
          <div class="finding-list">
            <div v-for="finding in detail.findings || []" :key="`${finding.ruleKey}-${finding.start}-${finding.end}`" class="finding-item">
              <strong>{{ finding.label }}</strong>
              <span v-html="highlightFindingExcerpt(finding)" />
            </div>
            <div v-if="detail.resultLayer === 'clue'" class="muted-text">This is a lead hit; no explicit sensitive credentials were identified.</div>
            <div v-else-if="!(detail.findings || []).length" class="muted-text">No structured findings yet</div>
          </div>
        </article>
      </section>

      <section class="detail-card">
        <div class="detail-card__header">
          <div>
            <div class="detail-card__eyebrow">Search</div>
            <h3>Keyword hit positions / context</h3>
          </div>
        </div>
        <p class="panel-note">Matched search terms locate the target code, and sensitive rules identify the actual risky snippet shown.</p>
        <div class="context-list">
          <article v-for="item in matchedTermContexts" :key="`${item.kind}-${item.label}-${item.lineStart}-${item.lineEnd}-${item.text}`" class="context-item">
            <div class="context-item__meta">
              <strong>{{ item.label }}</strong>
              <span v-if="item.lineStart">{{ formatContextRange(item) }}</span>
            </div>
            <pre v-if="item.kind === 'code'" class="context-item__code" v-html="highlightText(item.text, detail.matchedTerm)" />
            <p v-else class="context-item__text" v-html="highlightText(item.text, detail.matchedTerm)" />
          </article>
          <div v-if="!matchedTermContexts.length" class="muted-text">No search term context was extracted for this record.</div>
        </div>
      </section>

      <section class="detail-grid detail-grid--bottom">
        <article class="detail-card">
          <div class="detail-card__header">
            <div>
              <div class="detail-card__eyebrow">Risk</div>
              <h3>Risk analysis</h3>
            </div>
          </div>
          <div class="risk-panel">
            <div :class="['risk-level-badge', `risk-level-badge--${detail.riskAnalysis?.severity || detail.severity || 'low'}`]">
              {{ formatSeverity(detail.riskAnalysis?.severity || detail.severity) }}
            </div>
            <div class="risk-notes">
              <p v-for="reason in detail.riskAnalysis?.reasons || []" :key="reason">{{ reason }}</p>
              <p v-if="!(detail.riskAnalysis?.reasons || []).length">No risk explanation yet</p>
            </div>
          </div>
        </article>

        <article class="detail-card">
          <div class="detail-card__header">
            <div>
              <div class="detail-card__eyebrow">Handling</div>
              <h3>Action</h3>
            </div>
          </div>
          <div class="review-form">
            <el-input v-model="reviewer" placeholder="Handler" />
            <el-input v-model="note" type="textarea" :rows="3" placeholder="Additional notes" />
            <div class="review-actions">
              <el-button type="danger" @click="submitReview('confirmed')">Confirm leak</el-button>
              <el-button @click="submitReview('false_positive')">Mark as false positive</el-button>
              <el-button plain @click="submitReview('closed')">Close event</el-button>
            </div>
          </div>
        </article>
      </section>

      <section class="detail-card">
        <div class="detail-card__header">
          <div>
            <div class="detail-card__eyebrow">Records</div>
            <h3>Handling records</h3>
          </div>
        </div>
        <div class="review-history">
          <div v-for="item in detail.reviews || []" :key="`${item.created_at}-${item.status}`" class="review-history__item">
            <strong>{{ item.status }}</strong>
            <span>{{ item.reviewer || 'system' }}</span>
            <span>{{ formatDateTime(item.created_at) || '-' }}</span>
            <p>{{ item.note || 'No notes' }}</p>
          </div>
          <div v-if="!(detail.reviews || []).length" class="muted-text">No handling records yet</div>
        </div>
      </section>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { useCodeMonitoringApi } from '@/composables/useCodeMonitoringApi'
import { highlightKeywordsHtml, maskSensitivePreview } from '@/composables/highlightText'
import { formatShanghaiDateTime } from '@/composables/useShanghaiTime'

const route = useRoute()
const router = useRouter()
const api = useCodeMonitoringApi()

const detail = reactive({
  latestSnapshot: {},
  findings: [],
  matchedTermContexts: [],
  reviews: [],
  previewAssets: [],
  sourceLinks: [],
  riskAnalysis: {},
})
const reviewer = ref('ui')
const note = ref('')

const enterpriseAnchors = computed(() => (Array.isArray(detail.enterpriseAnchors) ? detail.enterpriseAnchors : []))
const riskPromotionReasons = computed(() => (Array.isArray(detail.riskPromotionReasons) ? detail.riskPromotionReasons : []))
const suppressionReasons = computed(() => (Array.isArray(detail.suppressionReasons) ? detail.suppressionReasons : []))
const enterpriseAnchorText = computed(() => enterpriseAnchors.value.map((item) => `${item.label || item.type}: ${item.value || '-'}`).join(' / '))
const riskPromotionText = computed(() => riskPromotionReasons.value.join(' / '))
const suppressionReasonText = computed(() => suppressionReasons.value.join(' / '))
const enterpriseMatchLevelLabel = computed(() => {
  if (detail.enterpriseMatchLevel === 'strong') return 'Strong anchor'
  if (detail.enterpriseMatchLevel === 'alias') return 'Alias anchor'
  if (detail.enterpriseMatchLevel === 'weak') return 'Weak anchor'
  return 'Not matched'
})
const displayBucketLabel = computed(() => (detail.displayBucket === 'suppressed' ? 'Additional list / Suppressed weak leads' : 'Main list / High-value results'))

const infoItems = computed(() => [
  { label: 'Monitoring target', value: detail.watchlistName || '-' },
  { label: 'Organization', value: detail.organizationName || '-' },
  { label: 'Source platform', value: detail.platformLabel || '-' },
  { label: 'Repository URL', value: detail.repositoryUrl || '-' },
  { label: 'File path', value: detail.filePath || '-' },
  { label: 'Branch', value: detail.branch || '-' },
  { label: 'Matched search terms', value: highlightText(detail.matchedTerm || '-', detail.matchedTerm), highlight: true },
  { label: 'Sensitive types', value: detail.sensitiveLabel || detail.sensitiveType || '-' },
  { label: 'Display group', value: displayBucketLabel.value },
  { label: 'Company hit level', value: enterpriseMatchLevelLabel.value },
  { label: 'Company anchor basis', value: enterpriseAnchorText.value || '-' },
  { label: 'Escalation reason', value: riskPromotionText.value || '-' },
  { label: 'Suppression reason', value: suppressionReasonText.value || '-' },
])

const matchedTermContexts = computed(() => (Array.isArray(detail.matchedTermContexts) ? detail.matchedTermContexts : []))

const previewHighlightTerms = computed(() => {
  const keywords = [detail.matchedTerm]
  for (const finding of detail.findings || []) {
    const value = String(finding?.value || '').trim()
    const excerpt = String(finding?.excerpt || '').trim()
    if (value) {
      keywords.push(value)
      keywords.push(maskSensitivePreview(value))
    }
    if (excerpt && excerpt !== value) {
      keywords.push(excerpt)
      keywords.push(maskSensitivePreview(excerpt))
    }
  }
  return keywords
})

const highlightedCodePreview = computed(() => highlightText(detail.codePreview || 'No code preview yet', previewHighlightTerms.value))

function highlightText(text, keywords) {
  return highlightKeywordsHtml(text, keywords)
}

function highlightFindingExcerpt(finding) {
  const excerpt = String(finding?.excerpt || '-')
  return highlightText(excerpt, [
    detail.matchedTerm,
    finding?.value,
    finding?.excerpt,
    maskSensitivePreview(finding?.value),
    maskSensitivePreview(finding?.excerpt),
  ])
}

function formatContextRange(item) {
  const start = Number(item?.lineStart || 0)
  const end = Number(item?.lineEnd || 0)
  if (!start) return ''
  if (!end || end === start) return `Line ${start}`
  return `Lines ${start}-${end}`
}

function formatSeverity(value) {
  if (value === 'high') return 'High'
  if (value === 'medium') return 'Medium'
  if (value === 'low') return 'Low'
  return value || '-'
}

function formatDateTime(value) {
  return formatShanghaiDateTime(value)
}

function goBack() {
  const from = Array.isArray(route.query.from) ? route.query.from[0] : route.query.from
  if (from) {
    router.push(String(from))
    return
  }
  router.push('/document-exposure/code-monitoring')
}

async function loadDetail() {
  try {
    const payload = await api.loadHitDetail(route.params.hitId)
    Object.assign(detail, payload || {})
  } catch (error) {
    ElMessage.error(error.message || 'Failed to load code monitoring details')
  }
}

async function submitReview(status) {
  try {
    await api.reviewHit(route.params.hitId, {
      status,
      reviewer: reviewer.value || 'ui',
      note: note.value,
    })
    note.value = ''
    await loadDetail()
    ElMessage.success('Handling status updated')
  } catch (error) {
    ElMessage.error(error.message || 'Failed to update handling status')
  }
}

onMounted(loadDetail)
</script>

<style scoped lang="scss">
.detail-shell {
  display: grid;
  gap: 20px;
  padding: 24px;
  border-radius: 28px;
  background: #ffffff;
  color: var(--ti-text-primary);
  border: 1px solid rgba(116, 142, 184, 0.14);
  box-shadow: 0 24px 50px rgba(32, 57, 96, 0.08);
}

.detail-shell__header,
.detail-card__header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.back-button {
  padding-left: 0;
  color: var(--ti-primary);
}

.detail-shell__eyebrow,
.detail-card__eyebrow {
  color: var(--ti-primary);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.detail-shell__title {
  margin: 8px 0;
  font-size: 28px;
}

.detail-shell__meta,
.detail-shell__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  color: var(--ti-text-muted);
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.detail-grid--bottom {
  grid-template-columns: 1fr 1fr;
}

.detail-card {
  padding: 18px;
  border: 1px solid rgba(116, 142, 184, 0.14);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 14px 30px rgba(32, 57, 96, 0.06);
}

.detail-card h3 {
  margin: 6px 0 0;
  font-size: 18px;
}

.asset-links,
.review-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.asset-links {
  margin-top: 16px;
}

.asset-link,
.layer-tag,
.neutral-tag,
.severity-tag {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
}

.asset-link,
.layer-tag,
.neutral-tag {
  background: rgba(255, 255, 255, 0.98);
  border: 1px solid rgba(116, 142, 184, 0.18);
  color: var(--ti-text-primary);
}

.layer-tag--sensitive {
  background: rgba(229, 85, 87, 0.14);
  color: #d9363e;
}

.layer-tag--clue {
  background: rgba(38, 113, 220, 0.14);
  color: #1c6dd0;
}

.neutral-tag--suppressed {
  background: rgba(255, 173, 76, 0.18);
  border-color: rgba(255, 173, 76, 0.32);
  color: #b76a18;
}

.severity-tag {
  font-weight: 700;
}

.severity-tag--high {
  background: rgba(229, 85, 87, 0.2);
  color: #ff9b9d;
}

.severity-tag--medium {
  background: rgba(255, 173, 76, 0.2);
  color: #ffcb7d;
}

.severity-tag--low {
  background: rgba(70, 192, 138, 0.2);
  color: #7ce2b0;
}

.info-grid {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 12px 16px;
  margin-top: 18px;
}

.info-grid dt {
  color: var(--ti-text-secondary);
}

.info-grid dd {
  margin: 0;
  color: var(--ti-text-primary);
  word-break: break-all;
}

.preview-stage {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 320px;
  margin-top: 16px;
  border-radius: 18px;
  background: rgba(244, 248, 255, 0.9);
  overflow: hidden;
}

.preview-stage__link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 180px;
  min-height: 44px;
  padding: 0 18px;
  border-radius: 999px;
  background: rgba(38, 113, 220, 0.1);
  border: 1px solid rgba(38, 113, 220, 0.18);
  color: var(--ti-primary);
  font-weight: 700;
}

.code-preview {
  min-height: 260px;
  max-height: 520px;
  margin: 16px 0 0;
  padding: 16px;
  border-radius: 16px;
  background: rgba(247, 250, 255, 0.96);
  border: 1px solid rgba(116, 142, 184, 0.14);
  color: var(--ti-text-primary);
  white-space: pre-wrap;
  overflow-y: auto;
  overflow-x: hidden;
}

.panel-note {
  margin: 16px 0 0;
  color: var(--ti-text-secondary);
}

:deep(.keyword-highlight) {
  color: #d9363e;
  font-weight: 700;
}

.context-list,
.finding-list,
.review-history {
  display: grid;
  gap: 10px;
  margin-top: 16px;
}

.context-item,
.finding-item,
.review-history__item {
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(247, 250, 255, 0.96);
  border: 1px solid rgba(116, 142, 184, 0.14);
}

.context-item__meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 10px;
  color: var(--ti-text-secondary);
}

.context-item__code,
.context-item__text {
  margin: 10px 0 0;
  color: var(--ti-text-primary);
}

.context-item__code {
  white-space: pre-wrap;
  word-break: break-word;
}

.context-item__text {
  word-break: break-all;
}

.risk-panel {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 16px;
  align-items: center;
  margin-top: 16px;
}

.risk-level-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 120px;
  min-height: 120px;
  padding: 12px;
  border-radius: 28px;
  border: 1px solid rgba(97, 145, 222, 0.18);
  background: rgba(247, 250, 255, 0.96);
  font-size: 30px;
  font-weight: 700;
  text-align: center;
}

.risk-level-badge--high {
  color: #d9363e;
  background: rgba(229, 85, 87, 0.14);
}

.risk-level-badge--medium {
  color: #d48806;
  background: rgba(255, 173, 76, 0.16);
}

.risk-level-badge--low {
  color: #389e0d;
  background: rgba(70, 192, 138, 0.14);
}

.risk-notes {
  display: grid;
  gap: 10px;
}

.review-form {
  display: grid;
  gap: 12px;
  margin-top: 16px;
}

.muted-text {
  color: var(--ti-text-muted);
}

:deep(.el-button--default) {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(116, 142, 184, 0.18);
  color: var(--ti-text-primary);
}

:deep(.el-input__wrapper),
:deep(.el-textarea__inner) {
  background: rgba(255, 255, 255, 0.98);
  border: 1px solid rgba(116, 142, 184, 0.16);
  color: var(--ti-text-primary);
}

@media (max-width: 1080px) {
  .detail-grid,
  .detail-grid--bottom,
  .risk-panel,
  .detail-shell__header,
  .detail-card__header {
    grid-template-columns: 1fr;
    flex-direction: column;
  }

  .info-grid {
    grid-template-columns: 1fr;
  }
}
</style>
