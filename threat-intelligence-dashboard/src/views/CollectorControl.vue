<template>
  <div class="collector-control-page ti-page">
    <section class="ti-panel ti-reveal-up">
      <div class="control-hero">
        <div class="control-hero__copy">
          <span class="ti-kicker">Collection Console</span>
          <h3>Site run control and intelligence sync</h3>
          <p>Trigger collection tasks, maintain vulnerability and ransomware intelligence sync, and view site health and recent failed tasks in one place.</p>
        </div>
        <div class="control-hero__stats">
          <div class="metric-card">
            <span>Overall status</span>
            <strong>{{ jobsData.overall_status || 'Unknown' }}</strong>
          </div>
          <div class="metric-card">
            <span>Running tasks</span>
            <strong>{{ jobsData.running_jobs || 0 }}</strong>
          </div>
          <div class="metric-card">
            <span>Stalled</span>
            <strong>{{ jobsData.stale_jobs || 0 }}</strong>
          </div>
          <div class="metric-card">
            <span>24 h failures</span>
            <strong>{{ jobsData.failed_jobs_24h || 0 }}</strong>
          </div>
          <div class="metric-card">
            <span>Continuous run</span>
            <strong>{{ continuousStatus.enabled ? 'Running' : 'Not started' }}</strong>
          </div>
          <div class="metric-card">
            <span>Last scheduled</span>
            <strong class="metric-card__value metric-card__value--small">{{ continuousStatus.last_tick_at || 'None' }}</strong>
          </div>
          <div class="metric-card">
            <span>Browser Worker</span>
            <strong>{{ browserWorkerLabel }}</strong>
          </div>
          <div class="metric-card">
            <span>Local browser pool</span>
            <strong>{{ localBrowserPoolLabel }}</strong>
          </div>
        </div>
      </div>
    </section>

    <section class="ti-card ti-reveal-up tor-bridge-panel">
      <div class="tor-bridge-panel__header">
        <div>
          <h3>Bridges</h3>
          <p>In regions where Tor is blocked, bridges can be used to access the Tor network safely. Network conditions differ by region, so bridge effectiveness may vary.</p>
        </div>
        <div class="health-actions">
          <el-button plain :loading="torBridgeLoading" @click="loadTorBridgeStatus">Refresh status</el-button>
          <el-button type="primary" :loading="torBridgeStartLoading || torBridgeSaveLoading" :disabled="!torBridgeConfig.enabled || torBridgeConfig.process_running" @click="startTorBridge">Connect</el-button>
          <el-button type="danger" plain :loading="torBridgeStopLoading" :disabled="!torBridgeConfig.process_running" @click="stopTorBridge">Disconnect</el-button>
        </div>
      </div>

      <div class="tor-bridge-body">
        <div class="tor-bridge-primary">
          <div class="tor-bridge-toggle">
            <el-switch v-model="torBridgeConfig.enabled" @change="handleTorBridgeEnabledChange" />
            <span>Use bridge</span>
          </div>

          <div class="tor-bridge-current">
            <div class="tor-bridge-current__head">
              <strong>Your bridges</strong>
              <div>
                <span>Built-in</span>
                <el-button text class="tor-bridge-current__menu" @click="openBuiltinBridgeDialog">...</el-button>
              </div>
            </div>
            <div class="tor-bridge-current__body">
              <strong>{{ torBridgeModeLabel }}</strong>
              <p>{{ torBridgeDescription }}</p>
            </div>
          </div>

          <div class="tor-bridge-change">
            <h4>Change bridge</h4>
            <div class="tor-bridge-change__row">
              <div>
                <span>Choose a Tor Browser built-in bridge</span>
                <p>obfs4 / Snowflake / meek</p>
              </div>
              <el-button @click="openBuiltinBridgeDialog">Choose built-in bridge...</el-button>
            </div>
            <div class="tor-bridge-change__row">
              <div>
                <span>Enter a known bridge address</span>
                <p>Paste bridge lines and connect</p>
              </div>
              <el-button @click="openCustomBridgeDialog">Change bridge...</el-button>
            </div>
          </div>
        </div>

        <div class="tor-bridge-runtime">
          <div class="tor-bridge-runtime__item">
            <span>Connection status</span>
            <strong :class="{ 'tor-bridge-runtime__connected': torBridgeConfig.connected }">{{ torBridgeStatusLabel }}</strong>
          </div>
          <div class="tor-bridge-runtime__item">
            <span>Tor Exit IP</span>
            <strong class="tor-bridge-runtime__ip">{{ torBridgeExitIpLabel }}</strong>
          </div>
          <div class="tor-bridge-runtime__item tor-bridge-runtime__progress">
            <div class="tor-bridge-runtime__progress-head">
              <span>Connection progress</span>
              <strong>{{ torBridgeProgress }}%</strong>
            </div>
            <el-progress :percentage="torBridgeProgress" :status="torBridgeProgressStatus" :stroke-width="8" :show-text="false" />
            <p>{{ torBridgeProgressSummary }}</p>
          </div>
          <div class="tor-bridge-runtime__item">
            <span>Collection proxy</span>
            <strong>{{ torBridgeConfig.collector_proxy || `socks5h://${torBridgeConfig.socks_host}:${torBridgeConfig.socks_port}` }}</strong>
          </div>
        </div>
      </div>
      <p v-if="torBridgeConfig.last_error" class="panel-note panel-note--danger">Last error:{{ torBridgeConfig.last_error }}</p>
    </section>

    <el-dialog v-model="builtinBridgeDialogVisible" title="Choose built-in bridge" width="720px" class="builtin-bridge-dialog">
      <p class="builtin-bridge-dialog__intro">Tor The browser includes special bridges called “pluggable transports” that can hide the fact that you are using Tor.</p>
      <el-radio-group v-model="builtinBridgeSelection" class="builtin-bridge-list">
        <el-radio v-for="option in builtinBridgeOptions" :key="option.value" :label="option.value" class="builtin-bridge-option">
          <div>
            <div class="builtin-bridge-option__title">
              <strong>{{ option.label }}</strong>
              <span v-if="option.value === torBridgeConfig.bridge_mode">Current bridge</span>
            </div>
            <p>{{ option.description }}</p>
          </div>
        </el-radio>
      </el-radio-group>
      <template #footer>
        <el-button type="primary" :loading="torBridgeStartLoading || torBridgeSaveLoading" @click="confirmBuiltinBridgeSelection">Connect</el-button>
        <el-button @click="builtinBridgeDialogVisible = false">Cancel</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="customBridgeDialogVisible" title="Enter a known bridge address" width="720px">
      <el-input v-model="customBridgeLinesDraft" type="textarea" :rows="6" placeholder="Bridge obfs4 ... / Bridge snowflake ..." />
      <template #footer>
        <el-button type="primary" :loading="torBridgeStartLoading || torBridgeSaveLoading" @click="confirmCustomBridgeSelection">Connect</el-button>
        <el-button @click="customBridgeDialogVisible = false">Cancel</el-button>
      </template>
    </el-dialog>

    <section class="ti-card ti-reveal-up">
      <div class="ti-card-header">
        <div class="ti-card-title">Public-source vulnerability sync</div>
        <div class="health-actions">
          <el-select v-model="vulnerabilityIntervalHours" style="width: 150px">
            <el-option label="Every 1 hour" :value="1" />
            <el-option label="Every 4 hours" :value="4" />
          </el-select>
          <el-button plain :loading="vulnerabilityRunLoading" @click="runVulnerabilitySyncOnce">Sync once</el-button>
          <el-button type="success" :loading="vulnerabilityContinuousLoading" :disabled="vulnerabilitySync.enabled" @click="startVulnerabilitySync">Start auto-sync</el-button>
          <el-button type="danger" plain :loading="vulnerabilityContinuousLoading" :disabled="!vulnerabilitySync.enabled" @click="stopVulnerabilitySync">Stop auto-sync</el-button>
        </div>
      </div>
      <div class="ti-card-body status-grid">
        <div class="metric-card">
          <span>Auto-sync</span>
          <strong>{{ vulnerabilitySync.enabled ? 'Open' : 'Closed' }}</strong>
        </div>
        <div class="metric-card">
          <span>Sync interval</span>
          <strong>{{ vulnerabilitySync.interval_seconds ? `${Math.round(vulnerabilitySync.interval_seconds / 3600)}  hours` : 'Not set' }}</strong>
        </div>
        <div class="metric-card">
          <span>Vulnerability records</span>
          <strong>{{ vulnerabilitySync.record_count || 0 }}</strong>
        </div>
        <div class="metric-card">
          <span>Last sync</span>
          <strong class="metric-card__value metric-card__value--small">{{ vulnerabilitySync.last_success_at || 'None' }}</strong>
        </div>
      </div>
    </section>

    <section class="ti-card ti-reveal-up">
      <div class="ti-card-header">
        <div class="ti-card-title">ransomware.live Sync integration</div>
        <div class="health-actions">
          <el-select v-model="ransomwareIntervalHours" style="width: 150px">
            <el-option label="Every 1 hour" :value="1" />
            <el-option label="Every 4 hours" :value="4" />
          </el-select>
          <el-button plain :loading="ransomwareRunLoading" @click="runRansomwareSyncOnce">Sync once</el-button>
          <el-button type="success" :loading="ransomwareContinuousLoading" :disabled="ransomwareSync.enabled" @click="startRansomwareSync">Start auto-sync</el-button>
          <el-button type="danger" plain :loading="ransomwareContinuousLoading" :disabled="!ransomwareSync.enabled" @click="stopRansomwareSync">Stop auto-sync</el-button>
        </div>
      </div>
      <div class="ti-card-body">
        <div class="status-grid status-grid--compact">
          <div class="metric-card">
            <span>API Key</span>
            <strong>{{ ransomwareConfig.has_api_key ? 'Configured' : 'Not configured' }}</strong>
          </div>
          <div class="metric-card">
            <span>Auto-sync</span>
            <strong>{{ ransomwareSync.enabled ? 'Open' : 'Closed' }}</strong>
          </div>
          <div class="metric-card">
            <span>Records</span>
            <strong>{{ ransomwareSync.record_count || 0 }}</strong>
          </div>
          <div class="metric-card">
            <span>Last sync</span>
            <strong class="metric-card__value metric-card__value--small">{{ ransomwareSync.last_success_at || 'None' }}</strong>
          </div>
        </div>
        <div class="status-grid status-grid--compact">
          <div class="metric-card">
            <span>Latest disclosure</span>
            <strong class="metric-card__value metric-card__value--small">{{ ransomwareSync.latest_disclosure_time || 'None' }}</strong>
          </div>
          <div class="metric-card">
            <span>Latest source</span>
            <strong class="metric-card__value metric-card__value--small metric-card__value--break">{{ ransomwareLastSourceLabel }}</strong>
          </div>
          <div class="metric-card">
            <span>Last added / updated</span>
            <strong>{{ ransomwareSync.last_new || 0 }} / {{ ransomwareSync.last_updated || 0 }}</strong>
          </div>
          <div class="metric-card">
            <span>Configuration source</span>
            <strong class="metric-card__value metric-card__value--small">{{ ransomwareConfig.source || 'none' }}</strong>
          </div>
        </div>
        <div class="credential-row">
          <el-input
            v-model="ransomwareApiKey"
            type="password"
            show-password
            placeholder="Enter ransomware.live API Key"
            class="credential-row__input"
          />
          <el-button type="primary" :loading="ransomwareSaveLoading || ransomwareConfigLoading" @click="saveRansomwareConfig">Save Key</el-button>
        </div>
        <div class="panel-note-block">
          <p class="panel-note">Current key:{{ ransomwareConfig.masked_api_key || 'Not saved' }}</p>
          <p class="panel-note panel-note--mono">Configuration file:{{ ransomwareConfig.settings_path || ransomwareConfig.env_var }}</p>
          <p class="panel-note">
            Last round: fetched {{ ransomwareSync.last_fetched || 0 }}, new {{ ransomwareSync.last_new || 0 }}, updated {{ ransomwareSync.last_updated || 0 }}, duplicates {{ ransomwareSync.last_unchanged || 0 }}.
          </p>
          <p v-if="ransomwareSync.pending || ransomwareSync.running" class="panel-note">
            Current task:{{ ransomwareSync.running ? 'Syncing' : 'Queued' }}
          </p>
          <p v-if="ransomwareSync.last_error" class="panel-note panel-note--danger">Last error:{{ ransomwareSync.last_error }}</p>
        </div>
      </div>
    </section>

    <section class="ti-card ti-reveal-up">
      <div class="ti-card-header">
        <div class="ti-card-title">Cookie management for logged-in sites</div>
        <div class="health-actions">
          <span class="ti-card-subtitle">{{ cookieSites.length }}  sites need sessions Cookie</span>
          <el-button plain :loading="cookieListLoading" @click="loadCookieSites">Refresh all</el-button>
        </div>
      </div>
      <div class="ti-card-body">
        <el-empty v-if="!cookieListLoading && cookieSites.length === 0" description="No sites need cookies" />
        <el-collapse v-else v-model="activeCookiePanels" class="cookie-collapse">
          <el-collapse-item v-for="site in cookieSites" :key="site.site_name" :name="site.site_name">
            <template #title>
              <div class="cookie-panel-title">
                <strong>{{ site.display_name || site.site_name }}</strong>
                <el-tag :type="site.configured ? 'success' : 'warning'" size="small" effect="light">
                  {{ site.configured ? 'Configured' : 'Not configured' }}
                </el-tag>
                <el-tag v-if="site.cookie_engine" size="small" effect="plain">{{ site.cookie_engine }}</el-tag>
                <span v-if="site.configured" class="cookie-panel-meta">Source:{{ cookieSourceLabel(site.source) }}</span>
              </div>
            </template>
            <div class="cookie-panel-body">
              <div class="status-grid status-grid--compact">
                <div class="metric-card">
                  <span>Current status</span>
                  <strong>{{ site.configured ? 'Configured' : 'Not configured' }}</strong>
                </div>
                <div class="metric-card">
                  <span>Source</span>
                  <strong class="metric-card__value metric-card__value--small">{{ cookieSourceLabel(site.source) }}</strong>
                </div>
                <div class="metric-card">
                  <span>Environment variable</span>
                  <strong class="metric-card__value metric-card__value--small">{{ site.cookie_env || 'Not configured' }}</strong>
                </div>
                <div class="metric-card">
                  <span>Last updated</span>
                  <strong class="metric-card__value metric-card__value--small">{{ site.updated_at || 'Unknown' }}</strong>
                </div>
              </div>
              <div class="credential-row">
                <el-input
                  v-model="cookieInputs[site.site_name]"
                  type="password"
                  show-password
                  :placeholder="cookieInputPlaceholder(site)"
                  class="credential-row__input"
                />
                <el-button type="primary" :loading="isCookieLoading(site.site_name, 'save')" @click="saveCookie(site.site_name)">Save Cookie</el-button>
                <el-button
                  type="danger"
                  plain
                  :loading="isCookieLoading(site.site_name, 'clear')"
                  :disabled="!site.cookie_file_exists"
                  @click="clearCookie(site.site_name)"
                >Clear file Cookie</el-button>
                <el-button plain :loading="isCookieLoading(site.site_name, 'refresh')" @click="refreshCookieStatus(site.site_name)">Refresh</el-button>
              </div>
              <div class="panel-note-block">
                <p class="panel-note">Current preview:{{ site.masked_preview || 'None' }}</p>
                <p class="panel-note panel-note--mono">File path:{{ site.cookie_file || 'Not configured session_cookie_file' }}</p>
                <p class="panel-note">
                  <template v-if="site.cookie_engine || site.cookie_example">
                    {{ site.display_name || site.site_name }}<template v-if="site.cookie_engine"> is a {{ site.cookie_engine }} site</template><template v-if="site.cookie_example">; paste the full cookie string containing {{ site.cookie_example }}</template>.
                  </template>
                  Environment variables take precedence over file configuration.
                </p>
              </div>
            </div>
          </el-collapse-item>
        </el-collapse>
      </div>
    </section>

    <section class="ti-card ti-reveal-up">
      <div class="ti-card-header">
        <div class="ti-card-title">Bot Assistant push (WeCom / DingTalk)</div>
        <div class="health-actions">
          <el-button plain :loading="botConfigLoading || dingtalkConfigLoading" @click="refreshBotConfigs">Refresh configuration</el-button>
          <el-button type="success" plain :loading="botTestLoading" :disabled="!botSmartConfigured || !botHasTargets" @click="testBotMessage">Test WeCom</el-button>
          <el-button type="danger" plain :loading="botDeleteLoading" :disabled="!botConfig.configured" @click="deleteBotConfig">Delete WeCom configuration</el-button>
        </div>
      </div>
      <div class="ti-card-body">
        <h3 class="bot-provider-title">WeCom smart bot</h3>
        <div class="status-grid status-grid--compact">
          <div class="metric-card">
            <span>Smart bot</span>
            <strong>{{ botSmartConfigured ? 'Configured' : 'Not configured' }}</strong>
          </div>
          <div class="metric-card">
            <span>Secret</span>
            <strong>{{ botSecretConfigured ? 'Configured' : 'Not configured' }}</strong>
          </div>
          <div class="metric-card">
            <span>Registered sessions</span>
            <strong class="metric-card__value metric-card__value--small">{{ botTargetLabel }}</strong>
          </div>
          <div class="metric-card">
            <span>Updated at</span>
            <strong class="metric-card__value metric-card__value--small">{{ botConfig.updated_at || 'None' }}</strong>
          </div>
        </div>
        <div class="credential-row">
          <el-input
            v-model="botIdInput"
            type="password"
            show-password
            placeholder="Bot ID"
            class="credential-row__input"
          />
          <el-input
            v-model="botSecretInput"
            type="password"
            show-password
            placeholder="Secret"
            class="credential-row__input credential-row__input--secret"
          />
          <el-button type="primary" :loading="botSaveLoading || botConfigLoading" @click="saveBotConfig">Save configuration</el-button>
        </div>
        <div class="panel-note-block">
          <p class="panel-note">Current Bot ID:{{ botConfig.bot_id || 'Not saved' }}</p>
          <p class="panel-note">Connection URL:{{ botConfig.websocket_url || 'wss://openws.work.weixin.qq.com' }}</p>
          <p class="panel-note">Push targets:{{ botTargetsText }}</p>
          <p class="panel-note">After saving the Bot ID and Secret, add the bot to a group chat or message it directly; the system registers the session automatically and pushes monitoring events to these sessions.</p>
          <p class="panel-note panel-note--mono">Configuration file:{{ botConfig.settings_path || 'Default runtime directory' }}</p>
          <p v-if="botConfig.listener?.last_error" class="panel-note panel-note--danger">Listener error:{{ botConfig.listener.last_error }}</p>
          <p v-if="botLastError" class="panel-note panel-note--danger">Last error:{{ botLastError }}</p>
        </div>

        <div class="bot-provider-divider"></div>
        <div class="bot-provider-heading">
          <h3 class="bot-provider-title">DingTalk custom bot</h3>
          <div class="health-actions">
            <el-button
              type="success"
              plain
              :loading="dingtalkTestLoading"
              :disabled="!dingtalkConfigured"
              @click="testDingTalkMessage"
            >Test DingTalk</el-button>
            <el-button
              type="danger"
              plain
              :loading="dingtalkDeleteLoading"
              :disabled="!dingtalkConfigured"
              @click="deleteDingTalkConfig"
            >Delete DingTalk configuration</el-button>
          </div>
        </div>
        <div class="status-grid status-grid--compact">
          <div class="metric-card">
            <span>Webhook</span>
            <strong>{{ dingtalkConfigured ? 'Configured' : 'Not configured' }}</strong>
          </div>
          <div class="metric-card">
            <span>Signing Secret</span>
            <strong>{{ dingtalkConfig.has_secret ? 'Configured' : 'Not configured (optional)' }}</strong>
          </div>
          <div class="metric-card">
            <span>Connection domain</span>
            <strong class="metric-card__value metric-card__value--small">{{ dingtalkConfig.webhook_host || 'None' }}</strong>
          </div>
          <div class="metric-card">
            <span>Updated at</span>
            <strong class="metric-card__value metric-card__value--small">{{ dingtalkConfig.updated_at || 'None' }}</strong>
          </div>
        </div>
        <div class="credential-row">
          <el-input
            v-model="dingtalkWebhookInput"
            type="password"
            show-password
            placeholder="DingTalk custom bot webhook or access_token"
            class="credential-row__input"
          />
          <el-input
            v-model="dingtalkSecretInput"
            type="password"
            show-password
            placeholder="Signing Secret (optional)"
            class="credential-row__input credential-row__input--secret"
          />
          <el-button type="primary" :loading="dingtalkSaveLoading || dingtalkConfigLoading" @click="saveDingTalkConfig">Save DingTalk configuration</el-button>
        </div>
        <div class="panel-note-block">
          <p class="panel-note panel-note--mono">Current webhook:{{ dingtalkConfig.masked_webhook_url || 'Not saved' }}</p>
          <p class="panel-note">WeCom and DingTalk can be enabled at the same time; code monitoring only pushes records that are new and enter the “code leak monitoring main list”, not the suppressed list.</p>
          <p class="panel-note panel-note--mono">Configuration file:{{ dingtalkConfig.settings_path || 'Default runtime directory' }}</p>
          <p v-if="dingtalkLastError" class="panel-note panel-note--danger">Last error:{{ dingtalkLastError }}</p>
        </div>
      </div>
    </section>

    <section class="ti-card ti-reveal-up">
      <div class="ti-card-header">
        <div class="ti-card-title">Runtime database status</div>
        <StatusBadge :label="runtimeDbStatus.using_runtime_db ? 'WSL Runtime database' : 'Windows Source database'" :tone="runtimeDbStatus.using_runtime_db ? 'success' : 'warning'" :dot="false" />
      </div>
      <div class="ti-card-body status-grid">
        <div class="metric-card">
          <span>Current database</span>
          <strong class="metric-card__value metric-card__value--path">{{ runtimeDbStatus.runtime_db_path || 'Unknown' }}</strong>
        </div>
        <div class="metric-card">
          <span>Source database path</span>
          <strong class="metric-card__value metric-card__value--path">{{ runtimeDbStatus.source_db_path || 'Unknown' }}</strong>
        </div>
        <div class="metric-card">
          <span>Last prepared</span>
          <strong class="metric-card__value metric-card__value--small">{{ runtimeDbStatus.prepared_at || 'Unknown' }}</strong>
        </div>
        <div class="metric-card">
          <span>Normalized events</span>
          <strong>{{ runtimeDbStatus.copied_counts?.normalized_intelligence_events ?? 'Unknown' }}</strong>
        </div>
      </div>
    </section>

    <section class="ti-card ti-reveal-up">
      <div class="ti-card-header">
        <div class="ti-card-title">Monitoring rules</div>
        <div class="health-actions">
          <el-button plain :loading="keywordLoading" @click="loadMonitoringKeywords">Refresh rules</el-button>
          <el-button type="primary" plain @click="addMonitoringKeyword">Add term</el-button>
          <el-button type="success" :loading="keywordLoading" @click="saveMonitoringKeywords">Save rules</el-button>
        </div>
      </div>
      <div class="ti-card-body">
        <div class="status-grid status-grid--compact">
          <div class="metric-card">
            <span>Enabled rules</span>
            <strong>{{ monitoringStatus.enabledKeywordCount || 0 }}</strong>
          </div>
          <div class="metric-card">
            <span>High-priority events</span>
            <strong>{{ monitoringStatus.highPriorityCount || 0 }}</strong>
          </div>
          <div class="metric-card">
            <span>Events with sample evidence</span>
            <strong>{{ monitoringStatus.sampleEvidenceCount || 0 }}</strong>
          </div>
          <div class="metric-card">
            <span>Events covered by rules</span>
            <strong>{{ monitoringStatus.eventCount || 0 }}</strong>
          </div>
        </div>
        <p class="panel-note">Word-boundary matching is recommended for complete English words, and contains matching for Chinese keywords.</p>
        <div class="ti-table-shell">
          <el-table :data="monitoringKeywords" table-layout="fixed" style="width: 100%">
            <el-table-column label="Keyword" :min-width="monitoringKeywordMinWidth">
              <template #default="{ row }">
                <el-input v-model="row.keyword" placeholder="For example China / Government / Energy / company name" />
              </template>
            </el-table-column>
            <el-table-column label="Category" :width="monitoringKeywordCategoryWidth">
              <template #default="{ row }">
                <el-select v-model="row.category">
                  <el-option label="Geographic keyword" value="geo_keywords" />
                  <el-option label="Organization keyword" value="org_keywords" />
                  <el-option label="Custom keyword" value="custom_keywords" />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="Weight" :width="monitoringKeywordWeightWidth">
              <template #default="{ row }">
                <el-input-number v-model="row.weight" :min="1" :max="25" />
              </template>
            </el-table-column>
            <el-table-column v-if="showMonitoringMatchModeColumn" label="Match mode" :width="monitoringKeywordMatchWidth">
              <template #default="{ row }">
                <el-select v-model="row.match_mode">
                  <el-option label="Contains match" value="contains" />
                  <el-option label="Word-boundary match" value="word_boundary" />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="Enable" :width="monitoringKeywordEnabledWidth">
              <template #default="{ row }">
                <el-switch v-model="row.enabled" />
              </template>
            </el-table-column>
            <el-table-column label="Actions" :width="monitoringKeywordActionWidth">
              <template #default="{ row }">
                <el-button text type="danger" @click="removeMonitoringKeyword(row.id)">Delete</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>
    </section>

    <section class="ti-card ti-reveal-up">
      <div class="ti-card-header">
        <div class="ti-card-title">Site health table</div>
        <div class="health-actions">
          <el-button plain @click="refreshAllPanels">Refresh status</el-button>
          <el-button type="primary" :loading="runningAllSites" @click="runAllSitesOnce">Run all sites</el-button>
          <el-button type="success" :loading="continuousLoading" :disabled="continuousStatus.enabled" @click="startContinuousRun">Start continuous run</el-button>
          <el-button type="danger" plain :loading="continuousLoading" :disabled="!continuousStatus.enabled" @click="stopContinuousRun">Stop continuous run</el-button>
          <StatusBadge :label="jobsData.overall_status || 'Unknown'" tone="primary" :dot="false" />
        </div>
      </div>
      <div class="ti-card-body">
        <div class="ti-table-shell site-health-table-shell">
          <el-table :data="siteHealth" style="width: 100%" table-layout="fixed">
            <el-table-column label="Site" :min-width="siteHealthSiteMinWidth" show-overflow-tooltip>
              <template #default="{ row }">{{ row.display_name || row.site_name }}</template>
            </el-table-column>
            <el-table-column prop="overall_status" label="Overall status" :width="siteHealthStatusWidth">
              <template #default="{ row }">
                <StatusBadge v-if="row.worker_error" :label="row.overall_status" tone="danger" :title="row.worker_error" />
                <span v-else>{{ row.overall_status }}</span>
              </template>
            </el-table-column>
            <el-table-column v-if="showSiteHealthWide" prop="seed_status" label="Seed page status" :width="siteHealthWideStatusWidth" />
            <el-table-column v-if="showSiteHealthWide" prop="detail_status" label="Detail page status" :width="siteHealthWideStatusWidth" />
            <el-table-column prop="running_jobs" label="Running" :width="siteHealthSmallMetricWidth" />
            <el-table-column prop="failed_jobs_24h" label="24h Failed" :width="siteHealthMetricWidth" />
            <el-table-column label="Consecutive failures" :width="siteHealthMetricWidth">
              <template #default="{ row }">
                {{ row.consecutive_failures || 0 }}/{{ row.failure_threshold || 3 }}
              </template>
            </el-table-column>
            <el-table-column label="Circuit breaker" :width="siteHealthCircuitWidth">
              <template #default="{ row }">
                <StatusBadge :label="circuitBreakerLabel(row)" :tone="circuitBreakerTone(row)" :dot="false" />
              </template>
            </el-table-column>
            <el-table-column v-if="showSiteHealthWide" prop="failure_cooldown_until" label="Cooling down until" :width="siteHealthCooldownWidth" show-overflow-tooltip />
            <el-table-column v-if="showSiteHealthErrorColumn" label="Error classification" :width="siteHealthErrorCategoryWidth">
              <template #default="{ row }">
                <StatusBadge :label="errorCategoryLabel(row.error_category)" :tone="errorCategoryTone(row.error_category)" :dot="false" />
              </template>
            </el-table-column>
            <el-table-column prop="last_success_at" label="Last success" :min-width="siteHealthLastSuccessMinWidth" show-overflow-tooltip />
            <el-table-column v-if="showSiteHealthMedium" prop="last_error" label="Last error" :min-width="siteHealthLastErrorMinWidth" show-overflow-tooltip />
            <el-table-column label="Actions" :width="siteHealthActionWidth">
              <template #default="{ row }">
                <div class="row-actions site-health-actions">
                  <el-button v-if="row.auth_platform" size="small" type="warning" plain @click="launchSiteLogin(row)">
                    {{ row.auth_required ? 'Login' : 'Update login' }}
                  </el-button>
                  <el-button size="small" type="primary" :loading="!!runningSiteMap[row.site_name]" :disabled="isSiteRunBlocked(row) || !row.enabled" @click="runSiteOnce(row.site_name)">Run once</el-button>
                  <el-button size="small" :type="row.enabled ? 'danger' : 'success'" plain :loading="!!togglingSiteMap[row.site_name]" @click="toggleSite(row.site_name, !row.enabled)">
                    {{ row.enabled ? 'Disable collection' : 'Enable collection' }}
                  </el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>
    </section>

    <section class="ti-card ti-reveal-up">
      <div class="ti-card-header">
        <div class="ti-card-title">Recent failed tasks</div>
        <StatusBadge label="Track by site" tone="warning" :dot="false" />
      </div>
      <div class="ti-card-body">
        <div v-if="recentFailures.length" class="alert-stream">
          <article v-for="item in recentFailures" :key="`${item.site_name}-${item.job_type}-${item.finished_at}`" class="alert-stream__item alert-stream__item--high">
            <div class="alert-stream__meta">
              <StatusBadge :label="item.status" tone="warning" />
              <StatusBadge :label="errorCategoryLabel(item.error_category)" :tone="errorCategoryTone(item.error_category)" :dot="false" />
              <span>{{ item.finished_at }}</span>
            </div>
            <h3>{{ item.site_name }} {{ item.job_type }} {{ item.status }}</h3>
            <p>{{ item.error_message || 'No error details' }}</p>
            <div class="alert-stream__source">Target:{{ item.target }}</div>
          </article>
        </div>
        <div v-else class="empty-state"><p>No failed or stalled tasks in the last 24 hours.</p></div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { useIntelligenceData } from '@/composables/useIntelligenceData'
