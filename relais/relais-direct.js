#!/usr/bin/env node
/*
 * Relais « Direct » de la Régie JT — Collège du Sacré-Cœur
 *
 * Un navigateur ne sait pas envoyer une vidéo en RTMP (le format qu'attendent
 * Facebook, Instagram, LinkedIn ou YouTube). Ce petit programme fait le pont :
 *   régie (Chrome) --WebSocket--> relais --ffmpeg--> RTMP(S) des réseaux sociaux
 *
 * Il sert aussi la régie à l'adresse http://localhost:8686 (même origine,
 * caméra autorisée). Il n'écoute que sur cet ordinateur (127.0.0.1).
 * Aucune dépendance : Node.js 18+ et ffmpeg (dans ce dossier ou installé).
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const PORT = Number(process.env.PORT) || 8686;
const HOST = '127.0.0.1';
const DIR = __dirname;
const PAGE = ['regie-jt-sacre-coeur.html', 'index.html', '../index.html'].map(f => path.join(DIR, f)).find(f => fs.existsSync(f));

/* ---------- ffmpeg ---------- */
function findFfmpeg() {
  const cands = [process.env.FFMPEG, path.join(DIR, 'ffmpeg'), path.join(DIR, 'ffmpeg.exe'), 'ffmpeg',
    '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'].filter(Boolean);
  for (const c of cands) {
    try { const r = spawnSync(c, ['-version'], { encoding: 'utf8' }); if (r.status === 0) return { bin: c, version: (r.stdout.split('\n')[0] || '').trim() }; } catch (e) {}
  }
  return null;
}
const FF = findFfmpeg();

/* ---------- WebSocket minimal (RFC 6455) ---------- */
function wsAccept(req, socket) {
  const key = req.headers['sec-websocket-key'];
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket.setNoDelay(true);
  const ws = { socket, open: true, onmessage: null, onclose: null };
  let buf = Buffer.alloc(0), frag = [], fragOp = 0;
  ws.send = (obj) => {
    if (!ws.open) return;
    const data = Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj));
    let head;
    if (data.length < 126) head = Buffer.from([0x81, data.length]);
    else if (data.length < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 126; head.writeUInt16BE(data.length, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 127; head.writeBigUInt64BE(BigInt(data.length), 2); }
    try { socket.write(Buffer.concat([head, data])); } catch (e) {}
  };
  ws.close = () => { if (!ws.open) return; ws.open = false; try { socket.write(Buffer.from([0x88, 0])); socket.end(); } catch (e) {} if (ws.onclose) ws.onclose(); };
  socket.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const fin = (buf[0] & 0x80) !== 0, op = buf[0] & 0x0f, masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (len > 64 * 1024 * 1024) { ws.close(); return; }
      const maskOff = off; if (masked) off += 4;
      if (buf.length < off + len) return;
      let payload = buf.subarray(off, off + len);
      if (masked) { const m = buf.subarray(maskOff, maskOff + 4); payload = Buffer.from(payload); for (let i = 0; i < payload.length; i++) payload[i] ^= m[i & 3]; }
      buf = buf.subarray(off + len);
      if (op === 8) { ws.close(); return; }
      if (op === 9) { try { socket.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload])); } catch (e) {} continue; }
      if (op === 10) continue;
      if (op === 0) frag.push(payload); else { fragOp = op; frag = [payload]; }
      if (fin) { const msg = Buffer.concat(frag); frag = []; if (ws.onmessage) ws.onmessage(fragOp === 1 ? msg.toString('utf8') : msg, fragOp === 1); }
    }
  });
  socket.on('close', () => { if (ws.open) { ws.open = false; if (ws.onclose) ws.onclose(); } });
  socket.on('error', () => {});
  return ws;
}

/* ---------- construction des commandes ffmpeg ---------- */
const ENC_V = ['-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-profile:v', 'main',
  '-b:v', '3500k', '-maxrate', '3500k', '-bufsize', '7000k', '-g', '60', '-keyint_min', '60', '-sc_threshold', '0'];
const ENC_A = ['-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2'];
const IN = ['-hide_banner', '-loglevel', 'error', '-stats', '-fflags', '+genpts', '-thread_queue_size', '1024', '-i', 'pipe:0'];

function cleanUrl(d) {
  const server = String(d.url || '').trim(), key = String(d.key || '').trim();
  const full = key ? server.replace(/\/+$/, '') + '/' + key.replace(/^\/+/, '') : server;
  if (!/^rtmps?:\/\/[^\s|\[\]]+$/i.test(full) || full.length > 2048) throw new Error(`Adresse invalide pour ${d.name || 'une destination'}`);
  return full;
}
function buildJobs(dests) {
  const land = dests.filter(d => !d.vertical), vert = dests.filter(d => d.vertical);
  const jobs = [];
  if (land.length) {
    const vf = 'fps=30,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p';
    const args = [...IN, '-map', '0:v:0', '-map', '0:a:0?', '-vf', vf, ...ENC_V, ...ENC_A];
    if (land.length === 1) args.push('-f', 'flv', cleanUrl(land[0]));
    else args.push('-flags', '+global_header', '-f', 'tee', land.map(d => '[f=flv:onfail=ignore]' + cleanUrl(d)).join('|'));
    jobs.push({ label: land.map(d => d.name).join(' + '), args });
  }
  for (const d of vert) {
    const vf = 'fps=30,crop=ih*9/16:ih,scale=720:1280,setsar=1,format=yuv420p';
    jobs.push({ label: d.name + ' (vertical)', args: [...IN, '-map', '0:v:0', '-map', '0:a:0?', '-vf', vf, ...ENC_V.map(x => x === '3500k' ? '3000k' : x === '7000k' ? '6000k' : x), ...ENC_A, '-f', 'flv', cleanUrl(d)] });
  }
  return jobs;
}
const hideKeys = (s, dests) => dests.reduce((t, d) => d.key ? t.split(String(d.key)).join('••••') : t, s);

