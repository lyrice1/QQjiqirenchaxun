<template>
  <div class="app">
    <header>
      <h1>QQ机器人查询管理</h1>
      <p>点击项目按钮快捷发送指令，或在下方输入自定义指令</p>
    </header>

    <main>
      <ConfigPanel
        :config="config"
        :connected="connected"
        :connecting="connecting"
        @update:config="updateConfig"
        @connect="handleConnect"
        @disconnect="handleDisconnect"
      />

      <ProjectTable
        :disabled="!connected || running"
        :expiry-ver="expiryVer"
        @send="openDialog"
        @batchQuery="handleBatchQuery"
      />

      <ResultPanel
        :messages="messages"
        :running="running"
        :completed-count="completedCount"
        :total-count="totalCount"
        @clear="messages = []"
      />

      <div class="debug-panel">
        <div class="debug-title">解析调试</div>
        <div class="debug-item">dialogMode: {{ dialogMode }}</div>
        <div class="debug-item">dialogProjectId: {{ dialogProjectId }}</div>
        <div class="debug-item">tryParseExpiry 被调: {{ debugCalled ? '是' : '否' }}</div>
        <pre class="debug-content">{{ debugParseResult || '(等待解析...)' }}</pre>
      </div>
    </main>

    <ChatDialog
      v-if="dialogVisible"
      :title="dialogTitle"
      :messages="dialogMessages"
      :waiting="dialogWaiting"
      :mode="dialogMode"
      :projectName="dialogProjectName"
      @close="closeDialog"
      @send="handleDialogSend"
    />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import ConfigPanel from './components/ConfigPanel.vue'
import ProjectTable from './components/ProjectTable.vue'
import ChatDialog from './components/ChatDialog.vue'
import ResultPanel from './components/ResultPanel.vue'
import { sendPrivateMessage, sendGroupMessage, getLoginInfo, setBaseUrl, setToken, getFriendMsgHistory } from './api/napcat.js'
import { updateProjectExpiryById, findProjectIdByName } from './data/projects.js'

const config = reactive({
  apiUrl: '/api',
  token: 'hzqOYLEdHS_rz0CN',
  targetId: '3417340167',
  chatType: 'private',
  interval: 1500
})

const connected = ref(false)
const connecting = ref(false)
const running = ref(false)
const messages = ref([])
const completedCount = ref(0)
const totalCount = ref(0)
const expiryVer = ref(0)
const debugParseResult = ref('')
const debugCalled = ref(false)

let ws = null
let stopFlag = false
let sendStartTime = 0

onMounted(() => {
  // 每2分钟自动备份
  setInterval(() => {
    const data = localStorage.getItem('qq-bot-project-groups')
    if (data) localStorage.setItem('qq-bot-project-groups-backup', data)
  }, 120000)
})

function updateConfig(newConfig) {
  Object.assign(config, newConfig)
}

async function handleConnect() {
  connecting.value = true
  setBaseUrl(config.apiUrl)
  setToken(config.token)
  try {
    const info = await getLoginInfo()
    if (info?.status !== 'ok') {
      throw new Error(info?.message || info?.wording || 'API 返回异常')
    }
    connected.value = true
    setupWebSocket()
  } catch (e) {
    alert('无法连接到 NapCat，请确认：\n1. NapCat 已启动\n2. API 地址和 Token 正确\n3. 如提示 Token 错误，请到 WebUI 网络配置中复制正确的 Access Token')
    console.error(e)
  } finally {
    connecting.value = false
  }
}

function setupWebSocket() {
  let wsUrl = config.apiUrl.replace(/^http/, 'ws')
  if (wsUrl.startsWith('/')) {
    wsUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + wsUrl
  }
  try {
    ws = new WebSocket(`${wsUrl}/`)
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.post_type === 'message' && data.message_type === 'private') {
          const senderId = String(data.sender?.user_id || data.user_id)
          if (senderId === String(config.targetId)) {
            const msg = data.raw_message || data.message
            if (msg) {
              const text = decodeHtml(msg)
              addMessage('robot', text, data.sender?.nickname || `QQ:${senderId}`)
              if (dialogVisible.value) {
                const msgTime = new Date(data.time * 1000).toLocaleTimeString()
                if (!dialogSeenSet.has(text)) {
                  dialogSeenSet.add(text)
                  dialogMessages.value = [...dialogMessages.value, { role: 'reply', content: text, time: msgTime }]
                  if (!dialogIsQuery.value) dialogWaiting.value = false
                  tryParseExpiry(text)
                }
              }
            }
          }
        }
      } catch (e) { /* ignore parse errors */ }
    }
    ws.onclose = () => {}
  } catch (e) {
    console.warn('WebSocket 连接失败，将无法实时接收回复', e)
  }
}

