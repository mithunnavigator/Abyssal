<template>
  <div class="account-management-page ti-page">
    <section class="ti-panel ti-reveal-up">
      <div class="account-management__header">
        <div>
          <span class="ti-kicker">System Accounts</span>
          <h2>Accounts and Permissions</h2>
          <p>The overview is a fixed permission for all accounts; other modules are assigned per account by administrators.</p>
        </div>
        <el-button type="primary" @click="openCreateDialog">
          <el-icon><Plus /></el-icon>
          Create account
        </el-button>
      </div>

      <div class="fixed-permission-note">
        <el-icon><CircleCheck /></el-icon>
        <span>Fixed permission: all accounts can view the full overview.</span>
      </div>

      <div class="ti-table-shell account-table-shell">
        <el-table v-loading="loading" :data="accounts" table-layout="auto" style="width: 100%">
          <el-table-column prop="username" label="Account" min-width="150" />
          <el-table-column prop="display_name" label="Display name" min-width="150" />
          <el-table-column label="Role" width="120">
            <template #default="{ row }">
              <el-tag :type="row.role === 'admin' ? 'danger' : 'info'">
                {{ row.role === 'admin' ? 'Administrator' : 'Regular account' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="Visible modules" min-width="360">
            <template #default="{ row }">
              <div class="module-tags">
                <el-tag effect="plain">Overview (fixed)</el-tag>
                <el-tag
                  v-for="moduleKey in row.modules || []"
                  :key="moduleKey"
                  effect="plain"
                  type="success"
                >
                  {{ moduleLabel(moduleKey) }}
                </el-tag>
                <span v-if="row.role !== 'admin' && !(row.modules || []).length" class="module-tags__empty">
                  No other modules assigned
                </span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="Status" width="100">
            <template #default="{ row }">
              <el-tag :type="row.enabled ? 'success' : 'info'">
                {{ row.enabled ? 'Enable' : 'Disable' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="Actions" width="260" fixed="right">
            <template #default="{ row }">
              <div v-if="row.role !== 'admin'" class="account-actions">
                <el-button link type="primary" @click="openInfoDialog(row)">Edit info</el-button>
                <el-button link type="primary" @click="openEditDialog(row)">Permissions</el-button>
                <el-button
                  link
                  type="danger"
                  :loading="deletingUsername === row.username"
                  @click="deleteAccountRow(row)"
                >
                  Delete
                </el-button>
              </div>
              <span v-else class="fixed-admin-label">Fixed administrator</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </section>

    <el-dialog v-model="createDialogVisible" title="Create account" width="560px" destroy-on-close>
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-position="top">
        <div class="account-form-grid">
          <el-form-item label="Login account" prop="username">
            <el-input v-model.trim="createForm.username" autocomplete="off" placeholder="3-64  characters, no spaces" />
          </el-form-item>
          <el-form-item label="Display name" prop="displayName">
            <el-input v-model.trim="createForm.displayName" autocomplete="off" placeholder="Shown in the top-right corner of the page" />
          </el-form-item>
        </div>
        <el-form-item label="Initial password" prop="password">
          <el-input v-model="createForm.password" type="password" show-password autocomplete="new-password" />
        </el-form-item>
        <el-form-item label="Visible modules">
          <div class="permission-editor">
            <div class="permission-editor__fixed">Overview (always visible to all accounts)</div>
            <el-checkbox-group v-model="createForm.modules">
              <el-checkbox v-for="item in ASSIGNABLE_MODULES" :key="item.key" :value="item.key">
                {{ item.label }}
              </el-checkbox>
            </el-checkbox-group>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">Cancel</el-button>
        <el-button type="primary" :loading="submitting" @click="submitCreate">Create</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="infoDialogVisible" title="Edit account information" width="560px" destroy-on-close>
      <el-form ref="infoFormRef" :model="infoForm" :rules="infoRules" label-position="top">
        <div class="account-form-grid">
          <el-form-item label="Login account" prop="username">
            <el-input v-model.trim="infoForm.username" autocomplete="off" placeholder="3-64  characters, no spaces" />
          </el-form-item>
          <el-form-item label="Display name" prop="displayName">
            <el-input v-model.trim="infoForm.displayName" autocomplete="off" />
          </el-form-item>
        </div>
        <el-form-item label="Reset password (optional)" prop="newPassword">
          <el-input
            v-model="infoForm.newPassword"
            type="password"
            show-password
            autocomplete="new-password"
            placeholder="Leave empty to keep the password unchanged"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="infoDialogVisible = false">Cancel</el-button>
        <el-button type="primary" :loading="submitting" @click="submitInfo">Save</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="editDialogVisible" title="Permissions" width="560px" destroy-on-close>
      <el-form ref="editFormRef" :model="editForm" label-position="top">
        <el-form-item label="Account">
          <el-input :model-value="editingUsername" disabled />
        </el-form-item>
        <el-form-item label="Account status">
          <el-switch v-model="editForm.enabled" active-text="Enable" inactive-text="Disable" />
        </el-form-item>
        <el-form-item label="Visible modules">
          <div class="permission-editor">
            <div class="permission-editor__fixed">Overview (always visible to all accounts)</div>
            <el-checkbox-group v-model="editForm.modules">
              <el-checkbox v-for="item in ASSIGNABLE_MODULES" :key="item.key" :value="item.key">
                {{ item.label }}
              </el-checkbox>
            </el-checkbox-group>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">Cancel</el-button>
        <el-button type="primary" :loading="submitting" @click="submitEdit">Save</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ASSIGNABLE_MODULES, moduleLabel } from '@/config/permissions'
import { useAuth } from '@/composables/useAuth'

const { listAccounts, createAccount, updateAccount, updateAccountInfo, deleteAccount } = useAuth()
const accounts = ref([])
const loading = ref(false)
const submitting = ref(false)
const deletingUsername = ref('')
const createDialogVisible = ref(false)
const infoDialogVisible = ref(false)
const editDialogVisible = ref(false)
const createFormRef = ref()
const infoFormRef = ref()
const editFormRef = ref()
const editingUsername = ref('')
const editingInfoUsername = ref('')

const createForm = reactive({
  username: '',
  displayName: '',
  password: '',
  modules: [],
})

const infoForm = reactive({
  username: '',
  displayName: '',
  newPassword: '',
})

const editForm = reactive({
  displayName: '',
  enabled: true,
  modules: [],
})

const usernameRules = [
  { required: true, message: 'Enter the login account', trigger: 'blur' },
  { min: 3, max: 64, message: 'Account must be 3-64 characters long', trigger: 'blur' },
  { pattern: /^\S+$/, message: 'Account cannot contain spaces', trigger: 'blur' },
]
const displayNameRules = [{ required: true, message: 'Enter a display name', trigger: 'blur' }]

const createRules = {
  username: usernameRules,
  displayName: displayNameRules,
  password: [
    { required: true, message: 'Enter an initial password', trigger: 'blur' },
    { min: 6, message: 'Password must be at least 6 characters', trigger: 'blur' },
  ],
}

const infoRules = {
  username: usernameRules,
  displayName: displayNameRules,
  newPassword: [{ min: 6, message: 'New password must be at least 6 characters', trigger: 'blur' }],
}

async function loadAccounts() {
  loading.value = true
  try {
    accounts.value = await listAccounts()
  } catch (error) {
    ElMessage.error(error.message || 'Failed to load accounts')
  } finally {
    loading.value = false
  }
}

function resetCreateForm() {
  createForm.username = ''
  createForm.displayName = ''
  createForm.password = ''
  createForm.modules = []
  createFormRef.value?.clearValidate()
}

function openCreateDialog() {
  resetCreateForm()
  createDialogVisible.value = true
}

function openInfoDialog(row) {
  editingInfoUsername.value = row.username
  infoForm.username = row.username
  infoForm.displayName = row.display_name || row.username
  infoForm.newPassword = ''
  infoDialogVisible.value = true
}

function openEditDialog(row) {
  editingUsername.value = row.username
  editForm.displayName = row.display_name || row.username
  editForm.enabled = row.enabled !== false
  editForm.modules = [...(row.modules || [])]
  editDialogVisible.value = true
}

async function submitCreate() {
  if (!createFormRef.value || submitting.value) return
  try {
    await createFormRef.value.validate()
  } catch {
    return
  }
  submitting.value = true
  try {
    await createAccount(createForm)
    ElMessage.success('Account created')
    createDialogVisible.value = false
    await loadAccounts()
  } catch (error) {
    ElMessage.error(error.message || 'Failed to create account')
  } finally {
    submitting.value = false
  }
}

async function submitInfo() {
  if (!infoFormRef.value || submitting.value) return
  try {
    await infoFormRef.value.validate()
  } catch {
    return
  }
  submitting.value = true
  try {
    await updateAccountInfo(editingInfoUsername.value, infoForm)
    ElMessage.success('Account information updated')
    infoDialogVisible.value = false
    await loadAccounts()
  } catch (error) {
    ElMessage.error(error.message || 'Failed to update account information')
  } finally {
    submitting.value = false
  }
}

async function deleteAccountRow(row) {
  try {
    await ElMessageBox.confirm(
      `After deletion, account “${row.username}” will no longer be able to log in. Continue?`,
      'Delete account',
      { confirmButtonText: 'Delete', cancelButtonText: 'Cancel', type: 'warning' },
    )
  } catch {
    return
  }
  deletingUsername.value = row.username
  try {
    await deleteAccount(row.username)
    ElMessage.success('Account deleted')
    await loadAccounts()
  } catch (error) {
    ElMessage.error(error.message || 'Failed to delete account')
  } finally {
    deletingUsername.value = ''
  }
}

async function submitEdit() {
  if (!editFormRef.value || submitting.value) return
  try {
    await editFormRef.value.validate()
  } catch {
    return
  }
  submitting.value = true
  try {
    await updateAccount(editingUsername.value, editForm)
    ElMessage.success('Account permissions updated')
    editDialogVisible.value = false
    await loadAccounts()
  } catch (error) {
    ElMessage.error(error.message || 'Failed to update account')
  } finally {
    submitting.value = false
  }
}

onMounted(loadAccounts)
</script>

<style scoped lang="scss">
.account-management-page {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 24px;
}

.account-management-page .ti-panel {
  min-width: 0;
  padding: 22px;
  border: 1px solid var(--ti-border-default);
  border-radius: var(--ti-radius-lg);
  background: var(--ti-panel-emphasis);
  box-shadow: var(--ti-shadow-panel);
}

.account-management-page .ti-kicker {
  color: var(--ti-accent-strong);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.account-management-page .ti-table-shell {
  overflow: hidden;
  border: 1px solid var(--ti-border-soft);
  border-radius: var(--ti-radius-md);
  background: var(--ti-surface-default);
}

.account-management__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}

.account-management__header h2 {
  margin: 10px 0 8px;
  color: var(--ti-text-primary);
  font-size: 28px;
}

.account-management__header p {
  margin: 0;
  color: var(--ti-text-secondary);
}

.fixed-permission-note {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 22px 0 16px;
  padding: 12px 14px;
  border: 1px solid rgba(45, 93, 255, 0.14);
  border-radius: 14px;
  background: rgba(45, 93, 255, 0.05);
  color: var(--ti-primary);
  font-size: 13px;
  font-weight: 600;
}

.account-table-shell {
  margin-top: 0;
}

.module-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  padding: 4px 0;
}

.module-tags__empty,
.fixed-admin-label {
  color: var(--ti-text-muted);
  font-size: 12px;
}

.account-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.account-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.permission-editor {
  width: 100%;
  padding: 14px;
  border: 1px solid var(--ti-border-soft);
  border-radius: 14px;
  background: rgba(247, 250, 255, 0.72);
}

.permission-editor__fixed {
  margin-bottom: 12px;
  color: var(--ti-primary);
  font-size: 13px;
  font-weight: 700;
}

.permission-editor :deep(.el-checkbox-group) {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 14px;
}

@media (max-width: 720px) {
  .account-management__header {
    flex-direction: column;
  }

  .account-form-grid,
  .permission-editor :deep(.el-checkbox-group) {
    grid-template-columns: 1fr;
  }
}
</style>