import { useJobsData } from '@/composables/useJobsData'
import { useContinuousJobs } from '@/composables/useContinuousJobs'

const { refresh: refreshIntelligence } = useIntelligenceData()
const router = useRouter()
const { data: jobsState, refresh: refreshJobs } = useJobsData()
const { data: continuousState, refresh: refreshContinuous } = useContinuousJobs()

const jobsData = computed(() => jobsState.value || {})
const continuousStatus = computed(() => continuousState.value || {})
const siteHealth = computed(() => jobsData.value.site_health || [])
const viewportWidth = ref(typeof window === 'undefined' ? 1440 : window.innerWidth)
const showMonitoringMatchModeColumn = computed(() => viewportWidth.value >= 1180)
const monitoringKeywordMinWidth = computed(() => viewportWidth.value < 1180 ? 180 : 200)
const monitoringKeywordCategoryWidth = computed(() => viewportWidth.value < 1180 ? 132 : 140)
const monitoringKeywordWeightWidth = computed(() => viewportWidth.value < 1180 ? 100 : 110)
const monitoringKeywordMatchWidth = computed(() => 140)
const monitoringKeywordEnabledWidth = computed(() => viewportWidth.value < 1180 ? 72 : 76)
const monitoringKeywordActionWidth = computed(() => viewportWidth.value < 1180 ? 76 : 78)
const showSiteHealthWide = computed(() => viewportWidth.value >= 1680)
const showSiteHealthMedium = computed(() => viewportWidth.value >= 1500)
const showSiteHealthErrorColumn = computed(() => viewportWidth.value >= 1500)
const siteHealthSiteMinWidth = computed(() => viewportWidth.value < 1500 ? 104 : 116)
const siteHealthStatusWidth = computed(() => viewportWidth.value < 1500 ? 76 : 82)
const siteHealthWideStatusWidth = computed(() => 88)
const siteHealthSmallMetricWidth = computed(() => viewportWidth.value < 1500 ? 62 : 66)
const siteHealthMetricWidth = computed(() => viewportWidth.value < 1500 ? 72 : 76)
const siteHealthCircuitWidth = computed(() => viewportWidth.value < 1500 ? 68 : 72)
const siteHealthCooldownWidth = computed(() => 104)
const siteHealthErrorCategoryWidth = computed(() => 82)
const siteHealthLastSuccessMinWidth = computed(() => viewportWidth.value < 1500 ? 106 : 112)
const siteHealthLastErrorMinWidth = computed(() => 140)
const siteHealthActionWidth = computed(() => viewportWidth.value < 1500 ? 252 : 260)
const recentFailures = computed(() => jobsData.value.recent_failures || [])
const vulnerabilitySync = computed(() => jobsData.value.vulnerability_sync || {})
const ransomwareSync = computed(() => jobsData.value.ransomware_sync || {})
const runtimeDbStatus = computed(() => jobsData.value.runtime_db || {})
const browserRuntime = computed(() => jobsData.value.browser_runtime || {})
const localBrowserPool = computed(() => browserRuntime.value.local_process_pool || {})
const browserWorkerLabel = computed(() => {
  if (browserRuntime.value.worker_status !== 'ready') return browserRuntime.value.worker_status === 'refreshing' ? 'Checking' : 'Status unknown'
  const workers = Number(browserRuntime.value.browser_worker_count || 0)
  const capacity = Number(browserRuntime.value.browser_concurrency || browserRuntime.value.configured_concurrency || 2)
  return `${workers}/${capacity}`
})
const localBrowserPoolLabel = computed(() => {
  const running = Number(localBrowserPool.value.running_or_pending || 0)
  const capacity = Number(localBrowserPool.value.max_workers || browserRuntime.value.browser_concurrency || 2)
  return `${running}/${capacity}`
})
const botSmartConfigured = computed(() => botConfig.value.provider === 'wechat_work_aibot' && botConfig.value.configured)
const botSecretConfigured = computed(() => botConfig.value.provider === 'wechat_work_aibot' && botConfig.value.has_secret)
const botHasTargets = computed(() => Number(botConfig.value.chat_target_count || 0) > 0 || Boolean(botConfig.value.chat_id))
const dingtalkConfigured = computed(() => dingtalkConfig.value.configured)
const botTargetLabel = computed(() => {
  if (botConfig.value.provider !== 'wechat_work_aibot') return 'Not configured'
  const count = Number(botConfig.value.chat_target_count || 0)
  if (count > 0) return `${count}  sessions`
  return botConfig.value.chat_id ? '1  sessions' : 'Waiting for registration'
})
const botTargetsText = computed(() => {
  const targets = Array.isArray(botConfig.value.chat_ids) ? botConfig.value.chat_ids.filter(Boolean) : []
  if (targets.length) return targets.join(', ')
  if (botConfig.value.chat_id) return botConfig.value.chat_id
  return 'Not registered; registers automatically after you add the bot to the target group chat or message it directly'
})
const ransomwareLastSourceLabel = computed(() => {
  const raw = String(ransomwareSync.value.last_source || '').trim()
  if (!raw) return 'None'
  try {
    return new URL(raw).host || raw
  } catch {
    return raw
  }
})
const torBridgeModeLabel = computed(() => {
  const labels = {
    snowflake: 'Snowflake',
    obfs4: 'obfs4',
    webtunnel: 'WebTunnel',
    meek_lite: 'meek',
    vanilla: 'Vanilla',
    custom: 'Custom',
  }
  return labels[torBridgeConfig.value.bridge_mode] || torBridgeConfig.value.bridge_mode || 'Not set'
})
const builtinBridgeOptions = [
  {
    value: 'obfs4',
    label: 'obfs4',
    description: 'Makes Tor traffic look like random data; may not work in heavily censored regions.',
  },
  {
    value: 'snowflake',
    label: 'Snowflake',
    description: 'Routes the connection through Snowflake proxies so it looks like a video call.',
  },
  {
    value: 'meek_lite',
    label: 'meek',
    description: 'Connects you to the Tor network through large cloud providers. May work in heavily censored regions but is usually very slow.',
  },
]
const torBridgeDescription = computed(() => {
  const option = builtinBridgeOptions.find((item) => item.value === torBridgeConfig.value.bridge_mode)
  if (option) return option.description
  if (torBridgeConfig.value.bridge_count) return `${torBridgeConfig.value.bridge_count} bridge addresses configured.`
  return 'Connects through built-in bridges; Tor and the transport plugins are detected automatically.'
})
const torBridgeStatusLabel = computed(() => {
  const state = torBridgeConfig.value.connection_state
  if (state === 'disabled') return 'Not enabled'
  if (state === 'connected' || torBridgeConfig.value.connected) return 'Connected'
  if (state === 'connecting' || torBridgeConfig.value.process_running) return `Connecting ${torBridgeProgress.value}%`
  if (state === 'error') return 'Connection failed'
  return 'Not running'
})
const torBridgeProgress = computed(() => {
  const value = Number(torBridgeConfig.value.bootstrap_percent || 0)
  return Math.min(100, Math.max(0, Number.isFinite(value) ? Math.round(value) : 0))
})
const torBridgeProgressStatus = computed(() => {
  if (torBridgeConfig.value.connected) return 'success'
  if (torBridgeConfig.value.connection_state === 'error') return 'exception'
  return undefined
})
const torBridgeExitIpLabel = computed(() => {
  if (torBridgeConfig.value.exit_ip_error) return 'Check failed'
  if (torBridgeConfig.value.exit_ip_checking) return 'Checking...'
  if (torBridgeConfig.value.exit_ip && torBridgeConfig.value.exit_ip_fresh !== false) return torBridgeConfig.value.exit_ip
  return 'Shown after a successful connection'
})
const torBridgeProgressSummary = computed(() => {
  if (torBridgeConfig.value.connection_state === 'error' && torBridgeConfig.value.exit_ip_error) {
    return 'Tor Egress check failed'
  }
  const labels = {
    starting: 'Starting Tor',
    conn_pt: 'Connecting to bridge',
    conn_done: 'Connected to bridge',
    handshake: 'Establishing encrypted handshake',
    handshake_done: 'Encrypted handshake complete',
    onehop_create: 'Establishing directory circuit',
    requesting_status: 'Requesting network status',
    loading_status: 'Loading network status',
    loading_keys: 'Loading authority keys',
    requesting_descriptors: 'Requesting relay information',
    loading_descriptors: 'Loading relay information',
    enough_dirinfo: 'Directory information ready',
    ap_conn_pt: 'Connecting to Tor relay',
    ap_conn_done: 'Connected to Tor relay',
    ap_handshake: 'Handshaking with Tor relay',
    ap_handshake_done: 'Relay handshake complete',
    circuit_create: 'Creating Tor circuit',
    done: 'Tor Network connection complete',
    not_running: torBridgeConfig.value.enabled ? 'Waiting for connection' : 'Bridge not enabled',
  }
  return labels[torBridgeConfig.value.bootstrap_stage] || torBridgeConfig.value.bootstrap_summary || 'Waiting for connection'
})

