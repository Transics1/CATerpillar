const TOKEN_KEY = 'cat.token'
const OPERATOR_KEY = 'cat.operator'

export const getToken = () => localStorage.getItem(TOKEN_KEY)

export function getOperator() {
  try {
    return JSON.parse(localStorage.getItem(OPERATOR_KEY) || 'null')
  } catch {
    return null
  }
}

export function setSession(token, operator) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(OPERATOR_KEY, JSON.stringify(operator))
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(OPERATOR_KEY)
}

async function request(path, options = {}) {
  const token = getToken()
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `${res.status} ${res.statusText}`)
  }
  return res.json()
}

export const api = {
  directory: () => request('/auth/directory'),
  login: (operatorId, pin) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ operatorId, pin }) }),
  todaysTasks: () => request('/tasks/today'),
  startTask: (taskId) => request(`/tasks/${taskId}/start`, { method: 'POST' })
}
