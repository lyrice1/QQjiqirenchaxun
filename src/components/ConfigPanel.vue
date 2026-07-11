<template>
  <div class="panel">
    <div class="panel-title">连接配置</div>
    <div class="form-row">
      <div class="form-group" style="flex: 1; min-width: 220px;">
        <label>NapCat API 地址</label>
        <input
          :value="config.apiUrl"
          @input="$emit('update:config', { ...config, apiUrl: $event.target.value })"
          placeholder="http://127.0.0.1:3100"
        />
      </div>
      <div class="form-group" style="flex: 1; min-width: 180px;">
        <label>API Token</label>
        <input
          :value="config.token"
          @input="$emit('update:config', { ...config, token: $event.target.value })"
          placeholder="WebUI 网络配置中的 Access Token"
        />
      </div>
      <div class="form-group" style="width: 120px;">
        <label>连接状态</label>
        <div class="connection-status" style="padding-top: 8px;">
          <span :class="['status-dot', connected ? 'online' : connecting ? 'connecting' : 'offline']"></span>
          <span>{{ connected ? '已连接' : connecting ? '连接中...' : '未连接' }}</span>
        </div>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group" style="width: 160px;">
        <label>目标 QQ 号</label>
        <input
          :value="config.targetId"
          @input="$emit('update:config', { ...config, targetId: $event.target.value })"
          placeholder="机器人 QQ 号"
        />
      </div>
      <div class="form-group" style="width: 120px;">
        <label>聊天类型</label>
        <select
          :value="config.chatType"
          @change="$emit('update:config', { ...config, chatType: $event.target.value })"
        >
          <option value="private">私聊/好友</option>
          <option value="group">群聊</option>
        </select>
      </div>
      <div class="form-group" style="width: 120px;">
        <label>间隔 (ms)</label>
        <input
          type="number"
          :value="config.interval"
          @input="$emit('update:config', { ...config, interval: Number($event.target.value) })"
          min="500"
          max="10000"
          step="100"
        />
      </div>
    </div>
    <div class="actions" style="margin-top: 0;">
      <button
        v-if="!connected"
        class="btn btn-primary"
        :disabled="connecting"
        @click="$emit('connect')"
      >
        {{ connecting ? '连接中...' : '连接 NapCat' }}
      </button>
      <button
        v-else
        class="btn btn-danger"
        @click="$emit('disconnect')"
      >
        断开连接
      </button>
    </div>
  </div>
</template>

<script setup>
defineProps({
  config: Object,
  connected: Boolean,
  connecting: Boolean
})

defineEmits(['update:config', 'connect', 'disconnect'])
</script>

<style scoped></style>
