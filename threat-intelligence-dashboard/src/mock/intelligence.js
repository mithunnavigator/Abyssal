export const monitoringStatus = {
  dateLabel: '2026 March 10 (Tuesday)',
  subtitle: 'A threat intelligence monitoring interface for reporting and analysis scenarios, currently demonstrating local static placeholder data.',
  scope: 'Covers 42 key countries / 18 high-risk industries / 126 observation points',
  statusLabel: 'Monitoring status',
  statusValue: 'Collecting',
  refreshedLabel: 'Last refreshed',
  refreshedValue: '2026-03-10 09:40 CST'
}

export const routeHeaderMeta = {
  '/': {
    kicker: 'Overview',
    subtitle: 'Focuses on the overall situation of the day, cross-module event correlation and exposure in key countries.'
  },
  '/ransomware': {
    kicker: 'Ransomware intelligence',
    subtitle: 'Tracks disclosed events, active groups, affected industries and geographic spread.'
  },
  '/data-leak': {
    kicker: 'Data leak intelligence',
    subtitle: 'Monitors leak events, sensitive types, affected entities and dark web exposure leads.'
  },
  '/vulnerability-alerts': {
    kicker: 'Vulnerability alerts',
    subtitle: 'Focuses on public-source critical vulnerabilities, exploitation status, affected vendors and product popularity.'
  },
  '/threat-situation': {
    kicker: 'Threat situation',
    subtitle: 'Centrally shows cross-module trends, rankings and regional hotspots for in-depth charts.'
  },
  '/collector-control': {
    kicker: 'Collection Control',
    subtitle: 'Trigger site collection tasks and view site health and failure alerts in one place.'
  },
  '/document-exposure': {
    kicker: 'File monitoring',
    subtitle: 'File monitoring home page, showing only entries to three sub-modules: monitoring configuration, scan tasks and hit results.'
  },
  '/document-exposure/settings': {
    kicker: 'File monitoring',
    subtitle: 'Centrally manage platform sessions, monitoring targets, keywords, source families, file types and enabled state.'
  },
  '/document-exposure/scans': {
    kicker: 'File monitoring',
    subtitle: 'Run file monitoring scans and view the latest scan time, candidate counts, hit counts and error history.'
  },
  '/document-exposure/results': {
    kicker: 'File monitoring',
    subtitle: 'Filter, verify and track file monitoring hits, opening the unified event detail page when needed.'
  }
}

export const dashboardSummaryCards = [
  {
    label: 'Key events',
    value: '126',
    description: 'Entered the manual tracking pool in the last 24 hours',
    trend: '+18%',
    tone: 'danger',
    icon: 'Bell'
  },
  {
    label: 'Ransomware disclosure',
    value: '42',
    description: 'Summary of new public disclosures and forum leads',
    trend: '+11%',
    tone: 'warning',
    icon: 'Warning'
  },
  {
    label: 'Sensitive types',
    value: '7',
    description: 'Credentials, customer data and source code are the most common',
    trend: 'Customer data active',
    tone: 'primary',
    icon: 'Files'
  },
  {
    label: 'Key regions',
    value: '9',
    description: 'Regional risk index stays above the threshold',
    trend: 'Keep watching',
    tone: 'success',
    icon: 'MapLocation'
  },
  {
    label: 'Critical vulnerabilities',
    value: '12',
    description: 'New critical and very critical vulnerabilities from public sources',
    trend: '5 exploited',
    tone: 'danger',
    icon: 'WarningFilled'
  }
]

