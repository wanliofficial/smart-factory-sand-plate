// CDP Runtime.evaluate helper: node cdp-eval.mjs '<expr>'
const PORT = 9223;
const expr = process.argv[2];
const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
const targets = await res.json();
const page = targets.find(t => t.type === 'page');
if (!page) { console.log('no page target'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }));
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id === 1) {
    if (msg.result?.exceptionDetails) console.log('EXC:', JSON.stringify(msg.result.exceptionDetails).slice(0, 500));
    else console.log('RESULT:', JSON.stringify(msg.result?.result?.value));
    process.exit(0);
  }
};
