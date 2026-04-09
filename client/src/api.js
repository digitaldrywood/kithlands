const BASE_URL = '/api';

export async function healthCheck() {
  const res = await fetch(`${BASE_URL}/health`);
  return res.json();
}
