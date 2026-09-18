// CDP screenshot helper: load page in a live headless Chrome tab,
// wait real seconds for frames to render, then capture.
const PORT = 9223;
const url = process.argv[2] || 'http://127.0.0.1:5188/';
const out = process.argv[3] || '/tmp/world-shots/cdp.png';
const waitMs = Number(process.argv[4] || 12000);

const listUrl = `http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`;
const res = await fetch(listUrl, { method: 'PUT' });
const target = await res.json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });

let id = 0;
const pending = new Map();
const consoleMsgs = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  if (msg.method === 'Runtime.consoleAPICalled') {
    consoleMsgs.push((msg.params.args || []).map(a => a.value ?? a.description ?? '').join(' '));
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    consoleMsgs.push('EXCEPTION: ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
  }
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

await send('Runtime.enable');
await send('Page.enable');
await new Promise(r => setTimeout(r, waitMs));
const shot = await send('Page.captureScreenshot', { format: 'png' });
const fs = await import('fs');
fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log('saved', out);
console.log('--- console (' + consoleMsgs.length + ') ---');
for (const m of consoleMsgs.slice(0, 30)) console.log(m.split('\n').slice(0, 6).join(' | '));
ws.close();
process.exit(0);