export const modulePreviewCards = [
  {
    route: '/ransomware',
    eyebrow: 'Module preview',
    title: 'Ransomware intelligence',
    summary: 'Manufacturing, healthcare and professional services remain the main victims, and LockBit and Black Basta activity stays high.',
    highlight: '42 new disclosures today',
    tone: 'danger',
    stats: [
      { label: 'Active groups', value: '18' },
      { label: 'Key industries', value: '9' },
      { label: 'Regional spillover', value: '12' }
    ]
  },
  {
    route: '/data-leak',
    eyebrow: 'Module preview',
    title: 'Data leak intelligence',
    summary: 'Credentials, customer records and source code samples make up a high share, and exposure intensity in e-commerce and finance is rising.',
    highlight: '31 new events',
    tone: 'warning',
    stats: [
      { label: 'Leak events', value: '31' },
      { label: 'Sensitive types', value: '7' },
      { label: 'Affected entities', value: '54' }
    ]
  },
  {
    route: '/vulnerability-alerts',
    eyebrow: 'Module preview',
    title: 'Vulnerability alerts',
    summary: 'Aggregates public-source critical vulnerabilities and vendor and product popularity, highlighting key events that are exploited or have a public PoC.',
    highlight: '12 new critical vulnerabilities today',
    tone: 'danger',
    stats: [
      { label: 'Exploited', value: '5' },
      { label: 'Key vendors', value: '6' },
      { label: 'Key products', value: '8' }
    ]
  },
  {
    route: '/threat-situation',
    eyebrow: 'Module preview',
    title: 'Threat situation',
    summary: 'North America, Western Europe and East Asia remain the main hotspots, with ransomware, data leaks and phishing rising together.',
    highlight: 'All trend charts in one place',
    tone: 'primary',
    stats: [
      { label: 'Critical alerts', value: '19' },
      { label: 'Hotspots', value: '6' },
      { label: 'Monitoring sources online', value: '126' }
    ]
  }
]

export const dashboardTrendSeries = {
  labels: ['03-04', '03-05', '03-06', '03-07', '03-08', '03-09', '03-10'],
  ransomware: [26, 31, 28, 36, 39, 33, 42],
  dataLeak: [18, 20, 24, 22, 26, 29, 31],
  vulnerability: [4, 5, 6, 7, 9, 10, 12],
  threatAlerts: [62, 68, 65, 71, 74, 78, 84]
}

export const dashboardCountryFocus = [
  { name: 'United States', value: 84 },
  { name: 'Germany', value: 63 },
  { name: 'United Kingdom', value: 57 },
  { name: 'Japan', value: 51 },
  { name: 'Brazil', value: 43 },
  { name: 'India', value: 39 }
]

export const crossModuleTimeline = [
  {
    time: '09:31',
    module: 'Vulnerability alerts',
    title: 'Palo Alto Networks Critical vulnerability in edge devices is now being exploited',
    detail: 'Check internet exposure and patch windows first',
    tone: 'danger'
  },
  {
    time: '09:18',
    module: 'Ransomware intelligence',
    title: 'LockBit Linked sample updated the victim list with 3 new manufacturing entities',
    detail: 'Regions include the United States, Germany and Poland',
    tone: 'danger'
  },
  {
    time: '08:46',
    module: 'Data leak intelligence',
    title: 'A new post selling customer data appeared on an e-commerce forum and entered the manual verification pool',
    detail: 'Includes email addresses, mobile numbers and shipping addresses',
    tone: 'warning'
  },
  {
    time: '08:10',
    module: 'Threat situation',
    title: 'Phishing hotspot index in East Asia broke through 70',
    detail: 'Email delivery and login impersonation rose at the same time',
    tone: 'primary'
  },
  {
    time: '07:35',
    module: 'Ransomware intelligence',
    title: 'Black Basta New disclosures in healthcare; ransomware negotiation cycles are getting shorter',
    detail: 'Victims are concentrated in North America',
    tone: 'danger'
  },
  {
    time: '06:52',
    module: 'Data leak intelligence',
    title: 'Credential bundles are being resold in dark web channels, involving financial SaaS platforms',
    detail: 'Sample has entered the verification pool',
    tone: 'warning'
  }
]