function handleDisconnect() {
  if (ws) {
    ws.close()
    ws = null
  }
  connected.value = false
}

function decodeHtml(text) {
  if (!text) return text
  const el = document.createElement('div')
  el.innerHTML = text
  return el.textContent || el.innerText || text
}

function addMessage(type, text, label) {
  messages.value = [...messages.value, {
    type,
    text: decodeHtml(text),
    label,
    time: new Date().toLocaleTimeString()
  }]
}

async function waitForReply(timeoutMs, pollInterval = 2000) {
  const start = Date.now()
  const timeFloor = sendStartTime - 500
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await getFriendMsgHistory(Number(config.targetId), 10)
      if (res?.status === 'ok' && res.data?.messages) {
        const replies = res.data.messages
          .filter(m => String(m.sender?.user_id) === String(config.targetId) && m.time * 1000 >= timeFloor)
        if (replies.length) {
          let text = replies[0].raw_message
          if (!text && Array.isArray(replies[0].message)) {
            text = replies[0].message.map(s => s.data?.text || '').join('')
          }
          if (text) return text
        }
      }
    } catch (e) { /* retry */ }
    await new Promise(r => setTimeout(r, pollInterval))
  }
  return null
}

async function waitForAdditionalReplies(timeFloor, maxWait, label) {
  const start = Date.now()
  let floor = timeFloor
  let rounds = 0
  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 2500))
    try {
      const res = await getFriendMsgHistory(Number(config.targetId), 10)
      if (res?.status === 'ok' && res.data?.messages) {
        const newMsgs = res.data.messages
          .filter(m => String(m.sender?.user_id) === String(config.targetId) && m.time * 1000 >= floor)
        if (newMsgs.length) {
          for (const msg of [...newMsgs].reverse()) {
            let text = msg.raw_message
            if (!text && Array.isArray(msg.message)) {
              text = msg.message.map(s => s.data?.text || '').join('')
            }
            if (text) {
              text = decodeHtml(text)
              addMessage('robot', text, label)
              if (/查询完成/.test(text)) return
            }
          }
          floor = newMsgs[0].time * 1000 + 1000
          rounds = 0
        }
      }
    } catch (e) {}
    rounds++
    if (rounds >= 8) return
  }
}

function parseReplyOption(replyText) {
  const decoded = decodeHtml(replyText)
  const matches = decoded.match(/\[([^\]]+)\]\s*([^\n]*)/g)
  if (!matches) return null
  for (const m of matches) {
    const match = m.match(/\[([^\]]+)\]\s*(.*)/)
    if (match) {
      const key = match[1].trim()
      const desc = match[2].trim()
      if (/全部/.test(desc)) return key
    }
  }
  const first = matches[0].match(/\[([^\]]+)\]/)
  return first ? first[1].trim() : null
}

async function handleBatchQuery(selectedItems) {
  if (!config.targetId.trim()) {
    alert('请填写目标 QQ 号')
    return
  }
  if (!selectedItems.length) return

  running.value = true
  stopFlag = false
  messages.value = []
  completedCount.value = 0
  totalCount.value = selectedItems.length

  const sendFn = config.chatType === 'group' ? sendGroupMessage : sendPrivateMessage

  for (let i = 0; i < selectedItems.length; i++) {
    if (stopFlag) break

    const item = selectedItems[i]
    const queryText = `${item.name}查询`

    sendStartTime = Date.now()
    addMessage('sent', `发送: ${queryText}`, item.name)

    try {
      const res = await sendFn(Number(config.targetId), queryText)
      if (res?.status !== 'ok') {
        addMessage('error', `发送失败: ${res?.msg || res?.wording || '未知错误'}`, item.name)
        await new Promise(r => setTimeout(r, config.interval))
        continue
      }
    } catch (e) {
      addMessage('error', `发送失败: ${e.message || '网络错误'}`, item.name)
      continue
    }

    const reply1 = await waitForReply(10000)
    if (reply1) {
      addMessage('robot', decodeHtml(reply1), item.name)
    }

    if (stopFlag) break

    const option = reply1 ? parseReplyOption(reply1) : null
    const autoCmd = option || 'a'

    sendStartTime = Date.now()
    addMessage('sent', `自动回复: ${autoCmd}`, item.name)

    try {
      await sendFn(Number(config.targetId), autoCmd)
    } catch (e) {
      addMessage('error', `发送失败: ${e.message}`, item.name)
      continue
    }

    const reply2 = await waitForReply(10000)
    if (reply2) {
      addMessage('robot', decodeHtml(reply2), item.name)
      if (!/查询完成/.test(decodeHtml(reply2))) {
        await waitForAdditionalReplies(sendStartTime, 25000, item.name)
      }
    }

    completedCount.value = i + 1

    if (i < selectedItems.length - 1 && !stopFlag) {
      await new Promise(r => setTimeout(r, config.interval))
    }
  }

  running.value = false
}

