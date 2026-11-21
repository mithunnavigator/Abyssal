export const MODULE_KEYS = Object.freeze({
  DASHBOARD: 'dashboard',
  INTELLIGENCE_SEARCH: 'intelligence_search',
  RANSOMWARE: 'ransomware',
  DATA_LEAK: 'data_leak',
  VULNERABILITY_ALERTS: 'vulnerability_alerts',
  COLLECTOR_CONTROL: 'collector_control',
  FILE_MONITORING: 'file_monitoring',
  SOCIAL_MONITORING: 'social_monitoring',
})

export const ASSIGNABLE_MODULES = Object.freeze([
  { key: MODULE_KEYS.INTELLIGENCE_SEARCH, label: 'Intelligence search', path: '/intelligence' },
  { key: MODULE_KEYS.RANSOMWARE, label: 'Ransomware intelligence', path: '/ransomware' },
  { key: MODULE_KEYS.DATA_LEAK, label: 'Data leak intelligence', path: '/data-leak' },
  { key: MODULE_KEYS.VULNERABILITY_ALERTS, label: 'Vulnerability alerts', path: '/vulnerability-alerts' },
  { key: MODULE_KEYS.COLLECTOR_CONTROL, label: 'Collection Control', path: '/collector-control' },
  { key: MODULE_KEYS.FILE_MONITORING, label: 'File monitoring', path: '/document-exposure/netdisk' },
  { key: MODULE_KEYS.SOCIAL_MONITORING, label: 'Social platform monitoring', path: '/social-monitoring' },
])

export const ASSIGNABLE_MODULE_KEYS = Object.freeze(ASSIGNABLE_MODULES.map((item) => item.key))

export function normalizeModuleKeys(modules) {
  const requested = new Set(Array.isArray(modules) ? modules : [])
  return ASSIGNABLE_MODULE_KEYS.filter((key) => requested.has(key))
}

export function moduleLabel(moduleKey) {
  return ASSIGNABLE_MODULES.find((item) => item.key === moduleKey)?.label || moduleKey
}
