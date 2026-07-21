const API_BASE = '/data-api'

let remoteLoaded = false
let serverAvailable = true

export async function loadRemote() {
  try {
    const res = await fetch(`${API_BASE}/groups`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    serverAvailable = true
    remoteLoaded = true
    return data
  } catch (e) {
    serverAvailable = false
    console.warn('[API] 服务端不可用，回退到本地存储:', e.message)
    return null
  }
}

export function saveRemote(groups) {
  if (!serverAvailable) return
  fetch(`${API_BASE}/groups`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(groups)
  }).catch(e => {
    serverAvailable = false
    console.warn('[API] 保存到服务端失败:', e.message)
  })
}

export async function resetRemote() {
  try {
    const res = await fetch(`${API_BASE}/groups/reset`, { method: 'POST' })
    if (res.ok) {
      const groups = await loadRemote()
      return groups
    }
  } catch (e) {
    serverAvailable = false
    console.warn('[API] 重置失败:', e.message)
  }
  return null
}
