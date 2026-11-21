<template>
  <div class="document-exposure-results ti-page">
    <section class="content-grid">
      <div class="ti-card ti-reveal-up">
        <div class="ti-card-body">
          <EventTableToolbar
            eyebrow="Hit results"
            title="File Monitoring Hit List"
            description="Filter and verify suspected file exposure hits from document platforms and netdisk aggregators."
            :search-value="searchValue"
            search-placeholder="Search titles, platforms, company names"
            :active-filters="activeFilters"
            @update:search-value="searchValue = $event"
          >
            <template #filters>
              <el-select v-model="sourceFamilyFilter" placeholder="Source family" style="width: 160px" clearable>
                <el-option label="Netdisk aggregators" value="netdisk_aggregator" />
                <el-option label="Document platforms" value="document_library" />
              </el-select>
              <el-select v-model="platformFilter" placeholder="Platform" style="width: 160px" clearable>
                <el-option v-for="item in platformOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
              <el-select v-model="reviewFilter" placeholder="Verification status" style="width: 160px" clearable>
                <el-option v-for="item in reviewOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
              <el-select v-model="accessStateFilter" placeholder="Access status" style="width: 160px" clearable>
                <el-option v-for="item in accessStateOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
              <el-select v-model="matchedTermFilter" placeholder="Keyword" style="width: 180px" clearable filterable>
                <el-option v-for="item in matchedTermOptions" :key="item" :label="item" :value="item" />
              </el-select>
            </template>
            <template #actions>
              <el-button plain :loading="loadingHits" @click="loadHits">Refresh results</el-button>
            </template>
          </EventTableToolbar>

          <div class="ti-table-shell table-shell">
            <el-table :data="pagedHits" table-layout="fixed" style="width: 100%">
              <el-table-column prop="lastSeenAt" label="Last found" :width="resultLastSeenColumnWidth">
                <template #default="{ row }">
                  {{ formatDateTime(row.lastSeenAt) || '-' }}
                </template>
              </el-table-column>
              <el-table-column v-if="showResultSourceColumn" label="Source family" :width="resultSourceColumnWidth">
                <template #default="{ row }">
                  {{ sourceFamilyLabelMap[row.sourceFamily] || row.sourceFamily || '-' }}
                </template>
              </el-table-column>
              <el-table-column v-if="showResultPlatformColumn" label="Platform" :width="resultPlatformColumnWidth">
                <template #default="{ row }">
                  {{ row.platformLabel || row.platform || '-' }}
                </template>
              </el-table-column>
              <el-table-column prop="title" label="Title" :min-width="resultTitleMinWidth" show-overflow-tooltip />
              <el-table-column prop="riskScore" label="Risk score" :width="resultRiskColumnWidth" />
              <el-table-column v-if="showResultFileCountColumn" prop="fileCount" label="Files" :width="resultFileCountColumnWidth" />
              <el-table-column v-if="showResultReviewStatusColumn" label="Verification status" :width="resultReviewStatusColumnWidth">
                <template #default="{ row }">
                  {{ reviewLabelMap[row.reviewStatus] || row.reviewStatus || '-' }}
                </template>
              </el-table-column>
              <el-table-column v-if="showResultReviewActionsColumn" label="Review" :width="resultReviewActionsColumnWidth">
                <template #default="{ row }">
                  <div class="review-actions">
                    <el-button size="small" @click="reviewHit(row, 'confirmed')">Confirmed</el-button>
                    <el-button size="small" plain @click="reviewHit(row, 'false_positive')">False positive</el-button>
                    <el-button size="small" plain @click="reviewHit(row, 'closed')">Close</el-button>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="View" :width="resultActionColumnWidth">
                <template #default="{ row }">
                  <el-button size="small" type="primary" @click="viewEvent(row)">View</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>

          <div class="table-footer">
            <div class="table-footer__note">Showing {{ filteredHits.length }} hits; review them and open the unified event detail page to view screenshots, snapshots and file lists.</div>
            <el-pagination
              v-model:current-page="currentPage"
              v-model:page-size="pageSize"
              :page-sizes="[10, 20, 50]"
              :total="filteredHits.length"
              layout="total, sizes, prev, pager, next"
              background
            />
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import EventTableToolbar from '@/components/common/EventTableToolbar.vue'
import { useDocumentExposureApi } from '@/composables/useDocumentExposureApi'
import { useIntelligenceData } from '@/composables/useIntelligenceData'
import { formatShanghaiDateTime } from '@/composables/useShanghaiTime'

