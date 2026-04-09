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

async function apiCall(method, path, body) {
  const url = `${BASE_URL}${path}`;
  console.log(`[API] ${method} ${path}`, body || '');

  const opts = { method, headers: headers() };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const data = await res.json();

  if (data.error) {
    console.error(`[API] ${path} error:`, data.error);
  } else {
    console.log(`[API] ${path} ok`, data.phase || '');
  }

  return data;
}

export async function login(email) {
  return apiCall('POST', '/auth/login', { email });
}

export async function getClasses() {
  return apiCall('GET', '/data/classes');
}

export async function newGame(data) {
  return apiCall('POST', '/game/new', data);
}

export async function getGame(id) {
  return apiCall('GET', `/game/${id}`);
}

export async function gameAction(gameId, action) {
  return apiCall('POST', `/game/${gameId}/action`, action);
}

export async function healthCheck() {
  return apiCall('GET', '/health');
}