export const dashboardWatchlist = [
  {
    module: 'Vulnerability alerts',
    title: 'Critical edge device vulnerabilities rose for 2 consecutive days',
    note: 'Focus first on events that are exploited and not covered by patches',
    tone: 'danger'
  },
  {
    module: 'Ransomware intelligence',
    title: 'Black Basta Attack frequency against professional services rose for 3 consecutive days',
    note: 'Needs additional manual assessment',
    tone: 'danger'
  },
  {
    module: 'Data leak intelligence',
    title: 'Share of customer record leaks rose to 31%',
    note: 'Watch for follow-on secondary fraud chains',
    tone: 'warning'
  },
  {
    module: 'Threat situation',
    title: 'Western Europe regional risk index is close to the orange threshold',
    note: 'The regional heat matrix needs continued observation',
    tone: 'primary'
  }
]

export const vulnerabilitySummary = [
  {
    label: 'Critical vulnerabilities',
    value: '12',
    description: 'New critical and very critical vulnerabilities in the last 24 hours',
    trend: '5 exploited',
    tone: 'danger',
    icon: 'WarningFilled'
  },
  {
    label: 'Exploited',
    value: '5',
    description: 'Public sources confirmed exploitation activity',
    trend: 'Edge devices most prominent',
    tone: 'warning',
    icon: 'Bell'
  },
  {
    label: 'Affected vendors',
    value: '6',
    description: 'Number of key vendors covered by current samples',
    trend: 'Mainly network devices and middleware',
    tone: 'primary',
    icon: 'OfficeBuilding'
  },
  {
    label: 'Directly fixable',
    value: '9',
    description: 'Patch or official fix available',
    trend: '3 have only mitigations',
    tone: 'success',
    icon: 'CircleCheck'
  }
]

export const vulnerabilityEvents = [
  {
    id: 'vuln:cve-2026-24001',
    disclosureTime: '2026-03-10 09:31',
    cveId: 'CVE-2026-24001',
    title: 'Palo Alto PAN-OS GlobalProtect Gateway unauthenticated command execution',
    category: 'Remote code execution',
    vendor: 'Palo Alto Networks',
    product: 'PAN-OS GlobalProtect',
    severity: 'critical',
    cvss: 10.0,
    isExploited: true,
    patchAvailable: true,
    summary: 'Affects internet-exposed edge devices; public sources have confirmed exploitation activity.'
  },
  {
    id: 'vuln:cve-2026-18113',
    disclosureTime: '2026-03-10 08:54',
    cveId: 'CVE-2026-18113',
    title: 'Apache Tomcat Reverse proxy chain request smuggling vulnerability',
    category: 'Request smuggling',
    vendor: 'Apache',
    product: 'Tomcat',
    severity: 'high',
    cvss: 8.8,
    isExploited: false,
    patchAvailable: true,
    summary: 'A public PoC has appeared; check reverse proxy and container chains first.'
  },
  {
    id: 'vuln:cve-2026-17420',
    disclosureTime: '2026-03-10 08:07',
    cveId: 'CVE-2026-17420',
    title: 'Ivanti Connect Secure Authentication bypass',
    category: 'Authentication bypass',
    vendor: 'Ivanti',
    product: 'Connect Secure',
    severity: 'critical',
    cvss: 9.1,
    isExploited: true,
    patchAvailable: true,
    summary: 'Edge access devices are affected; public sources indicate signs of real exploitation.'
  },
  {
    id: 'vuln:cve-2026-20884',
    disclosureTime: '2026-03-10 07:22',
    cveId: 'CVE-2026-20884',
    title: 'Oracle WebLogic Critical deserialization vulnerability',
    category: 'Deserialization vulnerability',
    vendor: 'Oracle',
    product: 'WebLogic Server',
    severity: 'critical',
    cvss: 9.8,
    isExploited: false,
    patchAvailable: true,
    summary: 'Wide middleware version coverage; PoC is public.'
  },
  {
    id: 'vuln:cve-2026-21101',
    disclosureTime: '2026-03-10 06:41',
    cveId: 'CVE-2026-21101',
    title: 'FortiManager Arbitrary file write vulnerability',
    category: 'Arbitrary file write',
    vendor: 'Fortinet',
    product: 'FortiManager',
    severity: 'high',
    cvss: 8.7,
    isExploited: true,
    patchAvailable: false,
    summary: 'Patch not yet fully available; only mitigations exist for now.'
  }
]

