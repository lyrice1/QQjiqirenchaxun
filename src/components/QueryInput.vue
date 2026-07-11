<template>
  <div class="panel">
    <div class="panel-title">查询指令</div>
    <textarea
      v-model="input"
      :disabled="disabled || running"
      rows="10"
      placeholder="每行一条查询指令，例如：&#10;查询 张三 的成绩&#10;查询 李四 的成绩&#10;查询 王五 的成绩"
    ></textarea>
    <div class="actions">
      <span style="flex:1;font-size:12px;color:#b2bec3;line-height:36px;">
        {{ running ? `正在执行第 ${currentIndex}/${total} 条...` : `${lineCount} 条指令` }}
      </span>
      <button
        class="btn btn-outline"
        :disabled="disabled || running"
        @click="input = ''"
      >
        清空
      </button>
      <button
        v-if="!running"
        class="btn btn-primary"
        :disabled="disabled || !input.trim()"
        @click="$emit('start', lines)"
      >
        发送
      </button>
      <button
        v-else
        class="btn btn-danger"
        @click="$emit('stop')"
      >
        停止
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue'

const props = defineProps({
  disabled: Boolean,
  running: Boolean,
  currentIndex: { type: Number, default: 0 },
  total: { type: Number, default: 0 }
})

defineEmits(['start', 'stop'])

const input = ref('')

const lines = computed(() =>
  input.value.split('\n').filter(l => l.trim())
)

const lineCount = computed(() => lines.value.length)

watch(() => props.running, (val) => {
  if (val) input.value = ''
})
</script>
