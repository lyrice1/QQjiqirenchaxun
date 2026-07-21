import { loadRemote, saveRemote, resetRemote } from './api.js'

const defaultGroups = [
  {
    id: 'g1',
    name: '免费项目',
    projects: [
      '实用小工具', '京东', '夸克搜资源', '达能益生', '趣网', '品赞',
      '三网流量卡', '沪上阿姨', '蜜雪', '丫丫兔', '朴朴超市', '游侠网',
      '回收猿', '同程', '泰康', '仰韶', '永辉生活', '小蚕', '牛游谷',
      '民发广场', '裕丰广场', '佑三', '伊的家', '浓五酒馆', '绿动新球',
      '鼎鸿保龄球', '回收蛙', '薇诺娜', '豪爵', '移动云盘', '绿地',
      'Epic游戏', '中康未来'
    ].map(name => ({ id: genId(), name, customCommands: [], remark: '' }))
  },
  {
    id: 'g2',
    name: '付费项目',
    projects: [
      '星芽短剧', '看余杭', '农夫山泉', '粉象生活', '电信', 'Wx清粉',
      '云任务签到', '爱路桥', '地图', '早纤生活', '众安', '福田',
      '驴充充', '酒仙', '雨云', '联通云盘', '雀巢', '店铛铛',
      '森选', '伟星', '星韵', '和合', '白鲸', '牛牛短剧',
      '中华保', '速看小说', '老有工社', '星妈会', '顾家家居', '牛卡福货主',
      '战马能量', '爱仙居', '小米运动', '顺丰', '飞鹤', '望潮',
      '乐仔生活', '慧生活', '太平洋', '衣城通', '依立腾', '台铃',
      '壹品仓', '四个朋友', 'OPPO商城', '铛铛一下', '潇洒', '中视频',
      '小牛牛', '爱海盐', '江淮卡友', '杜蕾斯', 'keep运动', '酷我',
      '甬派', '白鲸鱼', '天牛回收', '旧衣小二', '科普', '嘉善',
      '芳华未来', '爱坤', '捷停车', '酷我提现'
    ].map(name => ({ id: genId(), name, customCommands: [], remark: '' }))
  }
]

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