export const vulnerabilityTrend = {
  labels: ['03-04', '03-05', '03-06', '03-07', '03-08', '03-09', '03-10'],
  values: [4, 5, 6, 7, 9, 10, 12]
}

export const vulnerabilityVendorRanking = [
  { name: 'Palo Alto Networks', value: 3 },
  { name: 'Ivanti', value: 2 },
  { name: 'Fortinet', value: 2 },
  { name: 'Apache', value: 2 },
  { name: 'Oracle', value: 1 }
]

export const vulnerabilityProductRanking = [
  { name: 'PAN-OS GlobalProtect', value: 3 },
  { name: 'Connect Secure', value: 2 },
  { name: 'Tomcat', value: 2 },
  { name: 'FortiManager', value: 2 },
  { name: 'WebLogic Server', value: 1 }
]

export const ransomwareSummary = [
  {
    label: 'Events',
    value: '42',
    description: 'New disclosed events in the last 24 hours',
    trend: '+14%',
    tone: 'danger',
    icon: 'Warning'
  },
  {
    label: 'Active groups',
    value: '18',
    description: 'Ransomware groups on the key watch list',
    trend: '2 new groups',
    tone: 'warning',
    icon: 'UserFilled'
  },
  {
    label: 'Affected industries',
    value: '9',
    description: 'Mainly manufacturing, healthcare and services',
    trend: 'Manufacturing highest',
    tone: 'primary',
    icon: 'OfficeBuilding'
  },
  {
    label: 'Trend change',
    value: '+14%',
    description: 'Compared with the same period on 2026-03-09',
    trend: 'Up for 3 consecutive days',
    tone: 'success',
    icon: 'TrendCharts'
  }
]

export const ransomwareEvents = [
  {
    disclosureTime: '2026-03-10 09:12',
    title: 'LockBit announced disclosure of financial and engineering documents of a North American manufacturer',
    category: 'Double extortion',
    attacker: 'LockBit',
    industry: 'Manufacturing',
    region: 'United States / Canada',
    severity: 'critical'
  },
  {
    disclosureTime: '2026-03-10 08:44',
    title: 'Black Basta claimed to have breached a European healthcare group and started a negotiation countdown',
    category: 'Ransom negotiation',
    attacker: 'Black Basta',
    industry: 'Healthcare',
    region: 'Germany / Poland',
    severity: 'high'
  },
  {
    disclosureTime: '2026-03-10 08:03',
    title: 'Akira deployed a new round of encryption payloads against professional services firms',
    category: 'Encryption',
    attacker: 'Akira',
    industry: 'Professional services',
    region: 'United Kingdom',
    severity: 'high'
  },
  {
    disclosureTime: '2026-03-10 07:35',
    title: 'Play group added disclosures of Southeast Asian manufacturing victims',
    category: 'Site disclosure',
    attacker: 'Play',
    industry: 'Manufacturing',
    region: 'Vietnam / Thailand',
    severity: 'medium'
  },
  {
    disclosureTime: '2026-03-10 06:58',
    title: 'RansomHub reused an old initial access chain in government contractor environments',
    category: 'Initial access',
    attacker: 'RansomHub',
    industry: 'Government contracting',
    region: 'United States',
    severity: 'high'
  },
  {
    disclosureTime: '2026-03-10 05:46',
    title: 'Cactus launched a weekend mass intrusion against Japanese retailers',
    category: 'Double extortion',
    attacker: 'Cactus',
    industry: 'Retail',
    region: 'Japan',
    severity: 'medium'
  },
  {
    disclosureTime: '2026-03-09 23:28',
    title: 'INC Ransom disclosed access credentials for a medical imaging system',
    category: 'Data exfiltration',
    attacker: 'INC Ransom',
    industry: 'Healthcare',
    region: 'France',
    severity: 'high'
  },
  {
    disclosureTime: '2026-03-09 22:12',
    title: 'Hunters International added chemical company samples to its new victims page',
    category: 'Site disclosure',
    attacker: 'Hunters',
    industry: 'Chemicals',
    region: 'Brazil',
    severity: 'medium'
  }
]