const dialogVisible = ref(false)
const dialogTitle = ref('')
const dialogMessages = ref([])
const dialogWaiting = ref(false)
const dialogIsQuery = ref(false)
const dialogMode = ref('')
const dialogProjectName = ref('')
const dialogProjectId = ref('')
let dialogPollTimer = null
let dialogSendStartTime = 0
const dialogSeenSet = new Set()

function closeDialog() {
  clearInterval(dialogPollTimer)
  dialogPollTimer = null
  dialogVisible.value = false
  dialogIsQuery.value = false
  dialogMode.value = ''
  dialogSeenSet.clear()
}

async function openDialog(query, mode = 'custom', projectName = '', projectId = '') {
  clearInterval(dialogPollTimer)
  dialogPollTimer = null
  dialogSeenSet.clear()
  dialogTitle.value = query
  dialogMessages.value = []
  dialogWaiting.value = true
  dialogVisible.value = true
  dialogIsQuery.value = mode === 'query'
  dialogMode.value = mode
  dialogProjectName.value = projectName
  dialogProjectId.value = projectId
  await handleDialogSend(query)
}

async function handleDialogSend(text) {
  const time = new Date().toLocaleTimeString()
  dialogMessages.value = [...dialogMessages.value, { role: 'sent', content: text, time }]
  addMessage('sent', text, dialogProjectName.value)
  dialogWaiting.value = true

  const sendFn = config.chatType === 'group' ? sendGroupMessage : sendPrivateMessage
  try {
    const res = await sendFn(Number(config.targetId), text)
    if (res?.status === 'ok') {
      dialogSendStartTime = Date.now()
      const isNewPoll = !dialogPollTimer
      if (isNewPoll) startDialogPolling()
    } else {
      dialogMessages.value = [...dialogMessages.value, { role: 'reply', content: res?.msg || res?.wording || '发送失败', time: new Date().toLocaleTimeString() }]
      dialogWaiting.value = false
    }
  } catch (e) {
    dialogMessages.value = [...dialogMessages.value, { role: 'reply', content: e.message || '网络错误', time: new Date().toLocaleTimeString() }]
    dialogWaiting.value = false
  }
}

