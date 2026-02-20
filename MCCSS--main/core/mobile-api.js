import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'node:child_process';
import ai from './ai.js';

const router = express.Router();

const AI_DIR = path.resolve(process.cwd(), '.ai_requests');

async function ensureDir() {
  try {
    await fs.mkdir(AI_DIR, { recursive: true });
  } catch (e) { /* ignore */ }
}

router.use(express.json());

// Simple chat endpoint that logs messages and returns a canned reply.
router.post('/chat', async (req, res) => {
  const { message, meta } = req.body || {};
  if (!message) return res.status(400).json({ error: 'missing message' });

  await ensureDir();
  const ts = Date.now();
  const file = path.join(AI_DIR, `chat-${ts}.json`);
  const entry = { ts, message, meta: meta || null };
  await fs.writeFile(file, JSON.stringify(entry, null, 2));

  // If AI is available and request asks for it, delegate
  if (ai.isAvailable() && /use ai|use-ai|generate patch|generate code|suggest patch/i.test(message)) {
    try {
      const aiReply = await ai.chatReply(message, { meta });
      await fs.writeFile(file.replace('chat-', 'chat-ai-'), JSON.stringify({ ts, message, meta, aiReply }, null, 2));
      return res.json({ reply: aiReply });
    } catch (e) {
      // fallback to echo
    }
  }

  // Very small local 'assistant' that echoes and suggests a filename when asked to patch.
  let reply = 'Received: ' + (message.length > 200 ? message.slice(0, 200) + '…' : message);
  if (/patch|change code|modify file/i.test(message)) {
    reply += '\nI can create a draft patch — POST to /mobile/patch with { filename, content }.';
  }

  res.json({ reply });
});

// Create a draft patch file; server writes it to .ai_requests/patch-<ts>-<filename>
router.post('/patch', async (req, res) => {
  const { filename, content, note } = req.body || {};
  if (!filename || !content) return res.status(400).json({ error: 'missing filename or content' });

  await ensureDir();
  const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
  const ts = Date.now();
  const patchPath = path.join(AI_DIR, `patch-${ts}-${safeName}.patch`);
  const meta = { ts, filename, note: note || null };
  const payload = `// meta: ${JSON.stringify(meta)}\n\n${content}`;
  await fs.writeFile(patchPath, payload);
  res.json({ ok: true, path: patchPath });
});

// Generate patch via AI (requires OPENAI_API_KEY), writes patch file and returns path
router.post('/ai-patch', async (req, res) => {
  const { prompt, filename, note } = req.body || {};
  if (!prompt || !filename) return res.status(400).json({ error: 'missing prompt or filename' });
  if (!ai.isAvailable()) return res.status(501).json({ error: 'AI not configured' });

  await ensureDir();
  try {
    const content = await ai.generatePatchContent(prompt, filename);
    const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    const ts = Date.now();
    const patchPath = path.join(AI_DIR, `patch-${ts}-${safeName}.patch`);
    const meta = { ts, filename, note: note || null, via: 'ai' };
    const payload = `// meta: ${JSON.stringify(meta)}\n\n${content}`;
    await fs.writeFile(patchPath, payload);
    return res.json({ ok: true, path: patchPath, contentPreview: content.slice(0, 400) });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

// List draft requests
router.get('/requests', async (req, res) => {
  await ensureDir();
  const files = await fs.readdir(AI_DIR);
  res.json({ files });
});

// Download a request
router.get('/requests/:file', async (req, res) => {
  const file = req.params.file;
  const full = path.join(AI_DIR, file);
  try {
    const stat = await fs.stat(full);
    if (!stat.isFile()) throw new Error('not a file');
    const content = await fs.readFile(full, 'utf8');
    res.type('text/plain').send(content);
  } catch (e) {
    res.status(404).json({ error: 'not found' });
  }
});

// Queue an action (non-executing by default) — writes to actions.log
router.post('/action', async (req, res) => {
  const { action, args } = req.body || {};
  if (!action) return res.status(400).json({ error: 'missing action' });
  await ensureDir();
  const log = path.join(AI_DIR, 'actions.log');
  const entry = { ts: Date.now(), action, args: args || null };
  await fs.appendFile(log, JSON.stringify(entry) + '\n');
  res.json({ ok: true, queued: entry });
});

// Apply a saved patch or apply supplied content to a target file.
// Guarded: allowed when process.env.ALLOW_APPLY==='1' OR X-Apply-Secret header matches APPLY_SECRET
router.post('/apply', async (req, res) => {
  const { patchFile, filename, content } = req.body || {};
  const applySecret = process.env.APPLY_SECRET;
  const providedSecret = req.get('X-Apply-Secret');

  if (!(process.env.ALLOW_APPLY === '1' || (applySecret && providedSecret === applySecret))) {
    return res.status(403).json({ error: 'apply not allowed' });
  }

  let targetFile;
  let fileContent;

  if (patchFile) {
    const full = path.join(AI_DIR, path.basename(patchFile));
    try {
      const raw = await fs.readFile(full, 'utf8');
      // strip meta header
      const parts = raw.split(/\n\n/);
      const metaLine = parts[0] || '';
      const rest = parts.slice(1).join('\n\n');
      // try parse meta
      let meta = {};
      try { meta = JSON.parse(metaLine.replace(/^\/\/ meta:\s*/, '')); } catch (e) { /* ignore */ }
      if (!meta.filename) return res.status(400).json({ error: 'patch meta missing filename' });
      targetFile = meta.filename;
      fileContent = rest;
    } catch (e) {
      return res.status(404).json({ error: 'patch not found', details: String(e) });
    }
  } else if (filename && content) {
    targetFile = filename;
    fileContent = content;
  } else {
    return res.status(400).json({ error: 'missing patchFile or filename+content' });
  }

  // sanitize: no path traversal, only relative
  if (targetFile.includes('..') || path.isAbsolute(targetFile)) {
    return res.status(400).json({ error: 'invalid filename' });
  }

  const dest = path.resolve(process.cwd(), targetFile);
  try {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, fileContent, 'utf8');
  } catch (e) {
    return res.status(500).json({ error: 'failed to write file', details: String(e) });
  }

  // Optionally commit if env var set
  if (process.env.GIT_APPLY_COMMIT === '1') {
    try {
      await new Promise((resolve, reject) => {
        execFile('git', ['add', targetFile], { cwd: process.cwd() }, (err) => err ? reject(err) : resolve());
      });
      await new Promise((resolve, reject) => {
        execFile('git', ['commit', '-m', `Apply AI patch to ${targetFile}`], { cwd: process.cwd() }, (err) => err ? reject(err) : resolve());
      });
    } catch (e) {
      // best-effort: continue
    }
  }

  res.json({ ok: true, appliedTo: targetFile });
});

export default router;