export const ransomwareTrend = {
  labels: ['03-04', '03-05', '03-06', '03-07', '03-08', '03-09', '03-10'],
  values: [18, 24, 21, 29, 33, 37, 42]
}

export const ransomwareIndustryImpact = [
  { name: 'Manufacturing', value: 17 },
  { name: 'Healthcare', value: 11 },
  { name: 'Professional services', value: 9 },
  { name: 'Retail', value: 7 },
  { name: 'Government contracting', value: 5 }
]

export const ransomwareActorRanking = [
  { name: 'LockBit', value: 12 },
  { name: 'Black Basta', value: 9 },
  { name: 'Akira', value: 7 },
  { name: 'RansomHub', value: 6 },
  { name: 'Play', value: 5 }
]

export const dataLeakSummary = [
  {
    label: 'Leak events',
    value: '31',
    description: 'New tracked events in the last 24 hours',
    trend: '+9%',
    tone: 'warning',
    icon: 'DocumentRemove'
  },
  {
    label: 'Sensitive information types',
    value: '7',
    description: 'Credentials, customer data and source code have the highest share',
    trend: 'Credentials lead',
    tone: 'primary',
    icon: 'Key'
  },
  {
    label: 'Affected entities',
    value: '54',
    description: 'Involves finance, e-commerce, education and SaaS',
    trend: '+6 key entities',
    tone: 'success',
    icon: 'OfficeBuilding'
  }
]

export const dataLeakEvents = [
  {
    disclosureTime: '2026-03-10 09:26',
    title: 'Order and contact samples of a cross-border e-commerce company’s customers are being sold on a forum',
    category: 'Customer data',
    attacker: 'Forum Seller 17',
    industry: 'E-commerce',
    region: 'United States / United Kingdom',
    severity: 'critical'
  },
  {
    disclosureTime: '2026-03-10 08:58',
    title: 'Financial SaaS back-office credential bundle entered secondary distribution channels',
    category: 'Credential leak',
    attacker: 'Broker-X',
    industry: 'Finance SaaS',
    region: 'United States',
    severity: 'high'
  },
  {
    disclosureTime: '2026-03-10 08:14',
    title: 'A manufacturing company’s source code repository samples are being packaged and sold',
    category: 'Source code leak',
    attacker: 'LockBit',
    industry: 'Manufacturing',
    region: 'Germany',
    severity: 'high'
  },
  {
    disclosureTime: '2026-03-10 07:49',
    title: 'Education platform authentication logs are circulating in gray-market channels',
    category: 'Logs and configuration',
    attacker: 'Anonymous',
    industry: 'Education',
    region: 'India',
    severity: 'medium'
  },
  {
    disclosureTime: '2026-03-10 06:42',
    title: 'Database image samples from a medical appointment system are being openly sold',
    category: 'Database leak',
    attacker: 'Market Delta',
    industry: 'Healthcare',
    region: 'France',
    severity: 'critical'
  },
  {
    disclosureTime: '2026-03-10 05:58',
    title: 'Merchant reports and contact data of a payment service provider were exfiltrated',
    category: 'Customer data',
    attacker: 'Clop',
    industry: 'Payment services',
    region: 'Brazil',
    severity: 'high'
  },
  {
    disclosureTime: '2026-03-09 23:51',
    title: 'East Asian social platform credential bundle updated in dark web channels',
    category: 'Credential leak',
    attacker: 'ComboBase',
    industry: 'Social platforms',
    region: 'Japan',
    severity: 'medium'
  },
  {
    disclosureTime: '2026-03-09 22:24',
    title: 'Internal documents and configuration fragments of a cloud provider leaked',
    category: 'Document leak',
    attacker: 'Forum Seller 09',
    industry: 'Cloud services',
    region: 'Singapore',
    severity: 'medium'
  }
]

