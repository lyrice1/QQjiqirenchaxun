<template>
  <div class="app">
    <header>
      <h1>QQ 机器人批量查询工具 v2</h1>
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
import { ref, reactive } from 'vue'
import ConfigPanel from './components/ConfigPanel.vue'
import ProjectTable from './components/ProjectTable.vue'
import ChatDialog from './components/ChatDialog.vue'
import ResultPanel from './components/ResultPanel.vue'
import { sendPrivateMessage, sendGroupMessage, getLoginInfo, setBaseUrl, setToken, getFriendMsgHistory } from './api/napcat.js'
import { updateProjectExpiryById } from './data/projects.js'

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

let ws = null
let stopFlag = false
let sendStartTime = 0

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
              addMessage('robot', decodeHtml(msg), data.sender?.nickname || `QQ:${senderId}`)
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

function closeDialog() {
  clearInterval(dialogPollTimer)
  dialogVisible.value = false
  dialogIsQuery.value = false
  dialogMode.value = ''
}

async function openDialog(query, mode = 'custom', projectName = '', projectId = '') {
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
  dialogSendStartTime = Date.now()

  const sendFn = config.chatType === 'group' ? sendGroupMessage : sendPrivateMessage
  try {
    const res = await sendFn(Number(config.targetId), text)
    if (res?.status === 'ok') {
      startDialogPolling()
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
  const timeFloor = dialogSendStartTime - 1000
  const seen = new Set()
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
            if (text && !seen.has(text)) {
              seen.add(text)
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
            return
          }

          if (dialogIsQuery.value && !autoReplied) {
            for (const { text } of addedTexts) {
              const option = parseReplyOption(text)
              if (option) {
                autoReplied = true
                clearInterval(dialogPollTimer)
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
        return
      }
      if (pollCount >= maxPolls) {
        dialogWaiting.value = false
        clearInterval(dialogPollTimer)
      }
    } catch (e) {
      quietCount++
      if (quietCount >= quietLimit || pollCount >= maxPolls) {
        dialogWaiting.value = false
        clearInterval(dialogPollTimer)
      }
    }
  }, 1500)
}

function tryParseExpiry(text) {
  if (!dialogProjectId.value) return
  if (dialogMode.value !== 'manage') return

  const lines = text.split('\n')
  const parts = []
  const dateRe = /(\d{4}[.\-]\d{2}[.\-]\d{2})/

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    const acctMatch = line.match(/^\[(\d+)\](.*)/)
    if (!acctMatch) continue
    const num = acctMatch[1]
    if (num === '0' || /^0/.test(num)) continue

    let name = acctMatch[2].trim().replace(/^账号\s*[:：]\s*/, '').trim()
    if (!name || /^(全部|删除|授权|批量)/.test(name)) continue

    const inlineDate = name.match(/\(到期\s*[:：]\s*(\d{4}[.\-]\d{2}[.\-]\d{2})\)/)
    if (inlineDate) {
      name = name.replace(/\(到期\s*[:：].*\)/, '').trim()
      parts.push(`${inlineDate[1].replace(/-/g, '.')}-${name}`)
      continue
    }

    const authDate = line.match(/授权\s*[:：]\s*[^\d]*(\d{4}[.\-]\d{2}[.\-]\d{2})/)
    if (authDate) {
      parts.push(`${authDate[1].replace(/-/g, '.')}-${name}`)
      continue
    }

    for (let j = i + 1; j <= Math.min(i + 4, lines.length - 1); j++) {
      const nl = lines[j].trim()
      if (/^\[/.test(nl)) break
      const m = nl.match(dateRe)
      if (m && /到期|授权/.test(nl)) {
        parts.push(`${m[1].replace(/-/g, '.')}-${name}`)
        break
      }
    }
  }

  if (parts.length) {
    updateProjectExpiryById(dialogProjectId.value, parts.join('\n'))
    expiryVer.value++
  }
}
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f5f6fa;
  color: #2d3436;
  min-height: 100vh;
}

.app {
  max-width: 960px;
  margin: 0 auto;
  padding: 24px 16px;
}

header {
  text-align: center;
  margin-bottom: 32px;
}

header h1 {
  font-size: 24px;
  font-weight: 700;
  color: #2d3436;
  margin-bottom: 8px;
}

header p {
  font-size: 14px;
  color: #636e72;
}

main {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.panel {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}

.panel-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 16px;
  color: #2d3436;
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
  color: #636e72;
  font-weight: 500;
}

.form-group input,
.form-group select {
  padding: 8px 12px;
  border: 1px solid #dfe6e9;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.form-group input:focus,
.form-group select:focus {
  border-color: #6c5ce7;
}

.config-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: #6c5ce7;
  color: #fff;
}

.btn-primary:hover:not(:disabled) {
  background: #5a4bd1;
}

.btn-danger {
  background: #d63031;
  color: #fff;
}

.btn-success {
  background: #00b894;
  color: #fff;
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

hr {
  border: none;
  border-top: 1px solid #dfe6e9;
  margin: 8px 0;
}
</style>