const runningAllSites = ref(false)
const continuousLoading = ref(false)
const vulnerabilityRunLoading = ref(false)
const vulnerabilityContinuousLoading = ref(false)
const vulnerabilityIntervalHours = ref(1)
const torBridgeLoading = ref(false)
const torBridgeSaveLoading = ref(false)
const torBridgeStartLoading = ref(false)
const torBridgeStopLoading = ref(false)
const torBridgeLinesText = ref('')
const builtinBridgeDialogVisible = ref(false)
const customBridgeDialogVisible = ref(false)
const builtinBridgeSelection = ref('snowflake')
const customBridgeLinesDraft = ref('')
const torBridgeConfig = ref({
  enabled: false,
  bridge_mode: 'snowflake',
  tor_executable: '',
  transport_executable: '',
  socks_host: '127.0.0.1',
  socks_port: 9050,
  bridge_lines: [],
  extra_torrc_lines: [],
  bridge_count: 0,
  process_running: false,
  process_pid: null,
  bootstrap_status: 'not_running',
  bootstrap_percent: 0,
  bootstrap_stage: 'not_running',
  bootstrap_summary: '',
  connection_state: 'not_running',
  connected: false,
  exit_ip: '',
  exit_ip_checked_at: '',
  exit_ip_error: '',
  exit_ip_checking: false,
  collector_proxy: '',
  settings_path: '',
  torrc_path: '',
  data_directory: '',
  last_error: '',
})
const ransomwareRunLoading = ref(false)
const ransomwareContinuousLoading = ref(false)
const ransomwareSaveLoading = ref(false)
const ransomwareConfigLoading = ref(false)
const ransomwareIntervalHours = ref(1)
const ransomwareApiKey = ref('')
const ransomwareConfig = ref({
  has_api_key: false,
  masked_api_key: '',
  source: 'none',
  env_var: 'RANSOMWARE_LIVE_API_KEY',
  settings_path: '',
  updated_at: '',
})
let jobsPollTimer = null
const botConfigLoading = ref(false)
const botSaveLoading = ref(false)
const botTestLoading = ref(false)
const botDeleteLoading = ref(false)
const botIdInput = ref('')
const botSecretInput = ref('')
const botLastError = ref('')
const botConfig = ref({
  provider: 'wechat_work_aibot',
  configured: false,
  source: 'none',
  has_secret: false,
  dry_run: false,
  bot_id: '',
  chat_id: '',
  chat_ids: [],
  chat_target_count: 0,
  listener: {},
  websocket_url: '',
  webhook_key: '',
  masked_webhook_url: '',
  webhook_host: '',
  settings_path: '',
  updated_at: '',
})
const dingtalkConfigLoading = ref(false)
const dingtalkSaveLoading = ref(false)
const dingtalkTestLoading = ref(false)
const dingtalkDeleteLoading = ref(false)
const dingtalkWebhookInput = ref('')
const dingtalkSecretInput = ref('')
const dingtalkLastError = ref('')
const dingtalkConfig = ref({
  provider: 'dingtalk_webhook',
  configured: false,
  source: 'none',
  has_secret: false,
  dry_run: false,
  masked_webhook_url: '',
  webhook_host: '',
  settings_path: '',
  updated_at: '',
})
const runningSiteMap = ref({})
const togglingSiteMap = ref({})
const keywordLoading = ref(false)
const monitoringStatus = ref({ keywordCount: 0, enabledKeywordCount: 0, highPriorityCount: 0, sampleEvidenceCount: 0, eventCount: 0 })
const monitoringKeywords = ref([])
const cookieSites = ref([])
const cookieInputs = reactive({})
const cookieLoadingFlags = reactive({})
const cookieListLoading = ref(false)
const activeCookiePanels = ref([])