export const dataLeakEventTrend = {
  labels: ['03-04', '03-05', '03-06', '03-07', '03-08', '03-09', '03-10'],
  values: [12, 15, 18, 16, 22, 27, 31]
}

export const sensitiveTypeShare = [
  { name: 'Credentials', value: 32 },
  { name: 'Customer data', value: 24 },
  { name: 'Source code', value: 18 },
  { name: 'Database image', value: 14 },
  { name: 'Configuration documents', value: 12 }
]

export const dataLeakRanking = [
  { name: 'Finance / North America', value: 18 },
  { name: 'E-commerce / North America', value: 15 },
  { name: 'Manufacturing / Europe', value: 13 },
  { name: 'Education / Asia-Pacific', value: 11 },
  { name: 'Healthcare / Europe', value: 10 }
]

export const threatSituationSummary = {
  title: 'Global Threat Situation Overview',
  description: 'Centrally hosts the trend, ranking and distribution charts of the ransomware, data leak and vulnerability alert modules, while module pages focus on the event lists themselves.',
  stats: [
    { label: 'Leak events', value: '31' },
    { label: 'Ransomware victims', value: '42' },
    { label: 'Vulnerability alerts', value: '12' },
    { label: 'Critical alerts', value: '19' }
  ]
}

export const threatSituationBehavior = {
  summaryCards: [
    {
      label: 'Normalized events',
      value: '126',
      description: 'Number of events that have been cleaned and structurally extracted.',
      tone: 'primary'
    },
    {
      label: 'High-risk events',
      value: '27',
      description: 'Number of events whose rule score reaches the high-risk threshold.',
      tone: 'danger'
    },
    {
      label: 'Active entities',
      value: '12',
      description: 'Number of entities available for behavior analysis.',
      tone: 'warning'
    },
    {
      label: 'Repeated victim entities',
      value: '9',
      description: 'Number of victim entities that appeared multiple times.',
      tone: 'success'
    }
  ],
  actorRiskRanking: [
    { actor: 'LockBit', eventCount: 6, crossSiteCount: 2, averageRiskScore: 78, topLeakType: 'Ransomware disclosure', lastSeenAt: '2026-03-10 09:12', reasons: ['Appeared several times recently', 'Appeared across sites'] },
    { actor: 'Black Basta', eventCount: 4, crossSiteCount: 1, averageRiskScore: 71, topLeakType: 'Ransomware disclosure', lastSeenAt: '2026-03-10 08:44', reasons: ['Appeared several times recently'] }
  ],
  victimRiskRanking: [
    { victim: 'Acme Corp', eventCount: 3, averageRiskScore: 74, lastSeenAt: '2026-03-10 09:26', industries: ['Manufacturing'] },
    { victim: 'Foo Health', eventCount: 2, averageRiskScore: 68, lastSeenAt: '2026-03-10 08:44', industries: ['Healthcare'] }
  ],
  industryRiskDistribution: [
    { name: 'Manufacturing', value: 12, averageRiskScore: 73 },
    { name: 'Healthcare', value: 9, averageRiskScore: 69 }
  ],
  regionRiskDistribution: [
    { name: 'North America', value: 18, averageRiskScore: 72 },
    { name: 'Europe', value: 13, averageRiskScore: 68 }
  ],
  anomalyEvents: [
    { id: 'victim:demo:1', title: 'LockBit disclosed financial documents of a manufacturing company', attacker: 'LockBit', victim: 'Acme Corp', category: 'Ransomware disclosure', sourceSite: 'DragonForce', disclosureTime: '2026-03-10 09:12', riskScore: 82, reasons: ['Appeared several times recently', 'Matched key intelligence type: ransomware disclosure'] }
  ],
  behaviorSignals: [
    { title: 'LockBit Most active', description: 'Most frequent recently, with the average risk score staying high.', tone: 'danger' },
    { title: 'Manufacturing is a frequently affected industry', description: 'Current high-risk events are mainly concentrated in manufacturing.', tone: 'primary' }
  ],
  extractionStats: {
    dataLeakCount: 31,
    ransomwareCount: 42,
    vulnerabilityCount: 12,
    updatedAt: '2026-03-10 09:40 CST'
  }
}

