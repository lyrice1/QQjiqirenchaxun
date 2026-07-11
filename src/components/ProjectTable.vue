<template>
  <div class="panel">
    <div class="panel-title">项目指令</div>
    <div class="toolbar">
      <div class="search-row">
        <input v-model="search" placeholder="搜索项目名称..." class="search-input" />
      </div>
      <div class="toolbar-actions">
        <label class="check-all-label">
          <input type="checkbox" :checked="allSelected" @change="toggleAll" :disabled="disabled" />
          全选
        </label>
        <button class="btn btn-batch" :disabled="disabled || !selectedCount" @click="startBatchQuery">
          批量查询 ({{ selectedCount }})
        </button>
        <button class="btn btn-del-sel" :disabled="disabled || !selectedCount" @click="deleteSelected">
          删除选中
        </button>
        <button class="btn btn-add-group" :disabled="disabled" @click="addGroup">+ 新增分组</button>
        <select v-if="selectedCount" v-model="moveTargetGroup" class="toolbar-move-select" @change="moveSelectedToGroup">
          <option value="" disabled>移动到...</option>
          <option v-for="g in allGroups" :key="g.id" :value="g.id">{{ g.name }}</option>
        </select>
        <button class="btn btn-reset" @click="resetAll">重置</button>
        <button v-if="undoStack.length" class="btn btn-undo" @click="performUndo">撤销 ({{ undoStack.length }})</button>
      </div>
    </div>

    <div v-for="group in filteredGroups" :key="group.id" class="group">
      <div class="group-header">
        <span class="group-toggle" @click="toggleGroup(group.id)">{{ collapsed[group.id] ? '▶' : '▼' }}</span>
        <template v-if="editingGroup === group.id">
          <input v-model="editGroupName" class="group-name-input" @keydown.enter="saveGroupName(group.id)" @keydown.escape="editingGroup = null" ref="groupInput" />
          <button class="btn-icon" @click="saveGroupName(group.id)" title="保存">✔</button>
          <button class="btn-icon" @click="editingGroup = null" title="取消">✕</button>
        </template>
        <template v-else>
          <span class="group-name" @dblclick="startEditGroup(group.id, group.name)">{{ group.name }}</span>
          <span class="group-count">({{ group.projects.length }})</span>
          <button class="btn-icon" title="重命名" @click="startEditGroup(group.id, group.name)">✎</button>
          <button class="btn-icon btn-add" title="添加项目" @click="startAddProject(group.id)">＋</button>
          <button class="btn-icon btn-sort" title="上移" @click="moveGroupUp(group.id)">▲</button>
          <button class="btn-icon btn-sort" title="下移" @click="moveGroupDown(group.id)">▼</button>
          <button class="btn-icon btn-del" title="删除分组" @click="confirmDeleteGroup(group.id)">✕</button>
        </template>
      </div>
      <div v-if="!collapsed[group.id]" class="group-body">
        <div class="table-scroll">
          <table class="ptable">
            <thead>
              <tr>
                <th style="width:30px">#</th>
                <th style="width:30px">
                  <input type="checkbox" :checked="groupSelected(group)" @change="toggleGroupSelect(group)" />
                </th>
                <th>项目名称</th>
                <th style="width:180px">操作</th>
                <th>到期时间</th>
                <th>自定义指令</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, idx) in group.items" :key="item.id">
                <td class="num-cell">{{ group.startIdx + idx + 1 }}</td>
                <td>
                  <input type="checkbox" :checked="selected.has(item.id)" @change="toggleItem(item.id)" />
                </td>
                <td class="name-cell">{{ item.name }}</td>
                <td class="action-cell">
                  <button class="btn-sm btn-login" :disabled="disabled" @click="$emit('send', item.name, 'login', item.name, item.id)">上车</button>
                  <button class="btn-sm btn-query" :disabled="disabled" @click="$emit('send', `${item.name}查询`, 'query', item.name, item.id)">查询</button>
                  <button class="btn-sm btn-mgmt" :disabled="disabled" @click="$emit('send', `${item.name}管理`, 'manage', item.name, item.id)">管理</button>
                </td>
                <td class="expiry-cell" :class="getExpiryClass(item.expiry)">{{ item.expiry || '' }}</td>
                <td class="custom-cell">
                  <div v-if="(item.customCommands || []).length" class="cmd-send-btns">
                    <span v-for="(cmd, ci) in (item.customCommands || [])" :key="cmd" class="cmd-btn-wrap">
                      <button class="btn-sm btn-custom-send" :disabled="disabled" @click="$emit('send', item.name + cmd, 'custom', item.name, item.id)" :title="`发送: ${item.name}${cmd}`">{{ cmd }}</button>
                      <button class="btn-cmd-del" :disabled="disabled" @click="removeCmd(group.id, item.id, ci)" title="删除此指令">×</button>
                    </span>
                  </div>
                  <button v-if="!(item.customCommands || []).length" class="btn-sm btn-query" :disabled="disabled" @click="startAddCmd(group.id, item.id)" title="添加自定义指令">+ 指令</button>
                  <div v-if="addCmdFor === item.id" class="cmd-add-row">
                    <input v-model="newCmd" class="inline-input" placeholder="新增指令" @keydown.enter="saveCmd(group.id, item.id)" @keydown.escape="addCmdFor = null" ref="cmdInput" />
                    <button class="btn-sm btn-query" @click="saveCmd(group.id, item.id)">保存</button>
                    <button class="btn-sm btn-login" @click="addCmdFor = null">取消</button>
                  </div>
                </td>
                <td class="remark-cell">
                  <textarea
                    v-model="item.remark"
                    class="remark-input"
                    placeholder=""
                    rows="1"
                    @blur="saveRemark(group.id, item.id, item.remark)"
                  ></textarea>
                </td>
              </tr>
              <tr v-if="addProjectGroup === group.id">
                <td></td>
                <td></td>
                <td>
                  <input v-model="newProject.name" class="inline-input" placeholder="项目名称" @keydown.enter="saveNewProject" @keydown.escape="addProjectGroup = null" />
                </td>
                <td>
                  <button class="btn-sm btn-query" @click="saveNewProject">保存</button>
                  <button class="btn-sm btn-login" @click="addProjectGroup = null">取消</button>
                </td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
            </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { getGroups, saveGroups, addProject as addProjectData, deleteProject, renameGroup, addGroup as addGroupData, deleteGroup, reorderGroup, resetToDefault, moveProject, addCustomCommand, removeCustomCommand, updateProjectRemark } from '../data/projects.js'

