<template>
  <div class="dialog-overlay" @click.self="$emit('close')">
    <div class="dialog">
      <div class="dialog-header">
        <span class="dialog-title">{{ title }}</span>
        <button class="close-btn" @click="$emit('close')">&times;</button>
      </div>
      <div class="dialog-body" ref="bodyEl">
        <div v-for="(msg, i) in messages" :key="i" :class="['msg', msg.role]">
          <div class="msg-meta">
            <span class="msg-role">{{ msg.role === 'sent' ? '发送' : '回复' }}</span>
            <span class="msg-time">{{ msg.time }}</span>
          </div>
          <div class="msg-content">{{ msg.content }}</div>
        </div>
        <div v-if="waiting" class="msg reply">
          <div class="msg-content waiting">等待回复中...</div>
        </div>
      </div>
      <div :class="['dialog-footer', mode ? 'dialog-footer--narrow' : '']">
        <div class="footer-input-row">
          <input
            ref="inputEl"
            v-model="input"
            @keydown.enter="sendMsg"
            placeholder="输入指令后回车发送..."
          />
          <button class="btn btn-send" @click="sendMsg" :disabled="!input.trim()">发送</button>
        </div>
        <div v-if="mode" class="footer-quick-row">
          <button v-if="mode === 'login'" class="btn btn-login" @click="quickSend(projectName + '登录')">登录</button>
          <button v-if="mode === 'login'" class="btn btn-num" @click="quickSend('1')">1</button>
          <button v-if="mode === 'login'" class="btn btn-num" @click="quickSend('2')">2</button>
          <button v-if="mode === 'login'" class="btn btn-num btn-num--q" @click="quickSend('q')">q</button>
          <button v-if="mode === 'login'" class="btn btn-num" @click="quickSend('y')">y</button>
          <button v-if="mode === 'login'" class="btn btn-num" @click="quickSend('n')">n</button>
          <template v-if="mode === 'manage'">
            <button class="btn btn-num" @click="quickSend('1')">1</button>
            <button class="btn btn-num" @click="quickSend('2')">2</button>
            <button class="btn btn-num" @click="quickSend('3')">3</button>
            <button class="btn btn-num btn-num--q" @click="quickSend('q')">q</button>
            <button class="btn btn-num" @click="quickSend('y')">y</button>
            <button class="btn btn-num" @click="quickSend('n')">n</button>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'

const props = defineProps({
  title: String,
  messages: Array,
  waiting: Boolean,
  mode: { type: String, default: '' },
  projectName: { type: String, default: '' }
})

const emit = defineEmits(['close', 'send'])

const input = ref('')
const inputEl = ref(null)
const bodyEl = ref(null)

function sendMsg() {
  const text = input.value.trim()
  if (!text) return
  emit('send', text)
  input.value = ''
  nextTick(() => inputEl.value?.focus())
}

function quickSend(text) {
  emit('send', text)
}

watch(() => props.messages.length, () => {
  nextTick(() => {
    if (bodyEl.value) {
      bodyEl.value.scrollTop = bodyEl.value.scrollHeight
    }
  })
})

watch(() => props.title, (val) => {
  if (val) {
    nextTick(() => inputEl.value?.focus())
  }
})
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  background: #fff;
  border-radius: 12px;
  width: 90vw;
  max-width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 40px rgba(0,0,0,0.15);
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #f0f0f0;
}

.dialog-title {
  font-size: 16px;
  font-weight: 600;
  color: #2d3436;
}

.close-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: none;
  font-size: 22px;
  color: #b2bec3;
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  background: #f5f6fa;
  color: #636e72;
}

.dialog-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.msg {
  max-width: 85%;
}

.msg.sent {
  align-self: flex-end;
}

.msg.reply {
  align-self: flex-start;
}

.msg-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 4px;
}

.msg-role {
  font-size: 11px;
  font-weight: 600;
  color: #636e72;
}

.msg-time {
  font-size: 10px;
  color: #b2bec3;
}

.msg-content {
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}

.msg.sent .msg-content {
  background: #6c5ce7;
  color: #fff;
}

.msg.reply .msg-content {
  background: #f0f0f0;
  color: #2d3436;
}

.waiting {
  opacity: 0.5;
}

.dialog-footer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid #f0f0f0;
}

.footer-input-row {
  display: flex;
  gap: 8px;
}

.footer-input-row input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid #dfe6e9;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
}

.footer-input-row input:focus {
  border-color: #6c5ce7;
}

.footer-quick-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.dialog-footer--narrow .footer-quick-row {
  justify-content: flex-end;
}

@media (min-width: 481px) {
  .dialog-footer {
    flex-direction: row;
  }
  .dialog-footer .footer-input-row {
    flex: 1;
  }
  .dialog-footer--narrow .footer-input-row {
    flex: 0 0 220px;
  }
  .footer-quick-row {
    flex: 0 1 auto;
    flex-shrink: 0;
  }
}

.btn-send {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  background: #6c5ce7;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.btn-send:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-send:hover:not(:disabled) {
  background: #5a4bd1;
}

.btn-login {
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  background: #0984e3;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.btn-login:hover {
  background: #0773c5;
}

.btn-num {
  padding: 10px 14px;
  border: none;
  border-radius: 8px;
  background: #00b894;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  min-width: 36px;
}

.btn-num:hover {
  background: #00a381;
}

.btn-num--q {
  background: #6c5ce7;
}

.btn-num--q:hover {
  background: #5a4bd1;
}
</style>
