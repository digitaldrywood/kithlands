const BASE_URL = '/api';

let authToken = null;

export function setToken(token) {
  authToken = token;
}

function headers() {
  const h = { 'Content-Type': 'application/json' };
  if (authToken) h['Authorization'] = `Bearer ${authToken}`;
  return h;
}

export async function login(email) {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ email }),
  });
  return res.json();
}

export async function getClasses() {
  const res = await fetch(`${BASE_URL}/data/classes`);
  return res.json();
}

export async function newGame(data) {
  const res = await fetch(`${BASE_URL}/game/new`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function getGame(id) {
  const res = await fetch(`${BASE_URL}/game/${id}`, { headers: headers() });
  return res.json();
}

export async function gameAction(gameId, action) {
  const res = await fetch(`${BASE_URL}/game/${gameId}/action`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(action),
  });
  return res.json();
}

export async function healthCheck() {
  const res = await fetch(`${BASE_URL}/health`);
  return res.json();
}