const props = defineProps({ disabled: Boolean, expiryVer: Number })
const emit = defineEmits(['send', 'batchQuery'])

const search = ref('')
const collapsed = ref({})
const editingGroup = ref(null)
const editGroupName = ref('')
const selected = ref(new Set())
const addProjectGroup = ref(null)
const newProject = ref({ name: '', price: '' })
const addCmdFor = ref(null)
const newCmd = ref('')
const moveTargetGroup = ref('')
const undoStack = ref([])
const groups = ref(getGroups())

watch(() => props.expiryVer, () => {
  groups.value = getGroups()
})

const allGroups = computed(() => groups.value)

const filteredGroups = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  let globalIdx = 0
  return groups.value
    .map(group => {
      const filtered = keyword
        ? group.projects.filter(item => item.name.toLowerCase().includes(keyword))
        : group.projects
      const startIdx = globalIdx
      globalIdx += filtered.length
      return filtered.length > 0 || !keyword
        ? { ...group, items: filtered, startIdx }
        : null
    })
    .filter(Boolean)
})

const allSelected = computed(() => {
  const allIds = filteredGroups.value.flatMap(g => g.items.map(i => i.id))
  return allIds.length > 0 && allIds.every(id => selected.value.has(id))
})

const selectedCount = computed(() => {
  const visibleIds = new Set(filteredGroups.value.flatMap(g => g.items.map(i => i.id)))
  let count = 0
  selected.value.forEach(id => { if (visibleIds.has(id)) count++ })
  return count
})

