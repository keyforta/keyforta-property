export function appendRow(key, value) {
  const rows = JSON.parse(localStorage.getItem(key) || '[]');
  rows.push({ ...value, createdAt: new Date().toISOString() });
  localStorage.setItem(key, JSON.stringify(rows));
}

export function setValue(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getRows(key) {
  return JSON.parse(localStorage.getItem(key) || '[]');
}