function cookieSourceLabel(source) {
  const labels = {
    env: 'Environment variable',
    file: 'File',
    inline: 'sites.yaml Inline',
  }
  return labels[source] || 'Not configured'
}

function cookieInputPlaceholder(site) {
  return `Paste a new ${site.display_name || site.site_name} session Cookie`
}

function ensureCookieSiteState(siteName) {
  if (!(siteName in cookieInputs)) cookieInputs[siteName] = ''
  if (!(siteName in cookieLoadingFlags)) {
    cookieLoadingFlags[siteName] = { save: false, clear: false, refresh: false }
  }
}

function isCookieLoading(siteName, action) {
  return Boolean(cookieLoadingFlags[siteName]?.[action])
}

function applyCookieSiteUpdate(updated) {
  if (!updated?.site_name) return
  const index = cookieSites.value.findIndex((site) => site.site_name === updated.site_name)
  if (index >= 0) cookieSites.value[index] = { ...cookieSites.value[index], ...updated }
  else cookieSites.value = [...cookieSites.value, updated]
  ensureCookieSiteState(updated.site_name)
}

function isSiteRunBlocked(row) {
  return row?.auth_required || row?.blockingReason === 'active_seed_job' || row?.activeSeedJobStatus === 'running' || row?.activeSeedJobStatus === 'enqueued'
}

