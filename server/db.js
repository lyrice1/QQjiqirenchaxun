import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = process.env.DATA_DIR || __dirname
const dataPath = path.join(dataDir, 'data.json')

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

function readData() {
  try {
    const raw = fs.readFileSync(dataPath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function writeData(data) {
  const dir = path.dirname(dataPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf-8')
}

let cachedGroups = null

function ensureInit() {
  if (cachedGroups) return
  const saved = readData()
  if (saved && Array.isArray(saved) && saved.length > 0) {
    cachedGroups = saved
  } else {
    cachedGroups = JSON.parse(JSON.stringify(defaultGroups))
    writeData(cachedGroups)
  }
}

export function loadGroups() {
  ensureInit()
  cachedGroups = readData() || cachedGroups
  return JSON.parse(JSON.stringify(cachedGroups))
}

export function saveGroups(groups) {
  cachedGroups = JSON.parse(JSON.stringify(groups))
  writeData(cachedGroups)
}

export function resetToDefault() {
  cachedGroups = JSON.parse(JSON.stringify(defaultGroups))
  writeData(cachedGroups)
}