export const threatHeatmap = {
  regions: ['North America', 'Western Europe', 'East Asia', 'Southeast Asia', 'Latin America', 'Middle East'],
  categories: ['Ransomware', 'Data leak', 'Phishing', 'DDoS', 'Malware'],
  values: [
    [0, 0, 88], [0, 1, 79], [0, 2, 67], [0, 3, 54], [0, 4, 61],
    [1, 0, 72], [1, 1, 76], [1, 2, 64], [1, 3, 41], [1, 4, 58],
    [2, 0, 69], [2, 1, 63], [2, 2, 81], [2, 3, 46], [2, 4, 66],
    [3, 0, 58], [3, 1, 51], [3, 2, 72], [3, 3, 44], [3, 4, 62],
    [4, 0, 47], [4, 1, 52], [4, 2, 49], [4, 3, 39], [4, 4, 45],
    [5, 0, 43], [5, 1, 38], [5, 2, 55], [5, 3, 34], [5, 4, 51]
  ]
}

export const attackTypeShare = [
  { name: 'Ransomware', value: 28 },
  { name: 'Data leak', value: 24 },
  { name: 'Vulnerability alerts', value: 17 },
  { name: 'Phishing', value: 19 },
  { name: 'Malware', value: 16 }
]

export const threatLevelTrend = {
  labels: ['03-04', '03-05', '03-06', '03-07', '03-08', '03-09', '03-10'],
  high: [18, 21, 22, 24, 27, 29, 32],
  medium: [36, 34, 39, 41, 40, 44, 46],
  low: [22, 20, 21, 24, 23, 22, 21]
}

export const regionalThreatComparison = [
  { name: 'North America', value: 84 },
  { name: 'Western Europe', value: 72 },
  { name: 'East Asia', value: 69 },
  { name: 'Southeast Asia', value: 58 },
  { name: 'Latin America', value: 47 },
  { name: 'Middle East', value: 43 }
]

export const situationAlerts = [
  {
    level: 'critical',
    title: 'Exploitation activity for critical edge device vulnerabilities',
    description: 'Palo Alto and Ivanti-related vulnerabilities have been marked as exploited by public sources and should be included in priority response notes.',
    time: '2026-03-10 09:31',
    source: 'Vulnerability alerts'
  },
  {
    level: 'critical',
    title: 'North American manufacturing ransomware alerts keep rising',
    description: 'LockBit and RansomHub show signs of repeated deployment in manufacturing supply chains, with a clear increase in related negotiation posts.',
    time: '2026-03-10 09:24',
    source: 'Ransomware intelligence / Dark web monitoring'
  },
  {
    level: 'high',
    title: 'Database image trading appeared in Western European healthcare',
    description: 'Suspected medical appointment and records databases were listed on a forum, and sample tags match historical leak events.',
    time: '2026-03-10 08:51',
    source: 'Data leak intelligence'
  },
  {
    level: 'high',
    title: 'East Asian login impersonation activity entered a high-frequency phase',
    description: 'Page templates impersonating Microsoft 365 and Okta are reused across multiple phishing sources, with company employees as the main targets.',
    time: '2026-03-10 08:17',
    source: 'Email and domain monitoring'
  },
  {
    level: 'medium',
    title: 'Southeast Asian e-commerce sites are seeing medium-intensity DDoS warm-up',
    description: 'Edge traffic surged; attack traffic has not peaked yet, but preparatory actions are consistent.',
    time: '2026-03-10 07:42',
    source: 'Traffic monitoring'
  },
  {
    level: 'medium',
    title: 'Malware download chains revived in the Middle East',
    description: 'An old downloader family is active again, currently mostly disguised as browser updates.',
    time: '2026-03-10 06:36',
    source: 'Endpoint intelligence'
  }
]