function launchSiteLogin(row) {
  if (!row?.auth_platform) return
  router.push({
    name: 'RemotePlatformLogin',
    query: { platform: row.auth_platform, return_to: '/collector-control' },
  })
}

function errorCategoryLabel(category) {
  const labels = {
    browser_runtime: 'Browser runtime',
    timeout: 'Timeout',
    proxy: 'Proxy/network',
    parse: 'Parsing',
    site_blocked: 'Site blocked',
    unknown: 'Unknown',
  }
  return labels[category] || 'None'
}

function errorCategoryTone(category) {
  if (!category) return 'neutral'
  if (category === 'browser_runtime' || category === 'site_blocked') return 'danger'
  if (category === 'timeout' || category === 'proxy') return 'warning'
  if (category === 'parse') return 'primary'
  return 'neutral'
}

function circuitBreakerLabel(row) {
  if (row?.circuit_breaker_open) return 'Cooling down'
  if (Number(row?.consecutive_failures || 0) > 0) return 'Observe'
  return 'Normal'
}

function circuitBreakerTone(row) {
  if (row?.circuit_breaker_open) return 'danger'
  if (Number(row?.consecutive_failures || 0) > 0) return 'warning'
  return 'success'
}

function setSiteRunning(siteName, value) {
  runningSiteMap.value = { ...runningSiteMap.value, [siteName]: value }
}

function setSiteToggling(siteName, value) {
  togglingSiteMap.value = { ...togglingSiteMap.value, [siteName]: value }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    })
  } finally {
    window.clearTimeout(timeoutId)
  }
}

async function readApiError(response, fallbackMessage) {
  try {
    const payload = await response.json()
    return payload?.detail || payload?.message || fallbackMessage
  } catch {
    return fallbackMessage
  }
}

async function loadCookieSites() {
  cookieListLoading.value = true
  try {
    const response = await fetchWithTimeout('/api/sites/cookies')
    if (!response.ok) throw new Error(await readApiError(response, `Request failed: ${response.status}`))
    const payload = await response.json()
    const sites = Array.isArray(payload?.sites) ? payload.sites : []
    cookieSites.value = sites
    sites.forEach((site) => ensureCookieSiteState(site.site_name))
    if (!activeCookiePanels.value.length && sites.length) activeCookiePanels.value = [sites[0].site_name]
  } catch (error) {
    ElMessage.error(error.message || 'Failed to read cookie site list')
  } finally {
    cookieListLoading.value = false
  }
}

async function refreshCookieStatus(siteName) {
  ensureCookieSiteState(siteName)
  cookieLoadingFlags[siteName].refresh = true
  try {
    const response = await fetchWithTimeout(`/api/sites/${encodeURIComponent(siteName)}/cookie`)
    if (!response.ok) throw new Error(await readApiError(response, `Request failed: ${response.status}`))
    applyCookieSiteUpdate(await response.json())
  } catch (error) {
    ElMessage.error(error.message || `Failed to read ${siteName} cookie status`)
  } finally {
    cookieLoadingFlags[siteName].refresh = false
  }
}

async function saveCookie(siteName) {
  ensureCookieSiteState(siteName)
  const cookie = String(cookieInputs[siteName] || '').trim()
  if (!cookie) {
    ElMessage.error('Paste a new cookie string')
    return
  }
  cookieLoadingFlags[siteName].save = true
  try {
    const response = await fetchWithTimeout(`/api/sites/${encodeURIComponent(siteName)}/cookie`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie }),
    })
    if (!response.ok) throw new Error(await readApiError(response, `Request failed: ${response.status}`))
    applyCookieSiteUpdate(await response.json())
    cookieInputs[siteName] = ''
    ElMessage.success(`Saved ${siteName} Cookie`)
  } catch (error) {
    ElMessage.error(error.message || 'Failed to save cookie')
  } finally {
    cookieLoadingFlags[siteName].save = false
  }
}

async function clearCookie(siteName) {
  ensureCookieSiteState(siteName)
  cookieLoadingFlags[siteName].clear = true
  try {
    const response = await fetchWithTimeout(`/api/sites/${encodeURIComponent(siteName)}/cookie`, { method: 'DELETE' })
    if (!response.ok) throw new Error(await readApiError(response, `Request failed: ${response.status}`))
    applyCookieSiteUpdate(await response.json())
    ElMessage.success(`Cleared ${siteName} file Cookie`)
  } catch (error) {
    ElMessage.error(error.message || 'Failed to clear cookie')
  } finally {
    cookieLoadingFlags[siteName].clear = false
  }
}

async function loadMonitoringKeywords() {
  keywordLoading.value = true
  try {
    const [keywordsResponse, statusResponse] = await Promise.all([
      fetchWithTimeout('/api/monitoring/keywords'),
      fetchWithTimeout('/api/analysis/monitoring-status'),
    ])
    monitoringKeywords.value = keywordsResponse.ok ? await keywordsResponse.json() : []
    monitoringStatus.value = statusResponse.ok ? await statusResponse.json() : monitoringStatus.value
  } finally {
    keywordLoading.value = false
  }
}

async function loadRansomwareConfig() {
  ransomwareConfigLoading.value = true
  try {
    const response = await fetch('/api/ransomware/config')
    if (!response.ok) throw new Error(`Request failed: ${response.status}`)
    ransomwareConfig.value = await response.json()
  } catch (error) {
    ElMessage.error(error.message || 'Failed to read ransomware.live configuration')
  } finally {
    ransomwareConfigLoading.value = false
  }
}