function toggleAll() {
  const visibleIds = filteredGroups.value.flatMap(g => g.items.map(i => i.id))
  if (allSelected.value) {
    visibleIds.forEach(id => selected.value.delete(id))
  } else {
    visibleIds.forEach(id => selected.value.add(id))
  }
}

function groupSelected(group) {
  return group.items.length > 0 && group.items.every(i => selected.value.has(i.id))
}

function toggleGroupSelect(group) {
  if (groupSelected(group)) {
    group.items.forEach(i => selected.value.delete(i.id))
  } else {
    group.items.forEach(i => selected.value.add(i.id))
  }
}

function toggleItem(id) {
  if (selected.value.has(id)) selected.value.delete(id)
  else selected.value.add(id)
}

function toggleGroup(id) {
  collapsed.value[id] = !collapsed.value[id]
}

function startEditGroup(id, name) {
  editingGroup.value = id
  editGroupName.value = name
  nextTick(() => focusGroupInput())
}

function focusGroupInput() {
  const inputs = document.querySelectorAll('.group-name-input')
  if (inputs.length) inputs[inputs.length - 1]?.focus()
}

function saveGroupName(id) {
  if (editGroupName.value.trim()) {
    renameGroup(id, editGroupName.value.trim())
    groups.value = getGroups()
  }
  editingGroup.value = null
}

function addGroup() {
  const name = prompt('请输入分组名称：')
  if (name?.trim()) {
    addGroupData(name.trim())
    groups.value = getGroups()
  }
}

function confirmDeleteGroup(id) {
  const g = groups.value.find(g => g.id === id)
  if (g && confirm(`确定要删除分组「${g.name}」及其中所有项目吗？`)) {
    saveUndoSnapshot()
    deleteGroup(id)
    groups.value = getGroups()
    selected.value = new Set()
  }
}

function moveGroupUp(id) {
  reorderGroup(id, 'up')
  groups.value = getGroups()
}

function moveGroupDown(id) {
  reorderGroup(id, 'down')
  groups.value = getGroups()
}

function startAddProject(gid) {
  addProjectGroup.value = gid
  newProject.value = { name: '' }
  nextTick(() => {
    const inputs = document.querySelectorAll('.inline-input')
    if (inputs.length) inputs[0]?.focus()
  })
}

function saveNewProject() {
  if (!newProject.value.name.trim()) return
  addProjectData(addProjectGroup.value, { name: newProject.value.name.trim() })
  groups.value = getGroups()
  addProjectGroup.value = null
  newProject.value = { name: '' }
}

function handleMove(fromGid, pid, toGid) {
  if (toGid && toGid !== fromGid) {
    moveProject(fromGid, toGid, pid)
    groups.value = getGroups()
    selected.value.delete(pid)
  }
}

function deleteSelected() {
  if (!confirm(`确定删除选中的 ${selectedCount.value} 个项目吗？`)) return
  saveUndoSnapshot()
  filteredGroups.value.forEach(group => {
    group.items.forEach(item => {
      if (selected.value.has(item.id)) {
        deleteProject(group.id, item.id)
      }
    })
  })
  groups.value = getGroups()
  selected.value = new Set()
}

function startAddCmd(gid, pid) {
  addCmdFor.value = pid
  newCmd.value = ''
  nextTick(() => {
    const inputs = document.querySelectorAll('.inline-input')
    if (inputs.length) inputs[inputs.length - 1]?.focus()
  })
}

function saveCmd(gid, pid) {
  if (!newCmd.value.trim()) return
  addCustomCommand(gid, pid, newCmd.value.trim())
  groups.value = getGroups()
  addCmdFor.value = null
  newCmd.value = ''
}

