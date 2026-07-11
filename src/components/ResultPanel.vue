<template>
  <div class="panel">
    <div class="panel-title">消息记录</div>

    <div v-if="messages.length === 0" class="empty-state">
      暂无消息记录
    </div>

    <div v-else class="msg-log" ref="logEl">
      <div v-for="(msg, i) in messages" :key="i" class="msg-entry">
        <div class="msg-meta">
          <span class="msg-time">{{ msg.time }}</span>
          <span v-if="msg.label" class="msg-label">{{ msg.label }}</span>
        </div>
        <div class="msg-body">{{ msg.text }}</div>
      </div>
    </div>

    <div v-if="running" class="progress-hint">
      正在查询中... {{ completedCount }}/{{ totalCount }}
    </div>

    <div v-if="messages.length > 0" class="actions">
      <button class="btn btn-primary" @click="$emit('clear')">清空</button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'

const props = defineProps({
  messages: { type: Array, default: () => [] },
  running: Boolean,
  completedCount: { type: Number, default: 0 },
  totalCount: { type: Number, default: 0 }
})

defineEmits(['clear'])

const logEl = ref(null)

watch(() => props.messages.length, () => {
  nextTick(() => {
    if (logEl.value) {
      logEl.value.scrollTop = logEl.value.scrollHeight
    }
  })
})
</script>

<style scoped>
.empty-state {
  text-align: center;
  padding: 32px;
  color: #b2bec3;
  font-size: 14px;
}

.msg-log {
  max-height: 500px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.msg-entry {
  padding: 8px 10px;
  background: #fafbfc;
  border-radius: 6px;
  border-left: 3px solid #6c5ce7;
}

.msg-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.msg-time {
  font-size: 11px;
  color: #b2bec3;
}

.msg-label {
  font-size: 11px;
  color: #6c5ce7;
  background: #f0ecff;
  padding: 1px 6px;
  border-radius: 3px;
  font-weight: 500;
}

.msg-body {
  font-size: 13px;
  color: #2d3436;
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.4;
}

.progress-hint {
  text-align: center;
  font-size: 13px;
  color: #6c5ce7;
  padding: 8px;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.btn {
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  font-weight: 500;
}

.btn-primary {
  background: #dfe6e9;
  color: #636e72;
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