async function loadGroups() {
  const remoteData = await loadRemote()
  if (remoteData) return remoteData

  try {
    const saved = localStorage.getItem('qq-bot-project-groups')
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch (e) { /* ignore */ }
  try {
    const backup = localStorage.getItem('qq-bot-project-groups-backup')
    if (backup) {
      const parsed = JSON.parse(backup)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch (e) { /* ignore */ }
  return JSON.parse(JSON.stringify(defaultGroups))
}

let _groups = JSON.parse(JSON.stringify(defaultGroups))
let _readyPromise = null

export function initGroups() {
  if (!_readyPromise) {
    _readyPromise = loadGroups().then(data => {
      _groups = data
      return _groups
    })
  }
  return _readyPromise
}

function ensureFields(project) {
  if (!project.customCommands) project.customCommands = []
  if (project.remark == null) project.remark = ''
  if (project.expiry == null) project.expiry = ''
}

export function getGroups() {
  return _groups.map(g => ({
    ...g,
    projects: g.projects.map(p => {
      ensureFields(p)
      return p
    })
  }))
}

export function saveGroups() {
  const json = JSON.stringify(_groups)
  localStorage.setItem('qq-bot-project-groups', json)
  localStorage.setItem('qq-bot-project-groups-backup', json)
  saveRemote(_groups)
}

export function addGroup(name) {
  _groups.push({ id: 'g' + Date.now(), name, projects: [] })
  saveGroups()
}

export function deleteGroup(groupId) {
  _groups = _groups.filter(g => g.id !== groupId)
  saveGroups()
}

export function reorderGroup(groupId, direction) {
  const idx = _groups.findIndex(g => g.id === groupId)
  if (idx === -1) return
  if (direction === 'up' && idx > 0) {
    [_groups[idx - 1], _groups[idx]] = [_groups[idx], _groups[idx - 1]]
    saveGroups()
  } else if (direction === 'down' && idx < _groups.length - 1) {
    [_groups[idx], _groups[idx + 1]] = [_groups[idx + 1], _groups[idx]]
    saveGroups()
  }
}

export function renameGroup(groupId, newName) {
  const g = _groups.find(g => g.id === groupId)
  if (g) { g.name = newName; saveGroups() }
}

export function addProject(groupId, p) {
  const g = _groups.find(g => g.id === groupId)
  if (g) {
    g.projects.push({
      id: genId(),
      name: p.name,
      customCommands: [],
      remark: ''
    })
    saveGroups()
  }
}

export function deleteProject(groupId, pid) {
  const g = _groups.find(g => g.id === groupId)
  if (g) {
    g.projects = g.projects.filter(p => p.id !== pid)
    saveGroups()
  }
}

export function moveProject(fromGroupId, toGroupId, pid) {
  const fromGroup = _groups.find(g => g.id === fromGroupId)
  const toGroup = _groups.find(g => g.id === toGroupId)
  if (!fromGroup || !toGroup || fromGroupId === toGroupId) return false
  const idx = fromGroup.projects.findIndex(p => p.id === pid)
  if (idx === -1) return false
  const [project] = fromGroup.projects.splice(idx, 1)
  toGroup.projects.push(project)
  saveGroups()
  return true
}

export function reorderProject(groupId, pid, direction) {
  const g = _groups.find(g => g.id === groupId)
  if (!g) return
  const idx = g.projects.findIndex(p => p.id === pid)
  if (idx === -1) return
  if (direction === 'up' && idx > 0) {
    [g.projects[idx - 1], g.projects[idx]] = [g.projects[idx], g.projects[idx - 1]]
    saveGroups()
  } else if (direction === 'down' && idx < g.projects.length - 1) {
    [g.projects[idx], g.projects[idx + 1]] = [g.projects[idx + 1], g.projects[idx]]
    saveGroups()
  }
}

export function addCustomCommand(groupId, pid, cmd) {
  const g = _groups.find(g => g.id === groupId)
  if (!g) return
  const p = g.projects.find(p => p.id === pid)
  if (!p) return
  ensureFields(p)
  p.customCommands.push(cmd.trim())
  saveGroups()
}

export function removeCustomCommand(groupId, pid, idx) {
  const g = _groups.find(g => g.id === groupId)
  if (!g) return
  const p = g.projects.find(p => p.id === pid)
  if (!p) return
  ensureFields(p)
  p.customCommands.splice(idx, 1)
  saveGroups()
}

export function updateProjectRemark(groupId, pid, remark) {
  const g = _groups.find(g => g.id === groupId)
  if (!g) return
  const p = g.projects.find(p => p.id === pid)
  if (!p) return
  ensureFields(p)
  p.remark = remark
  saveGroups()
}

export function updateProjectExpiry(groupId, pid, expiry) {
  const g = _groups.find(g => g.id === groupId)
  if (!g) return
  const p = g.projects.find(p => p.id === pid)
  if (!p) return
  ensureFields(p)
  if (!expiry) return
  p.expiry = expiry
  saveGroups()
}

export function updateProjectExpiryById(pid, expiry) {
  for (const g of _groups) {
    const p = g.projects.find(p => p.id === pid)
    if (p) {
      ensureFields(p)
      if (!expiry) return
      p.expiry = expiry
      saveGroups()
      return
    }
  }
}

function parseEarliestExpiryTs(expiryStr) {
  if (!expiryStr) return Infinity
  const re = /(\d{4}\.\d{2}\.\d{2})/g
  let m
  let earliest = Infinity
  while ((m = re.exec(expiryStr)) !== null) {
    const d = new Date(m[1].replace(/\./g, '-'))
    if (isNaN(d.getTime())) continue
    const ts = d.getTime()
    if (ts < earliest) earliest = ts
  }
  return earliest
}

export function sortProjectsByExpiry(groupId) {
  const g = _groups.find(g => g.id === groupId)
  if (!g) return
  g.projects.sort((a, b) => {
    return parseEarliestExpiryTs(a.expiry) - parseEarliestExpiryTs(b.expiry)
  })
  saveGroups()
}

export function findProjectIdByName(name) {
  const lower = name.toLowerCase()
  for (const g of _groups) {
    for (const p of g.projects) {
      if (p.name.toLowerCase() === lower) return p.id
    }
  }
  for (const g of _groups) {
    for (const p of g.projects) {
      if (name.includes(p.name)) return p.id
    }
  }
  for (const g of _groups) {
    for (const p of g.projects) {
      if (p.name.includes(name)) return p.id
    }
  }
  return null
}

export async function resetToDefault() {
  localStorage.removeItem('qq-bot-project-groups')
  const remoteGroups = await resetRemote()
  if (remoteGroups) {
    _groups = remoteGroups
  } else {
    _groups = JSON.parse(JSON.stringify(defaultGroups))
    saveGroups()
  }
}

export function restoreGroups(snapshot) {
  _groups = JSON.parse(JSON.stringify(snapshot))
  saveGroups()
}