function removeCmd(gid, pid, ci) {
  saveUndoSnapshot()
  removeCustomCommand(gid, pid, ci)
  groups.value = getGroups()
}

function saveRemark(gid, pid, val) {
  updateProjectRemark(gid, pid, val)
}

function resetAll() {
  if (confirm('确定要重置为默认项目列表吗？所有自定义修改将丢失。')) {
    resetToDefault()
    groups.value = getGroups()
    selected.value = new Set()
  }
}

function startBatchQuery() {
  const selectedItems = filteredGroups.value.flatMap(g =>
    g.items.filter(i => selected.value.has(i.id))
  )
  if (!selectedItems.length) return
  emit('batchQuery', selectedItems)
}

function moveSelectedToGroup() {
  const toGid = moveTargetGroup.value
  if (!toGid) return
  saveUndoSnapshot()
  filteredGroups.value.forEach(group => {
    group.items.forEach(item => {
      if (selected.value.has(item.id) && group.id !== toGid) {
        moveProject(group.id, toGid, item.id)
      }
    })
  })
  groups.value = getGroups()
  selected.value = new Set()
  moveTargetGroup.value = ''
}

function saveUndoSnapshot() {
  undoStack.value.push(JSON.parse(JSON.stringify(groups.value)))
  if (undoStack.value.length > 20) undoStack.value.shift()
}

function getExpiryClass(expiryStr) {
  if (!expiryStr) return ''
  const re = /(\d{4}\.\d{2}\.\d{2})/g
  let m
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let minDays = Infinity
  while ((m = re.exec(expiryStr)) !== null) {
    const d = new Date(m[1].replace(/\./g, '-'))
    if (isNaN(d.getTime())) continue
    const days = Math.ceil((d - today) / (1000 * 60 * 60 * 24))
    if (days < minDays) minDays = days
  }
  if (minDays === Infinity) return ''
  if (minDays > 15) return 'expiry-green'
  if (minDays > 7) return 'expiry-yellow'
  return 'expiry-red'
}

function performUndo() {
  if (!undoStack.value.length) return
  const snapshot = undoStack.value.pop()
  localStorage.setItem('qq-bot-project-groups', JSON.stringify(snapshot))
  groups.value = getGroups()
  selected.value = new Set()
}
</script>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.search-row {
  flex: 1;
  min-width: 180px;
}

.search-input {
  width: 100%;
  padding: 7px 10px;
  border: 1px solid #dfe6e9;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
}

.search-input:focus {
  border-color: #6c5ce7;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.check-all-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  cursor: pointer;
  user-select: none;
}

.btn {
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  font-weight: 500;
}

.btn-batch {
  background: #6c5ce7;
  color: #fff;
}

.btn-batch:hover:not(:disabled) {
  background: #5a4bd1;
}

.btn-del-sel {
  background: #d63031;
  color: #fff;
}

.btn-del-sel:hover:not(:disabled) {
  background: #c0392b;
}

.btn-add-group {
  background: #00b894;
  color: #fff;
}

.btn-add-group:hover:not(:disabled) {
  background: #00a381;
}

.toolbar-move-select {
  font-size: 12px;
  padding: 5px 8px;
  border: 1px solid #dfe6e9;
  border-radius: 6px;
  color: #2d3436;
  background: #fff;
  cursor: pointer;
  outline: none;
}

.toolbar-move-select:focus {
  border-color: #00b894;
}

.btn-reset {
  background: #dfe6e9;
  color: #636e72;
  font-size: 12px;
}

.btn-undo {
  background: #fdcb6e;
  color: #2d3436;
  font-size: 12px;
}