const api = useDocumentExposureApi()
const router = useRouter()
const { refresh } = useIntelligenceData()

const loadingHits = ref(false)
const hits = ref([])
const currentPage = ref(1)
const pageSize = ref(10)
const searchValue = ref('')
const sourceFamilyFilter = ref('')
const platformFilter = ref('')
const reviewFilter = ref('')
const accessStateFilter = ref('')
const matchedTermFilter = ref('')
const viewportWidth = ref(typeof window === 'undefined' ? 1440 : window.innerWidth)

const sourceFamilyLabelMap = {
  netdisk_aggregator: 'Netdisk aggregators',
  document_library: 'Document platforms',
}

const reviewLabelMap = {
  new: 'Pending',
  triaged: 'Triaged',
  confirmed: 'Confirmed',
  false_positive: 'False positive',
  closed: 'Closed',
}

const accessStateLabelMap = {
  public: 'Public access',
  login_required: 'Login required',
  captcha: 'CAPTCHA',
  removed: 'Removed',
  forbidden: 'Access forbidden',
  unknown: 'Unknown',
}

const showResultSourceColumn = computed(() => viewportWidth.value >= 1180)
const showResultPlatformColumn = computed(() => viewportWidth.value >= 1500)
const showResultFileCountColumn = computed(() => viewportWidth.value >= 1280)
const showResultReviewStatusColumn = computed(() => viewportWidth.value >= 1180)
const showResultReviewActionsColumn = computed(() => viewportWidth.value >= 1680)
const resultLastSeenColumnWidth = computed(() => viewportWidth.value < 1500 ? 132 : 150)
const resultSourceColumnWidth = computed(() => viewportWidth.value < 1500 ? 118 : 130)
const resultPlatformColumnWidth = computed(() => 130)
const resultTitleMinWidth = computed(() => viewportWidth.value < 1180 ? 190 : viewportWidth.value < 1500 ? 240 : 300)
const resultRiskColumnWidth = computed(() => viewportWidth.value < 1500 ? 76 : 82)
const resultFileCountColumnWidth = computed(() => viewportWidth.value < 1500 ? 80 : 84)
const resultReviewStatusColumnWidth = computed(() => viewportWidth.value < 1500 ? 94 : 100)
const resultReviewActionsColumnWidth = computed(() => 180)
const resultActionColumnWidth = computed(() => viewportWidth.value < 1500 ? 72 : 82)

const reviewOptions = [
  { label: 'Pending', value: 'new' },
  { label: 'Triaged', value: 'triaged' },
  { label: 'Confirmed', value: 'confirmed' },
  { label: 'False positive', value: 'false_positive' },
  { label: 'Closed', value: 'closed' },
]

const accessStateOptions = [
  { label: 'Public access', value: 'public' },
  { label: 'Login required', value: 'login_required' },
  { label: 'CAPTCHA', value: 'captcha' },
  { label: 'Removed', value: 'removed' },
  { label: 'Access forbidden', value: 'forbidden' },
  { label: 'Unknown', value: 'unknown' },
]

const platformOptions = computed(() =>
  [...new Map(
    hits.value
      .filter((item) => item.platform)
      .map((item) => [item.platform, { value: item.platform, label: item.platformLabel || item.platform }])
  ).values()]
)

