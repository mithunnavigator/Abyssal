<template>
  <div class="document-exposure-home ti-page">
    <section class="module-grid">
      <router-link
        v-for="item in moduleCards"
        :key="item.route"
        :to="item.route"
        class="module-card ti-card ti-reveal-up"
      >
        <div class="module-card__eyebrow">{{ item.eyebrow }}</div>
        <h3 class="module-card__title">{{ item.title }}</h3>
        <p class="module-card__summary">{{ item.summary }}</p>
        <div class="module-card__stats">
          <div v-for="stat in item.stats" :key="stat.label" class="module-card__stat">
            <span>{{ stat.label }}</span>
            <strong>{{ stat.value }}</strong>
          </div>
        </div>
        <div class="module-card__action">Open module</div>
      </router-link>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useDocumentExposureApi } from '@/composables/useDocumentExposureApi'
import { formatShanghaiDateTime } from '@/composables/useShanghaiTime'

const api = useDocumentExposureApi()
const summary = ref(null)

const moduleCards = computed(() => {
  const data = summary.value || {}
  return [
    {
      route: '/document-exposure/settings',
      eyebrow: 'Monitoring configuration',
      title: 'Sessions and monitoring configuration',
      summary: 'Centrally manage platform sessions, monitoring targets, keywords, source families, file types and enable/disable strategies.',
      stats: [
        { label: 'Monitoring target', value: String(data.watchlistCount || 0) },
        { label: 'Enabled terms', value: String(data.enabledTermCount || 0) },
        { label: 'Configured sessions', value: String(data.configuredSessionCount || 0) },
        { label: 'Expired sessions', value: String(data.invalidSessionCount || 0) },
      ],
    },
    {
      route: '/document-exposure/scans',
      eyebrow: 'Scan Tasks',
      title: 'Scan execution and history',
      summary: 'Run file monitoring scans and view recent scan records, candidate counts, hit counts and error counts.',
      stats: [
        { label: 'Last scan', value: formatLastScanAt(data.lastScanAt) },
        { label: 'Last candidates', value: String(data.lastCandidateCount || 0) },
        { label: 'Last hits', value: String(data.lastHitCount || 0) },
        { label: 'Last error', value: String(data.lastErrorCount || 0) },
      ],
    },
    {
      route: '/document-exposure/results',
      eyebrow: 'Hit results',
      title: 'Hit results and verification',
      summary: 'Filter hit results, perform manual verification and open the unified event detail page to view evidence.',
      stats: [
        { label: 'Total hits', value: String(data.totalHits || 0) },
        { label: 'High risk', value: String(data.highRiskCount || 0) },
        { label: 'Pending review', value: String(data.pendingReviewCount || 0) },
      ],
    },
  ]
})

function formatLastScanAt(value) {
  if (!value) return 'Not run'
  return formatShanghaiDateTime(value)
}

async function loadSummary() {
  try {
    summary.value = await api.loadSummary()
  } catch (error) {
    ElMessage.error(error.message || 'Failed to load file monitoring overview')
  }
}

onMounted(loadSummary)
</script>

<style scoped lang="scss">
.module-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 22px;
}

.module-card {
  display: grid;
  gap: 14px;
  padding: 22px;
  color: inherit;
}

.module-card__eyebrow {
  color: var(--ti-accent-strong);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.module-card__title {
  margin: 0;
  color: var(--ti-text-primary);
  font-size: 22px;
}

.module-card__summary {
  margin: 0;
  color: var(--ti-text-secondary);
  line-height: 1.7;
}

.module-card__stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  align-content: start;
}

.module-card__stat {
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid var(--ti-border-soft);
  background: rgba(255, 255, 255, 0.72);
}

.module-card__stat span {
  display: block;
  color: var(--ti-text-muted);
  font-size: 12px;
}

.module-card__stat strong {
  display: block;
  margin-top: 6px;
  color: var(--ti-text-primary);
  font-size: 20px;
}

.module-card__action {
  color: var(--ti-primary);
  font-weight: 700;
}

@media (max-width: 1200px) {
  .module-grid {
    grid-template-columns: 1fr;
  }
}
</style>