function textToLines(value) {
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function applyTorBridgeStatus(payload) {
  torBridgeConfig.value = {
    ...torBridgeConfig.value,
    ...payload,
    socks_port: Number(payload?.socks_port || 9050),
    bridge_lines: Array.isArray(payload?.bridge_lines) ? payload.bridge_lines : [],
    extra_torrc_lines: Array.isArray(payload?.extra_torrc_lines) ? payload.extra_torrc_lines : [],
  }
  torBridgeLinesText.value = torBridgeConfig.value.bridge_lines.join('\n')
}

let torBridgePollTimer = null
let torBridgePollInFlight = false

function clearTorBridgePoll() {
  if (torBridgePollTimer) window.clearTimeout(torBridgePollTimer)
  torBridgePollTimer = null
}

function shouldPollTorBridge() {
  return Boolean(torBridgeConfig.value.process_running)
}

function scheduleTorBridgePoll(delay = null) {
  clearTorBridgePoll()
  if (!shouldPollTorBridge()) return
  const nextDelay = delay ?? (
    torBridgeConfig.value.connected && torBridgeConfig.value.exit_ip && !torBridgeConfig.value.exit_ip_checking
      ? 30000
      : 1500
  )
  torBridgePollTimer = window.setTimeout(async () => {
    if (torBridgePollInFlight) {
      scheduleTorBridgePoll()
      return
    }
    torBridgePollInFlight = true
    try {
      await loadTorBridgeStatus({ silent: true, schedule: false })
    } finally {
      torBridgePollInFlight = false
      scheduleTorBridgePoll()
    }
  }, nextDelay)
}

async function loadTorBridgeStatus(options = {}) {
  const silent = Boolean(options?.silent)
  if (!silent) torBridgeLoading.value = true
  try {
    const response = await fetch('/api/tor-bridge/status')
    if (!response.ok) throw new Error(await readApiError(response, `Request failed: ${response.status}`))
    applyTorBridgeStatus(await response.json())
    if (options?.schedule !== false) scheduleTorBridgePoll()
  } catch (error) {
    if (!silent) ElMessage.error(error.message || 'Failed to read Tor bridge status')
  } finally {
    if (!silent) torBridgeLoading.value = false
  }
}

async function saveTorBridgeConfig(options = {}) {
  const silent = Boolean(options?.silent)
  torBridgeSaveLoading.value = true
  try {
    const response = await fetch('/api/tor-bridge/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: Boolean(torBridgeConfig.value.enabled),
        bridge_mode: torBridgeConfig.value.bridge_mode || 'snowflake',
        socks_host: torBridgeConfig.value.socks_host || '127.0.0.1',
        socks_port: Number(torBridgeConfig.value.socks_port || 9050),
        bridge_lines: textToLines(torBridgeLinesText.value),
        extra_torrc_lines: [],
        tor_executable: '',
        transport_executable: '',
        data_directory: '',
      }),
    })
    if (!response.ok) throw new Error(await readApiError(response, `Request failed: ${response.status}`))
    applyTorBridgeStatus(await response.json())
    if (!silent) ElMessage.success('Tor Bridge configuration saved')
    return true
  } catch (error) {
    ElMessage.error(error.message || 'Failed to save Tor bridge configuration')
    return false
  } finally {
    torBridgeSaveLoading.value = false
  }
}

async function startTorBridge() {
  torBridgeStartLoading.value = true
  try {
    const saved = await saveTorBridgeConfig({ silent: true })
    if (!saved) return
    const response = await fetch('/api/tor-bridge/start', { method: 'POST' })
    if (!response.ok) throw new Error(await readApiError(response, `Request failed: ${response.status}`))
    applyTorBridgeStatus(await response.json())
    scheduleTorBridgePoll(300)
    ElMessage.success('Connecting to the Tor bridge')
  } catch (error) {
    ElMessage.error(error.message || 'Failed to start Tor bridge')
  } finally {
    torBridgeStartLoading.value = false
  }
}

async function stopTorBridge() {
  clearTorBridgePoll()
  torBridgeStopLoading.value = true
  try {
    const response = await fetch('/api/tor-bridge/stop', { method: 'POST' })
    if (!response.ok) throw new Error(await readApiError(response, `Request failed: ${response.status}`))
    applyTorBridgeStatus(await response.json())
    ElMessage.success('Tor Bridge stopped')
  } catch (error) {
    ElMessage.error(error.message || 'Failed to stop Tor bridge')
  } finally {
    torBridgeStopLoading.value = false
  }
}

async function handleTorBridgeEnabledChange(enabled) {
  if (!enabled && torBridgeConfig.value.process_running) {
    await stopTorBridge()
  }
  await saveTorBridgeConfig({ silent: true })
}

function openBuiltinBridgeDialog() {
  const current = builtinBridgeOptions.some((option) => option.value === torBridgeConfig.value.bridge_mode)
    ? torBridgeConfig.value.bridge_mode
    : 'snowflake'
  builtinBridgeSelection.value = current
  builtinBridgeDialogVisible.value = true
}

async function confirmBuiltinBridgeSelection() {
  torBridgeConfig.value.enabled = true
  torBridgeConfig.value.bridge_mode = builtinBridgeSelection.value || 'snowflake'
  torBridgeLinesText.value = ''
  builtinBridgeDialogVisible.value = false
  await startTorBridge()
}

function openCustomBridgeDialog() {
  customBridgeLinesDraft.value = torBridgeLinesText.value
  customBridgeDialogVisible.value = true
}

function inferBridgeModeFromLines(lines) {
  const first = String(lines?.[0] || '').replace(/^bridge\s+/i, '').trim().split(/\s+/)[0]?.toLowerCase()
  if (first === 'meek') return 'meek_lite'
  if (['snowflake', 'obfs4', 'webtunnel', 'meek_lite', 'vanilla'].includes(first)) return first
  return 'custom'
}

async function confirmCustomBridgeSelection() {
  const lines = textToLines(customBridgeLinesDraft.value)
  if (!lines.length) {
    ElMessage.error('Enter a bridge address')
    return
  }
  torBridgeConfig.value.enabled = true
  torBridgeConfig.value.bridge_mode = inferBridgeModeFromLines(lines)
  torBridgeLinesText.value = lines.join('\n')
  customBridgeDialogVisible.value = false
  await startTorBridge()
}

async function refreshAllPanels() {
  await Promise.all([
    refreshIntelligence(),
    refreshJobs(),
    refreshContinuous(),
    loadMonitoringKeywords(),
    loadRansomwareConfig(),
    loadCookieSites(),
    loadBotConfig(),
    loadDingTalkConfig(),
    loadTorBridgeStatus(),
  ])
}

async function refreshBotConfigs() {
  await Promise.all([loadBotConfig(), loadDingTalkConfig()])
}

async function loadBotConfig() {
  botConfigLoading.value = true
  try {
    const response = await fetch('/api/bot/status')
    if (!response.ok) throw new Error(await readApiError(response, `Request failed: ${response.status}`))
    botConfig.value = await response.json()
    botLastError.value = ''
  } catch (error) {
    botLastError.value = error.message || 'Failed to read bot configuration'
    ElMessage.error(botLastError.value)
  } finally {
    botConfigLoading.value = false
  }
}

async function saveBotConfig() {
  const botIdValue = String(botIdInput.value || '').trim()
  const secretValue = String(botSecretInput.value || '').trim()
  if (!botIdValue || !secretValue) {
    ElMessage.error('Enter the Bot ID and Secret')
    return
  }

  botSaveLoading.value = true
  try {
    const response = await fetch('/api/bot/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'wechat_work_aibot',
        bot_id: botIdValue,
        secret: secretValue,
      }),
    })
    if (!response.ok) throw new Error(await readApiError(response, `Request failed: ${response.status}`))
    botConfig.value = await response.json()
    botIdInput.value = ''
    botSecretInput.value = ''
    botLastError.value = ''
    ElMessage.success('Bot Assistant configuration saved')
  } catch (error) {
    botLastError.value = error.message || 'Failed to save bot assistant configuration'
    ElMessage.error(botLastError.value)
  } finally {
    botSaveLoading.value = false
  }
}

async function deleteBotConfig() {
  try {
    await ElMessageBox.confirm(
      'Only deletes the saved WeCom bot configuration and registered sessions; monitoring targets, company profiles and historical data are not deleted.',
      'Delete WeCom configuration',
      {
        type: 'warning',
        confirmButtonText: 'Delete',
        cancelButtonText: 'Cancel',
      },
    )
  } catch {
    return
  }
  botDeleteLoading.value = true
  try {
    const response = await fetch('/api/bot/config', { method: 'DELETE' })
    if (!response.ok) throw new Error(await readApiError(response, `Request failed: ${response.status}`))
    botConfig.value = await response.json()
    botIdInput.value = ''
    botSecretInput.value = ''
    botLastError.value = ''
    if (botConfig.value.configured) {
      ElMessage.warning('The configuration saved on the page has been deleted, but the WeCom configuration in environment variables is still in effect')
    } else {
      ElMessage.success('WeCom bot configuration deleted')
    }
  } catch (error) {
    botLastError.value = error.message || 'Failed to delete WeCom bot configuration'
    ElMessage.error(botLastError.value)
  } finally {
    botDeleteLoading.value = false
  }
}

async function testBotMessage() {
  if (!botHasTargets.value) {
    ElMessage.error('Add the bot to the target group chat or message it directly to register a session first')
    return
  }
  botTestLoading.value = true
  try {
    const response = await fetch('/api/bot/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'markdown',
        content: `### Abyssal\n> Bot Assistant test push:${new Date().toLocaleString()}`,
      }),
    })
    if (!response.ok) throw new Error(await readApiError(response, `Request failed: ${response.status}`))
    botLastError.value = ''
    ElMessage.success('Bot Test push sent')
  } catch (error) {
    botLastError.value = error.message || 'Bot Test push failed'
    ElMessage.error(botLastError.value)
  } finally {
    botTestLoading.value = false
  }
}

async function loadDingTalkConfig() {
  dingtalkConfigLoading.value = true
  try {
    const response = await fetch('/api/dingtalk/status')
    if (!response.ok) throw new Error(await readApiError(response, `Request failed: ${response.status}`))
    dingtalkConfig.value = await response.json()
    dingtalkLastError.value = ''
  } catch (error) {
    dingtalkLastError.value = error.message || 'Failed to read DingTalk bot configuration'
    ElMessage.error(dingtalkLastError.value)
  } finally {
    dingtalkConfigLoading.value = false
  }
}

