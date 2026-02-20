// demo/cockpit.js — lightweight client that talks to readiness and tasks endpoints
(function () {
  const root = window.location.origin;
  const scoreEl = document.getElementById('score');
  const detailsEl = document.getElementById('details');
  const tasksEl = document.getElementById('tasks');
  const outcomeEl = document.getElementById('outcome');

  function setModeText() {
    const mode = navigator.onLine ? 'Online' : 'Offline';
    document.getElementById('mode').textContent = mode;
  }

  async function fetchReadiness() {
    try {
      const token = localStorage.getItem('demo_token');
      const hdr = token ? { 'Authorization': 'Bearer ' + token } : {};
      const res = await fetch(root + '/api/v1/demo/readiness', { headers: hdr });
      if (!res.ok) throw new Error('not ok');
      const body = await res.json();
      const r = body.readiness;
      scoreEl.textContent = r.score;
      scoreEl.className = r.status;
      detailsEl.textContent = JSON.stringify(r.details, null, 2);
    } catch (e) {
      // offline fallback: load synthetic dataset
      const data = await (await fetch('/cockpit/../data/synthetic_dataset.json')).json();
      scoreEl.textContent = 'DEMO';
      detailsEl.textContent = JSON.stringify({ documents: data.documents.length }, null, 2);
    }
  }

  async function fetchTasks() {
    try {
      const token = localStorage.getItem('demo_token');
      const hdr = token ? { 'Authorization': 'Bearer ' + token } : {};
      const res = await fetch(root + '/api/v1/tasks', { headers: hdr });
      if (!res.ok) throw new Error('not ok');
      const body = await res.json();
      tasksEl.textContent = JSON.stringify(body, null, 2);
    } catch (e) {
      tasksEl.textContent = 'No tasks (offline or unauthenticated)';
    }
  }

  async function loadOutcome() {
    try {
      const r = await fetch('/cockpit/../docs/outcome_expectations.md');
      const txt = await r.text();
      outcomeEl.textContent = txt;
    } catch (e) {
      outcomeEl.textContent = 'Outcome doc not available';
    }
  }

  setModeText();
  window.addEventListener('online', setModeText);
  window.addEventListener('offline', setModeText);

  fetchReadiness();
  fetchTasks();
  loadOutcome();
  setInterval(fetchReadiness, 15_000);
})();