function startDialogPolling() {
  clearInterval(dialogPollTimer)
  let timeFloor = dialogSendStartTime - 1000
  let pollCount = 0
  const maxPolls = 30
  let autoReplied = false
  let quietCount = 0
  const quietLimit = 3

  dialogPollTimer = setInterval(async () => {
    pollCount++
    try {
      const res = await getFriendMsgHistory(Number(config.targetId), 10)
      if (res?.status === 'ok' && res.data?.messages) {
        const newMsgs = res.data.messages
          .filter(m => String(m.sender?.user_id) === String(config.targetId) && m.time * 1000 >= timeFloor)
        if (newMsgs.length) {
          quietCount = 0
          const addedTexts = []
          for (const msg of [...newMsgs].reverse()) {
            let text = msg.raw_message
            if (!text && Array.isArray(msg.message)) {
              text = msg.message.map(s => s.data?.text || '').join('')
            }
            if (text && !dialogSeenSet.has(text)) {
              dialogSeenSet.add(text)
              text = decodeHtml(text)
              const msgTime = new Date(msg.time * 1000).toLocaleTimeString()
              dialogMessages.value = [...dialogMessages.value, { role: 'reply', content: text, time: msgTime }]
              addMessage('robot', text, dialogProjectName.value)
              addedTexts.push({ text, msgTime })
              tryParseExpiry(text)
            }
          }

          if (!dialogIsQuery.value) {
            dialogWaiting.value = false
          }

          const lastText = addedTexts.length ? addedTexts[addedTexts.length - 1].text : ''
          if (/查询完成/.test(lastText)) {
            dialogWaiting.value = false
            clearInterval(dialogPollTimer)
            dialogPollTimer = null
            return
          }

          if (dialogIsQuery.value && !autoReplied) {
            for (const { text } of addedTexts) {
              const option = parseReplyOption(text)
              if (option) {
                autoReplied = true
                clearInterval(dialogPollTimer)
                dialogPollTimer = null
                await handleDialogSend(option)
                return
              }
            }
          }
        } else {
          quietCount++
        }
      } else {
        quietCount++
      }
      if (quietCount >= quietLimit) {
        dialogWaiting.value = false
        clearInterval(dialogPollTimer)
        dialogPollTimer = null
        return
      }
      if (pollCount >= maxPolls) {
        dialogWaiting.value = false
        clearInterval(dialogPollTimer)
        dialogPollTimer = null
      }
    } catch (e) {
      quietCount++
      if (quietCount >= quietLimit || pollCount >= maxPolls) {
        dialogWaiting.value = false
        clearInterval(dialogPollTimer)
        dialogPollTimer = null
      }
    }
  }, 1500)
}

function tryParseExpiry(text) {
  debugCalled.value = true
  if (!dialogProjectId.value) return
  if (dialogMode.value !== 'manage') return

  console.log('[DEBUG] tryParseExpiry called, dialogProjectId=' + dialogProjectId.value + ', mode=' + dialogMode.value)
  console.log('[DEBUG] raw text:\n' + text)

  const lines = text.split('\n')
  const projectEntries = {}
  let currentProjectId = dialogProjectId.value

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    const headerMatch = line.match(/^={2,}\s*(?:我的)?\s*(.+?)\s*(?:账号)?\s*={2,}$/)
    if (headerMatch) {
      const pn = headerMatch[1].trim()
      console.log(`[DEBUG] header matched: pn="${pn}"`)
      const found = findProjectIdByName(pn)
      console.log(`[DEBUG] findProjectIdByName("${pn}") = ${found}, currentProjectId=${currentProjectId}`)
      if (found) {
        currentProjectId = found
      }
      continue
    }

    const acctMatch = line.match(/^\[(\d+)\](.*)/)
    if (!acctMatch) continue
    const num = acctMatch[1]
    if (num === '0' || /^0/.test(num)) continue

    let name = acctMatch[2].trim().replace(/^账号\s*[:：]\s*/, '').trim()
    if (!name || /^(全部|删除|授权|批量)/.test(name)) continue

    let date = null
    const inlineDate = name.match(/\(到期\s*[:：]\s*(\d{4}[.\-]\d{2}[.\-]\d{2})\)/)
    if (inlineDate) {
      date = inlineDate[1].replace(/-/g, '.')
      const beforeParen = name.replace(/\(.*$/, '').trim()
      const parenMatch = name.match(/\(([^,)]+)/)
      const innerName = parenMatch ? parenMatch[1].trim() : ''
      name = innerName ? `${beforeParen}(${innerName})` : beforeParen
    } else {
      for (let j = i + 1; j <= Math.min(i + 4, lines.length - 1); j++) {
        const nl = lines[j].trim()
        if (/^\[/.test(nl) && !/授权/.test(nl)) break
        const m = nl.match(/授权\s*[:：]\s*[^\d]*(\d{4}[.\-]\d{2}[.\-]\d{2})/)
        if (m) { date = m[1].replace(/-/g, '.'); break }
        const m2 = nl.match(/(\d{4}[.\-]\d{2}[.\-]\d{2})/)
        if (m2 && /到期|授权/.test(nl)) { date = m2[1].replace(/-/g, '.'); break }
      }
    }

    console.log(`[DEBUG] acct[${num}] name="${name}" date="${date}"`)
    if (date) {
      if (!projectEntries[currentProjectId]) projectEntries[currentProjectId] = []
      projectEntries[currentProjectId].push(`${date}-${name}`)
    }
  }

  let updated = false
  const debugInfo = {}
  for (const [pid, entries] of Object.entries(projectEntries)) {
    if (entries.length) {
      updateProjectExpiryById(pid, entries.join('\n'))
      updated = true
      debugInfo[pid] = entries
    }
  }
  debugParseResult.value = JSON.stringify(debugInfo, null, 2)

  if (!updated) {
    const globalRe = /(\d{4}[.\-]\d{2}[.\-]\d{2})/g
    const fallback = []
    let m
    while ((m = globalRe.exec(text)) !== null) {
      const ctx = text.substring(Math.max(0, m.index - 30), m.index + m[0].length + 10)
      if (/到期|授权/.test(ctx)) {
        fallback.push(m[1].replace(/-/g, '.'))
      }
    }
    if (fallback.length) {
      updateProjectExpiryById(dialogProjectId.value, fallback.join('\n'))
      updated = true
    }
  }

  if (updated) {
    console.log('[DEBUG] updated entries:', entries)
    console.log('[DEBUG] stored value:', localStorage.getItem('qq-bot-project-groups'))
    expiryVer.value++
  }
}
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}