async function saveDingTalkConfig() {
  const webhookValue = String(dingtalkWebhookInput.value || '').trim()
  if (!webhookValue) {
    ElMessage.error('Enter the DingTalk custom bot webhook or access_token')
    return
  }
  dingtalkSaveLoading.value = true
  try {
    const response = await fetch('/api/dingtalk/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webhook_url: webhookValue,
        secret: String(dingtalkSecretInput.value || '').trim(),
      }),
    })
    if (!response.ok) throw new Error(await readApiError(response, `Request failed: ${response.status}`))
    dingtalkConfig.value = await response.json()
    dingtalkWebhookInput.value = ''
    dingtalkSecretInput.value = ''
    dingtalkLastError.value = ''
    ElMessage.success('DingTalk bot configuration saved')
  } catch (error) {
    dingtalkLastError.value = error.message || 'Failed to save DingTalk bot configuration'
    ElMessage.error(dingtalkLastError.value)
  } finally {
    dingtalkSaveLoading.value = false
  }
}

async function deleteDingTalkConfig() {
  try {
    await ElMessageBox.confirm(
      'Only deletes the saved DingTalk bot configuration; monitoring targets, company profiles and historical data are not deleted.',
      'Delete DingTalk configuration',
      {
        type: 'warning',
        confirmButtonText: 'Delete',
        cancelButtonText: 'Cancel',
      },
    )
  } catch {
    return
  }
  dingtalkDeleteLoading.value = true
  try {
    const response = await fetch('/api/dingtalk/config', { method: 'DELETE' })
    if (!response.ok) throw new Error(await readApiError(response, `Request failed: ${response.status}`))
    dingtalkConfig.value = await response.json()
    dingtalkWebhookInput.value = ''
    dingtalkSecretInput.value = ''
    dingtalkLastError.value = ''
    if (dingtalkConfig.value.configured) {
      ElMessage.warning('The configuration saved on the page has been deleted, but the DingTalk configuration in environment variables is still in effect')
    } else {
      ElMessage.success('DingTalk bot configuration deleted')
    }
  } catch (error) {
    dingtalkLastError.value = error.message || 'Failed to delete DingTalk bot configuration'
    ElMessage.error(dingtalkLastError.value)
  } finally {
    dingtalkDeleteLoading.value = false
  }
}

async function testDingTalkMessage() {
  dingtalkTestLoading.value = true
  try {
    const response = await fetch('/api/dingtalk/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Abyssal test push',
        content: `### Abyssal\n> DingTalk bot test push:${new Date().toLocaleString()}`,
      }),
    })
    if (!response.ok) throw new Error(await readApiError(response, `Request failed: ${response.status}`))
    dingtalkLastError.value = ''
    ElMessage.success('DingTalk test push sent')
  } catch (error) {
    dingtalkLastError.value = error.message || 'DingTalk test push failed'
    ElMessage.error(dingtalkLastError.value)
  } finally {
    dingtalkTestLoading.value = false
  }
}

function addMonitoringKeyword() {
  monitoringKeywords.value = [
    ...monitoringKeywords.value,
    { id: `new-${Date.now()}`, keyword: '', category: 'custom_keywords', weight: 5, enabled: true, match_mode: 'contains' },
  ]
}

function removeMonitoringKeyword(id) {
  monitoringKeywords.value = monitoringKeywords.value.filter((item) => item.id !== id)
}

async function saveMonitoringKeywords() {
  keywordLoading.value = true
  try {
    const response = await fetch('/api/monitoring/keywords', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keywords: monitoringKeywords.value.map((item) => ({
          keyword: item.keyword,
          category: item.category,
          weight: Number(item.weight || 0),
          enabled: Boolean(item.enabled),
          match_mode: item.match_mode || 'contains',
        })),
      }),
    })
    if (!response.ok) throw new Error(`Request failed: ${response.status}`)
    monitoringKeywords.value = await response.json()
    await loadMonitoringKeywords()
    await refreshIntelligence()
    ElMessage.success('Monitoring rules saved')
  } catch (error) {
    ElMessage.error(error.message || 'Failed to save monitoring rules')
  } finally {
    keywordLoading.value = false
  }
}

async function runSiteOnce(siteName) {
  setSiteRunning(siteName, true)
  try {
    const response = await fetch('/api/jobs/run-site', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site_name: siteName, force: true }),
    })
    if (!response.ok) throw new Error(`Request failed: ${response.status}`)
    const payload = await response.json()
    await refreshJobs()
    if (payload.reason === 'auth_required') {
      ElMessage.warning(payload.message || 'Complete the site login first')
    } else {
      ElMessage.success(`Triggered one run of ${siteName}`)
    }
  } catch (error) {
    ElMessage.error(error.message || 'Failed to trigger site run')
  } finally {
    setSiteRunning(siteName, false)
  }
}

async function toggleSite(siteName, enabled) {
  setSiteToggling(siteName, true)
  try {
    const response = await fetch(`/api/sites/${encodeURIComponent(siteName)}/enabled`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    })
    if (!response.ok) throw new Error(`Request failed: ${response.status}`)
    await refreshJobs()
    ElMessage.success(enabled ? `Enabled ${siteName}` : `Disabled ${siteName}`)
  } catch (error) {
    ElMessage.error(error.message || 'Failed to update site status')
  } finally {
    setSiteToggling(siteName, false)
  }
}

async function runAllSitesOnce() {
  runningAllSites.value = true
  try {
    const response = await fetch('/api/jobs/run-all-once', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: true }),
    })
    if (!response.ok) throw new Error(`Request failed: ${response.status}`)
    await refreshJobs()
    ElMessage.success('Triggered a run for all sites')
  } catch (error) {
    ElMessage.error(error.message || 'Failed to trigger run for all sites')
  } finally {
    runningAllSites.value = false
  }
}

async function startContinuousRun() {
  continuousLoading.value = true
  try {
    const response = await fetch('/api/jobs/run-all-continuous/start', { method: 'POST' })
    if (!response.ok) throw new Error(`Request failed: ${response.status}`)
    await refreshContinuous()
    ElMessage.success('Continuous run started')
  } catch (error) {
    ElMessage.error(error.message || 'Failed to start continuous run')
  } finally {
    continuousLoading.value = false
  }
}

async function stopContinuousRun() {
  continuousLoading.value = true
  try {
    const response = await fetch('/api/jobs/run-all-continuous/stop', { method: 'POST' })
    if (!response.ok) throw new Error(`Request failed: ${response.status}`)
    await refreshContinuous()
    ElMessage.success('Continuous run stopped')
  } catch (error) {
    ElMessage.error(error.message || 'Failed to stop continuous run')
  } finally {
    continuousLoading.value = false
  }
}

async function runVulnerabilitySyncOnce() {
  vulnerabilityRunLoading.value = true
  try {
    const response = await fetch('/api/vulnerabilities/sync/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 300 }),
    })
    if (!response.ok) throw new Error(`Request failed: ${response.status}`)
    await refreshJobs()
    ElMessage.success('Vulnerability sync triggered')
  } catch (error) {
    ElMessage.error(error.message || 'Failed to trigger vulnerability sync')
  } finally {
    vulnerabilityRunLoading.value = false
  }
}

async function startVulnerabilitySync() {
  vulnerabilityContinuousLoading.value = true
  try {
    const response = await fetch('/api/vulnerabilities/sync/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        interval_seconds: Number(vulnerabilityIntervalHours.value || 1) * 3600,
        limit: 300,
      }),
    })
    if (!response.ok) throw new Error(`Request failed: ${response.status}`)
    await refreshJobs()
    ElMessage.success('Vulnerability auto-sync enabled')
  } catch (error) {
    ElMessage.error(error.message || 'Failed to enable vulnerability auto-sync')
  } finally {
    vulnerabilityContinuousLoading.value = false
  }
}

async function stopVulnerabilitySync() {
  vulnerabilityContinuousLoading.value = true
  try {
    const response = await fetch('/api/vulnerabilities/sync/stop', { method: 'POST' })
    if (!response.ok) throw new Error(`Request failed: ${response.status}`)
    await refreshJobs()
    ElMessage.success('Vulnerability auto-sync stopped')
  } catch (error) {
    ElMessage.error(error.message || 'Failed to stop vulnerability auto-sync')
  } finally {
    vulnerabilityContinuousLoading.value = false
  }
}

async function saveRansomwareConfig() {
  const apiKey = String(ransomwareApiKey.value || '').trim()
  if (!apiKey) {
    ElMessage.error('Enter ransomware.live API Key')
    return
  }

  ransomwareSaveLoading.value = true
  try {
    const response = await fetch('/api/ransomware/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey }),
    })
    if (!response.ok) throw new Error(`Request failed: ${response.status}`)
    ransomwareConfig.value = await response.json()
    ransomwareApiKey.value = ''
    ElMessage.success('Saved ransomware.live API Key')
  } catch (error) {
    ElMessage.error(error.message || 'Failed to save ransomware.live API key')
  } finally {
    ransomwareSaveLoading.value = false
  }
}

async function runRansomwareSyncOnce() {
  ransomwareRunLoading.value = true
  try {
    const response = await fetch('/api/ransomware/sync/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 0 }),
    })
    if (!response.ok) throw new Error(`Request failed: ${response.status}`)
    await refreshJobs()
    await refreshIntelligence()
    ElMessage.success('ransomware.live sync triggered')
  } catch (error) {
    ElMessage.error(error.message || 'Failed to trigger ransomware.live sync')
  } finally {
    ransomwareRunLoading.value = false
  }
}

async function startRansomwareSync() {
  ransomwareContinuousLoading.value = true
  try {
    const response = await fetch('/api/ransomware/sync/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        interval_seconds: Number(ransomwareIntervalHours.value || 1) * 3600,
        limit: 0,
      }),
    })
    if (!response.ok) throw new Error(`Request failed: ${response.status}`)
    await refreshJobs()
    ElMessage.success('ransomware.live auto-sync enabled')
  } catch (error) {
    ElMessage.error(error.message || 'Failed to enable ransomware.live auto-sync')
  } finally {
    ransomwareContinuousLoading.value = false
  }
}

