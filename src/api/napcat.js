let baseUrl = ''
let token = ''

export function setBaseUrl(url) {
  baseUrl = url.replace(/\/+$/, '')
}

export function setToken(t) {
  token = t
}

async function request(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  }
  const res = await fetch(`${baseUrl}${path}`, { headers, ...options })
  return res.json()
}

export function sendPrivateMessage(userId, message) {
  return request('/send_private_msg', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      message
    })
  })
}

export function sendGroupMessage(groupId, message) {
  return request('/send_group_msg', {
    method: 'POST',
    body: JSON.stringify({
      group_id: groupId,
      message
    })
  })
}

export function getLoginInfo() {
  return request('/get_login_info')
}

export function checkConnection() {
  return getLoginInfo().then(() => true).catch(() => false)
}

export function getFriendMsgHistory(userId, count = 20) {
  return request('/get_friend_msg_history', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, count })
  })
}