/* ---------- une session de direct ---------- */
function startSession(ws) {
  let procs = [], dests = [], started = false, closed = false;
  const stopAll = () => {
    for (const p of procs) { try { p.stdin.end(); } catch (e) {} setTimeout(() => { try { p.kill('SIGKILL'); } catch (e) {} }, 4000); }
  };
  ws.onclose = () => { closed = true; stopAll(); console.log('[direct] fin de la diffusion'); };
  ws.onmessage = (msg, isText) => {
    if (isText) {
      let m; try { m = JSON.parse(msg); } catch (e) { return; }
      if (m.type === 'start' && !started) {
        started = true;
        if (!FF) { ws.send({ type: 'error', message: "ffmpeg est introuvable sur cet ordinateur : placez le fichier « ffmpeg » dans le dossier du relais." }); ws.close(); return; }
        dests = (Array.isArray(m.destinations) ? m.destinations : []).slice(0, 6);
        let jobs;
        try { jobs = buildJobs(dests); } catch (e) { ws.send({ type: 'error', message: e.message }); ws.close(); return; }
        if (!jobs.length) { ws.send({ type: 'error', message: 'Aucune destination.' }); ws.close(); return; }
        procs = jobs.map((job, i) => {
          const p = spawn(FF.bin, job.args, { stdio: ['pipe', 'ignore', 'pipe'] });
          p.stdin.on('error', () => {});
          let errBuf = '';
          p.stderr.on('data', d => {
            errBuf += d.toString();
            const parts = errBuf.split(/[\r\n]/); errBuf = parts.pop();
            for (const line of parts) {
              if (!line.trim()) continue;
              const st = line.match(/frame=\s*(\d+).*?fps=\s*([\d.]+).*?time=\s*([\d:.]+).*?bitrate=\s*([\d.]+\w+\/s|N\/A).*?speed=\s*([\d.]+x|N\/A)/);
              if (st) ws.send({ type: 'stats', job: i, label: job.label, frame: +st[1], fps: +st[2], time: st[3], bitrate: st[4], speed: st[5] });
              else { const safe = hideKeys(line, dests).slice(0, 300); console.log('[ffmpeg]', job.label, safe); ws.send({ type: 'log', job: i, label: job.label, line: safe }); }
            }
          });
          p.on('exit', code => { if (!closed) ws.send({ type: 'exit', job: i, label: job.label, code }); });
          p.on('error', e => ws.send({ type: 'error', message: 'ffmpeg : ' + e.message }));
          return p;
        });
        console.log('[direct] diffusion vers : ' + jobs.map(j => j.label).join(' | '));
        ws.send({ type: 'ready', jobs: jobs.map(j => j.label) });
      } else if (m.type === 'stop') { ws.close(); }
      return;
    }
    for (const p of procs) if (p.exitCode === null && p.stdin.writable) p.stdin.write(msg);
  };
}

/* ---------- serveur ---------- */
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: true, ffmpeg: FF ? FF.version : null, page: !!PAGE }));
    return;
  }
  if (url === '/' || url === '/index.html' || url === '/regie-jt-sacre-coeur.html') {
    if (!PAGE) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Placez regie-jt-sacre-coeur.html dans le dossier du relais.'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    fs.createReadStream(PAGE).pipe(res);
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Introuvable');
});
server.on('upgrade', (req, socket) => {
  const origin = req.headers.origin || '';
  const okOrigin = origin === `http://localhost:${PORT}` || origin === `http://127.0.0.1:${PORT}`;
  if (req.url.split('?')[0] !== '/live' || !okOrigin || !req.headers['sec-websocket-key']) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; }
  startSession(wsAccept(req, socket));
});
server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  Relais Direct de la Régie JT');
  console.log('  -----------------------------');
  console.log('  Régie : http://localhost:' + PORT + '   (à ouvrir dans Google Chrome)');
  console.log('  ffmpeg : ' + (FF ? FF.version : 'INTROUVABLE — placez le fichier « ffmpeg » dans ce dossier'));
  console.log('  Laissez cette fenêtre ouverte pendant le direct. Ctrl+C pour arrêter.');
  console.log('');
});
server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? `Le port ${PORT} est déjà utilisé : le relais tourne peut-être déjà.` : e.message); process.exit(1); });