const matchedTermOptions = computed(() =>
  [...new Set(
    hits.value.flatMap((item) =>
      Array.isArray(item.matchedTerms)
        ? item.matchedTerms.map((term) => String(term?.term || '').trim()).filter(Boolean)
        : []
    )
  )]
)

const filteredHits = computed(() => {
  const keyword = searchValue.value.trim().toLowerCase()
  return hits.value.filter((item) => {
    const matchesKeyword =
      !keyword ||
      [item.title, item.platformLabel, item.platform, item.organizationName, item.watchlistName]
        .some((field) => String(field || '').toLowerCase().includes(keyword))
    const matchesFamily = !sourceFamilyFilter.value || item.sourceFamily === sourceFamilyFilter.value
    const matchesPlatform = !platformFilter.value || item.platform === platformFilter.value
    const matchesReview = !reviewFilter.value || item.reviewStatus === reviewFilter.value
    const matchesAccess = !accessStateFilter.value || item.accessState === accessStateFilter.value
    const matchesTerm =
      !matchedTermFilter.value ||
      (Array.isArray(item.matchedTerms) &&
        item.matchedTerms.some((term) => String(term?.term || '').trim() === matchedTermFilter.value))
    return matchesKeyword && matchesFamily && matchesPlatform && matchesReview && matchesAccess && matchesTerm
  })
})

const pagedHits = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredHits.value.slice(start, start + pageSize.value)
})

const activeFilters = computed(() => {
  const filters = []
  if (sourceFamilyFilter.value) filters.push(`Source: ${sourceFamilyLabelMap[sourceFamilyFilter.value] || sourceFamilyFilter.value}`)
  if (platformFilter.value) filters.push(`Platform: ${platformOptions.value.find((item) => item.value === platformFilter.value)?.label || platformFilter.value}`)
  if (reviewFilter.value) filters.push(`Verify: ${reviewLabelMap[reviewFilter.value] || reviewFilter.value}`)
  if (accessStateFilter.value) filters.push(`Access: ${accessStateLabelMap[accessStateFilter.value] || accessStateFilter.value}`)
  if (matchedTermFilter.value) filters.push(`Keyword: ${matchedTermFilter.value}`)
  if (searchValue.value.trim()) filters.push(`Search: ${searchValue.value.trim()}`)
  return filters
})

function formatDateTime(value) {
  return formatShanghaiDateTime(value)
}

async function loadHits() {
  loadingHits.value = true
  try {
    hits.value = await api.loadHits({ limit: 300 })
  } catch (error) {
    ElMessage.error(error.message || 'Failed to load hit results')
  } finally {
    loadingHits.value = false
  }
}

async function reviewHit(row, status) {
  try {
    await api.reviewHit(row.id, { status, reviewer: 'ui', note: '' })
    await Promise.all([loadHits(), refresh()])
    ElMessage.success('Verification status updated')
  } catch (error) {
    ElMessage.error(error.message || 'Failed to update verification status')
  }
}

function viewEvent(row) {
  if (!row?.id) return
  sessionStorage.setItem(`event-back:document:${row.id}`, '/document-exposure/results')
  router.push({ name: 'EventDetail', params: { eventId: `document:${row.id}` } })
}

watch([filteredHits, pageSize], () => {
  const maxPage = Math.max(1, Math.ceil(filteredHits.value.length / pageSize.value))
  if (currentPage.value > maxPage) currentPage.value = maxPage
})

function updateViewportWidth() {
  viewportWidth.value = window.innerWidth
}

onMounted(() => {
  updateViewportWidth()
  window.addEventListener('resize', updateViewportWidth)
  loadHits()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateViewportWidth)
})
</script>

<style scoped lang="scss">
.content-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 22px;
}

.ti-table-shell {
  margin-top: 18px;
}

.review-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.table-footer {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  margin-top: 18px;
}

.table-footer__note {
  color: var(--ti-text-muted);
  font-size: 12px;
}

@media (max-width: 1200px) {
  .table-footer {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
