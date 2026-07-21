import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.join(__dirname, 'data.db')

const db = new Database(dbPath)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS groups_t (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups_t(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    remark TEXT DEFAULT '',
    expiry TEXT DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS custom_commands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    command TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
`)

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

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
    ]
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
    ]
  }
]

function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) as c FROM groups_t').get()
  if (count.c > 0) return

  const insertGroup = db.prepare('INSERT INTO groups_t (id, name, sort_order) VALUES (?, ?, ?)')
  const insertProject = db.prepare('INSERT INTO projects (id, group_id, name, sort_order) VALUES (?, ?, ?, ?)')

  const tx = db.transaction(() => {
    defaultGroups.forEach((g, gi) => {
      insertGroup.run(g.id, g.name, gi)
      g.projects.forEach((name, pi) => {
        insertProject.run(genId(), g.id, name, pi)
      })
    })
  })
  tx()
}

seedIfEmpty()

export function loadGroups() {
  const groups = db.prepare('SELECT * FROM groups_t ORDER BY sort_order').all()
  return groups.map(g => {
    const projects = db.prepare('SELECT * FROM projects WHERE group_id = ? ORDER BY sort_order').all(g.id)
    return {
      id: g.id,
      name: g.name,
      projects: projects.map(p => {
        const commands = db.prepare('SELECT * FROM custom_commands WHERE project_id = ? ORDER BY sort_order').all(p.id)
        return {
          id: p.id,
          name: p.name,
          remark: p.remark || '',
          expiry: p.expiry || '',
          customCommands: commands.map(c => c.command)
        }
      })
    }
  })
}

export function saveGroups(groups) {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM custom_commands').run()
    db.prepare('DELETE FROM projects').run()
    db.prepare('DELETE FROM groups_t').run()

    const insertGroup = db.prepare('INSERT INTO groups_t (id, name, sort_order) VALUES (?, ?, ?)')
    const insertProject = db.prepare('INSERT INTO projects (id, group_id, name, remark, expiry, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
    const insertCommand = db.prepare('INSERT INTO custom_commands (project_id, command, sort_order) VALUES (?, ?, ?)')

    groups.forEach((g, gi) => {
      insertGroup.run(g.id, g.name, gi)
      g.projects.forEach((p, pi) => {
        insertProject.run(p.id, g.id, p.name, p.remark || '', p.expiry || '', pi)
        if (p.customCommands && p.customCommands.length) {
          p.customCommands.forEach((cmd, ci) => {
            insertCommand.run(p.id, cmd, ci)
          })
        }
      })
    })
  })
  tx()
}

export function resetToDefault() {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM custom_commands').run()
    db.prepare('DELETE FROM projects').run()
    db.prepare('DELETE FROM groups_t').run()

    const insertGroup = db.prepare('INSERT INTO groups_t (id, name, sort_order) VALUES (?, ?, ?)')
    const insertProject = db.prepare('INSERT INTO projects (id, group_id, name, sort_order) VALUES (?, ?, ?, ?)')

    defaultGroups.forEach((g, gi) => {
      insertGroup.run(g.id, g.name, gi)
      g.projects.forEach((name, pi) => {
        insertProject.run(genId(), g.id, name, pi)
      })
    })
  })
  tx()
}