async function stopRansomwareSync() {
  ransomwareContinuousLoading.value = true
  try {
    const response = await fetch('/api/ransomware/sync/stop', { method: 'POST' })
    if (!response.ok) throw new Error(`Request failed: ${response.status}`)
    await refreshJobs()
    ElMessage.success('ransomware.live auto-sync stopped')
  } catch (error) {
    ElMessage.error(error.message || 'Failed to stop ransomware.live auto-sync')
  } finally {
    ransomwareContinuousLoading.value = false
  }
}

function updateViewportWidth() {
  viewportWidth.value = window.innerWidth
}

onMounted(async () => {
  updateViewportWidth()
  window.addEventListener('resize', updateViewportWidth)
  await refreshAllPanels()
  const storedIntervalSeconds = Number(ransomwareSync.value.interval_seconds || 0)
  if (storedIntervalSeconds > 0) ransomwareIntervalHours.value = storedIntervalSeconds / 3600
  jobsPollTimer = window.setInterval(() => refreshJobs(), 30000)
})

onBeforeUnmount(() => {
  clearTorBridgePoll()
  if (jobsPollTimer) window.clearInterval(jobsPollTimer)
  window.removeEventListener('resize', updateViewportWidth)
})
</script>

<style scoped lang="scss">
.collector-control-page {
  min-width: 0;
  overflow-x: hidden;
}

.control-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(320px, 1fr);
  gap: 24px;
  align-items: start;
}

.control-hero__copy h3 {
  margin: 10px 0 0;
  color: var(--ti-text-primary);
  font-size: 34px;
}

.control-hero__copy p {
  margin: 12px 0 0;
  color: var(--ti-text-secondary);
  line-height: 1.7;
}

.control-hero__stats,
.status-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.metric-card {
  min-width: 0;
  padding: 16px 18px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.92);
}

.metric-card span {
  display: block;
  color: var(--ti-text-muted);
  font-size: 12px;
}

.metric-card strong {
  display: block;
  margin-top: 8px;
  color: var(--ti-text-primary);
  font-size: clamp(20px, 2vw, 28px);
  line-height: 1.25;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.metric-card__value--small {
  font-size: clamp(16px, 1.35vw, 22px);
}

.metric-card__value--path {
  font-size: clamp(14px, 1.05vw, 18px);
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
}

.metric-card__value--break {
  word-break: break-all;
}

.status-grid--compact {
  margin-bottom: 16px;
}

.bot-provider-title {
  margin: 0 0 14px;
  color: var(--ti-text-primary);
  font-size: 16px;
}

.bot-provider-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.bot-provider-heading .bot-provider-title {
  margin-bottom: 14px;
}

.bot-provider-divider {
  height: 1px;
  margin: 22px 0;
  background: rgba(148, 163, 184, 0.24);
}

.credential-row {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.credential-row__input {
  flex: 1 1 360px;
  min-width: 220px;
}

.cookie-collapse {
  border: none;
}

.cookie-collapse :deep(.el-collapse-item__header) {
  padding: 4px;
  background: transparent;
}

.cookie-panel-title {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  width: 100%;
}

.cookie-panel-title strong {
  color: var(--ti-text-primary);
  font-size: 15px;
}

.cookie-panel-meta {
  margin-left: auto;
  color: var(--ti-text-muted);
  font-size: 12px;
}

.cookie-panel-body {
  padding: 12px 4px 4px;
}

.tor-bridge-panel {
  display: grid;
  gap: 0;
  min-width: 0;
  padding: 30px;
  overflow: hidden;
}

.tor-bridge-panel__header {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: flex-start;
  min-width: 0;
  padding-bottom: 22px;
  border-bottom: 1px solid var(--ti-border-soft);
}

.tor-bridge-panel__header h3 {
  margin: 0;
  color: var(--ti-text-primary);
  font-size: 30px;
  line-height: 1.18;
}

.tor-bridge-panel__header p {
  max-width: 880px;
  margin: 10px 0 0;
  color: var(--ti-text-secondary);
  line-height: 1.7;
}

.tor-bridge-panel__header .health-actions {
  flex: 0 0 auto;
  justify-content: flex-end;
}

.tor-bridge-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(240px, 280px);
  gap: 28px;
  min-width: 0;
  padding-top: 24px;
  align-items: start;
}

.tor-bridge-primary {
  display: grid;
  gap: 24px;
  min-width: 0;
}

.tor-bridge-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--ti-text-primary);
  min-height: 32px;
}

.tor-bridge-current {
  width: 100%;
  min-width: 0;
  border-radius: 8px;
  background: #f4f6fb;
  padding: 24px 28px;
}

.tor-bridge-current__head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.28);
  color: var(--ti-text-primary);
  min-width: 0;
}

.tor-bridge-current__head > div {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tor-bridge-current__menu {
  width: 32px;
  height: 32px;
  padding: 0;
  color: var(--ti-text-primary);
  font-weight: 700;
  background: rgba(255, 255, 255, 0.84);
}

.tor-bridge-current__body {
  padding-top: 16px;
}

.tor-bridge-current__body strong {
  color: var(--ti-text-primary);
  font-size: 18px;
}

.tor-bridge-current__body p {
  margin: 12px 0 0;
  color: var(--ti-text-primary);
  line-height: 1.7;
}

.tor-bridge-change {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.tor-bridge-change h4 {
  margin: 0;
  color: var(--ti-text-primary);
  font-size: 22px;
}

.tor-bridge-change__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18px;
  align-items: center;
  min-width: 0;
  padding: 14px 0;
  border-top: 1px solid var(--ti-border-soft);
}

.tor-bridge-change__row span {
  color: var(--ti-text-primary);
  font-weight: 600;
}

.tor-bridge-change__row p {
  margin: 4px 0 0;
  color: var(--ti-text-muted);
  font-size: 12px;
}

.tor-bridge-change__row .el-button {
  width: 178px;
  justify-self: end;
}

.tor-bridge-runtime {
  display: grid;
  gap: 14px;
  min-width: 0;
  padding: 18px;
  border: 1px solid var(--ti-border-soft);
  border-radius: 12px;
  background: rgba(248, 250, 253, 0.86);
}

.tor-bridge-runtime__item {
  min-width: 0;
}

.tor-bridge-runtime__item span {
  display: block;
  color: var(--ti-text-secondary);
  font-size: 12px;
}

.tor-bridge-runtime__item strong {
  display: block;
  margin-top: 4px;
  color: var(--ti-text-primary);
  font-size: 14px;
  line-height: 1.45;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.tor-bridge-runtime__connected {
  color: var(--el-color-success) !important;
}

.tor-bridge-runtime__ip {
  font-variant-numeric: tabular-nums;
}

.tor-bridge-runtime__progress {
  grid-column: 1 / -1;
}

.tor-bridge-runtime__progress-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.tor-bridge-runtime__progress-head strong {
  margin-top: 0;
  font-variant-numeric: tabular-nums;
}

.tor-bridge-runtime__progress p {
  margin: 8px 0 0;
  color: var(--ti-text-secondary);
  font-size: 12px;
  line-height: 1.45;
}

.builtin-bridge-dialog__intro {
  margin: 0 0 14px;
  color: var(--ti-text-primary);
  line-height: 1.7;
}

.builtin-bridge-list {
  display: grid;
  gap: 14px;
}

.builtin-bridge-option {
  width: 100%;
  height: auto;
  margin-right: 0;
  align-items: flex-start;
  white-space: normal;
}

.builtin-bridge-option__title {
  display: flex;
  gap: 10px;
  align-items: center;
}

.builtin-bridge-option__title strong {
  color: var(--ti-text-primary);
  font-size: 17px;
}

.builtin-bridge-option__title span {
  color: #1677ff;
  font-size: 13px;
}

.builtin-bridge-option p {
  margin: 8px 0 0;
  color: var(--ti-text-primary);
  line-height: 1.7;
}

.panel-note-block {
  display: grid;
  gap: 6px;
}

.panel-note {
  margin: 0;
  color: var(--ti-text-secondary);
  line-height: 1.7;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.panel-note--mono {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 13px;
}

.panel-note--danger {
  color: #b91c1c;
}

.health-actions,
.row-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
}

.site-health-table-shell {
  overflow-x: hidden;
}

.site-health-table-shell :deep(.el-table .cell) {
  overflow: hidden;
  padding: 0 8px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-health-table-shell :deep(.el-table__header-wrapper th.el-table__cell) {
  padding-top: 10px;
  padding-bottom: 10px;
}

.site-health-actions {
  gap: 6px;
  justify-content: flex-start;
}

.site-health-actions :deep(.el-button) {
  min-width: 74px;
  height: 28px;
  margin-left: 0 !important;
  padding: 0 9px;
}

.alert-stream {
  display: grid;
  gap: 12px;
}

.alert-stream__item {
  padding: 16px 18px;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(255, 255, 255, 0.92);
}

.alert-stream__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.alert-stream__item h3 {
  margin: 10px 0 0;
  color: var(--ti-text-primary);
}

.alert-stream__item p,
.alert-stream__source {
  margin: 10px 0 0;
  color: var(--ti-text-secondary);
  line-height: 1.7;
  word-break: break-word;
  overflow-wrap: anywhere;
}

@media (max-width: 1440px) {
  .control-hero,
  .control-hero__stats,
  .status-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 1200px) {
  .tor-bridge-panel__header,
  .tor-bridge-body {
    grid-template-columns: 1fr;
  }

  .tor-bridge-panel__header {
    display: grid;
  }

  .tor-bridge-panel__header .health-actions {
    justify-content: flex-start;
  }

  .tor-bridge-runtime {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .control-hero {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 767px) {
  .control-hero__stats,
  .status-grid {
    grid-template-columns: 1fr;
  }

  .tor-bridge-panel {
    padding: 22px;
  }

  .tor-bridge-runtime,
  .tor-bridge-change__row {
    grid-template-columns: 1fr;
  }

  .tor-bridge-change__row .el-button {
    width: 100%;
    justify-self: stretch;
  }
}
</style>