.debug-panel {
  background: #1a1a2e;
  color: #00ff88;
  border-radius: 12px;
  padding: 16px;
  margin-top: 8px;
  font-size: 12px;
}

.debug-title {
  font-weight: bold;
  margin-bottom: 8px;
  color: #ff6b6b;
}

.debug-item {
  color: #aaddff;
  margin-bottom: 4px;
}

.debug-content {
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 300px;
  overflow-y: auto;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: linear-gradient(180deg, #f7f8fc, #fff);
  color: #2d3748;
  min-height: 100vh;
  min-height: 100dvh;
}

.app {
  max-width: 960px;
  margin: 0 auto;
  padding: 24px 16px 40px;
}

header {
  text-align: center;
  margin-bottom: 32px;
  padding: 28px 16px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  border-radius: 16px;
  color: #fff;
  box-shadow: 0 4px 20px rgba(102, 126, 234, 0.3);
}

header h1 {
  font-size: 24px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 6px;
}

header p {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.85);
}

main {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.panel {
  background: #fff;
  border-radius: 14px;
  padding: 20px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
  border: 1px solid #f0f1f8;
}

.panel-title {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 16px;
  color: #1a1a2e;
}

.form-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-group label {
  font-size: 13px;
  color: #4a5568;
  font-weight: 600;
}

.form-group input,
.form-group select {
  padding: 10px 14px;
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  font-size: 14px;
  outline: none;
  background: #f8fafc;
  transition: all 0.2s;
}

.form-group input:focus,
.form-group select:focus {
  border-color: #667eea;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.12);
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  padding-top: 8px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}

.status-dot.online {
  background: #38a169;
  box-shadow: 0 0 6px rgba(56, 161, 105, 0.5);
  animation: pulse-dot 2s ease-in-out infinite;
}

.status-dot.connecting {
  background: #d69e2e;
  box-shadow: 0 0 6px rgba(214, 158, 46, 0.5);
  animation: pulse-dot 0.8s ease-in-out infinite;
}

.status-dot.offline {
  background: #a0aec0;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(1.3); }
}

.config-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn:active:not(:disabled) {
  transform: scale(0.95);
}

.btn-primary {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
  box-shadow: 0 2px 6px rgba(102, 126, 234, 0.3);
}

.btn-primary:hover:not(:disabled) {
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.btn-danger {
  background: linear-gradient(135deg, #e74c3c, #c0392b);
  color: #fff;
  box-shadow: 0 2px 6px rgba(231, 76, 60, 0.25);
}

.btn-danger:hover:not(:disabled) {
  box-shadow: 0 4px 12px rgba(231, 76, 60, 0.35);
}

.btn-success {
  background: linear-gradient(135deg, #00b894, #00a381);
  color: #fff;
  box-shadow: 0 2px 6px rgba(0, 184, 148, 0.25);
}

.btn-success:hover:not(:disabled) {
  box-shadow: 0 4px 12px rgba(0, 184, 148, 0.35);
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none !important;
}

hr {
  border: none;
  border-top: 1px solid #e2e8f0;
  margin: 8px 0;
}

@media (max-width: 480px) {
  .app {
    padding: 12px 10px 32px;
  }
  header {
    border-radius: 12px;
    padding: 20px 14px;
  }
  header h1 {
    font-size: 20px;
  }
  .panel {
    border-radius: 12px;
    padding: 16px;
  }
  .connection-status {
    font-size: 14px;
  }
}
</style>