.btn-undo:hover {
  background: #f39c12;
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.group {
  margin-bottom: 16px;
  border: 1px solid #eee;
  border-radius: 8px;
  overflow: hidden;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: #f8f9fa;
  font-size: 14px;
  font-weight: 600;
  user-select: none;
}

.group-toggle {
  cursor: pointer;
  width: 18px;
  text-align: center;
  color: #636e72;
}

.group-name {
  cursor: pointer;
  color: #6c5ce7;
}

.group-count {
  color: #b2bec3;
  font-size: 12px;
  font-weight: 400;
}

.group-name-input {
  padding: 3px 6px;
  border: 1px solid #6c5ce7;
  border-radius: 4px;
  font-size: 14px;
  outline: none;
}

.btn-icon {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 13px;
  color: #b2bec3;
  padding: 2px 4px;
  border-radius: 4px;
}

.btn-icon:hover {
  background: #eee;
  color: #636e72;
}

.btn-del:hover {
  color: #d63031;
  background: #ffeaea;
}

.btn-sort {
  font-size: 10px;
  padding: 1px 3px;
}

.btn-sort:hover {
  background: #dfe6e9;
  color: #6c5ce7;
}

.btn-add:hover {
  color: #00b894;
}

.group-body {
  padding: 8px;
}

.table-scroll {
  overflow-x: auto;
}

.ptable {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.ptable th,
.ptable td {
  padding: 6px 8px;
  text-align: left;
  border-bottom: 1px solid #f0f0f0;
  white-space: nowrap;
}

.ptable th {
  background: #fff;
  font-weight: 600;
  color: #636e72;
  font-size: 12px;
}

.ptable tr:hover td {
  background: #fafbfc;
}

.num-cell {
  color: #b2bec3;
  font-size: 12px;
}

.name-cell {
  font-weight: 500;
}

.action-cell {
  display: flex;
  gap: 2px;
  align-items: center;
}

.custom-cell {
  white-space: normal;
}

.cmd-send-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  margin-bottom: 4px;
}

.cmd-btn-wrap {
  display: inline-flex;
  align-items: center;
  gap: 1px;
}

.btn-cmd-del {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 13px;
  color: #b2bec3;
  padding: 1px 3px;
  border-radius: 3px;
  line-height: 1;
}

.btn-cmd-del:hover:not(:disabled) {
  color: #d63031;
  background: #ffeaea;
}

.btn-custom-send {
  background: #a29bfe;
  color: #fff;
}

.btn-custom-send:hover:not(:disabled) {
  background: #6c5ce7;
}

.cmd-add-row {
  display: flex;
  gap: 4px;
  align-items: center;
  margin-top: 4px;
}

.expiry-cell {
  font-size: 12px;
  color: #636e72;
  white-space: pre-wrap;
  word-break: break-word;
  min-width: 100px;
}

.expiry-green {
  color: #00b894;
  font-weight: 600;
}

.expiry-yellow {
  color: #f39c12;
  font-weight: 600;
}

.expiry-red {
  color: #d63031;
  font-weight: 600;
}

.remark-cell {
  min-width: 200px;
  white-space: normal;
  word-break: break-word;
}

.remark-input {
  width: 100%;
  padding: 3px 6px;
  border: 1px solid transparent;
  border-radius: 4px;
  font-size: 12px;
  font-family: inherit;
  outline: none;
  background: transparent;
  min-width: 60px;
  resize: none;
  overflow: hidden;
  line-height: 1.5;
}

.remark-input:hover,
.remark-input:focus {
  border-color: #dfe6e9;
  background: #fff;
}

.inline-input {
  padding: 4px 6px;
  border: 1px solid #74b9ff;
  border-radius: 4px;
  font-size: 13px;
  outline: none;
  width: 100%;
  min-width: 80px;
}

.btn-sm {
  padding: 4px 8px;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-sm:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-login {
  background: #dfe6e9;
  color: #2d3436;
}

.btn-login:hover:not(:disabled) {
  background: #b2bec3;
}

.btn-query {
  background: #74b9ff;
  color: #fff;
}

.btn-query:hover:not(:disabled) {
  background: #0984e3;
}

.btn-mgmt {
  background: #fdcb6e;
  color: #2d3436;
}

.btn-mgmt:hover:not(:disabled) {
  background: #f39c12;
}
</style>
