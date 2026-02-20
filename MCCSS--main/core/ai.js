import fetch from 'node-fetch';

const OPENAI_KEY = process.env.OPENAI_API_KEY;

export function isAvailable() {
  return !!OPENAI_KEY;
}

export async function chatReply(prompt, opts = {}) {
  if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY not set');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], max_tokens: 512 })
  });
  if (!res.ok) throw new Error(`openai: ${res.status} ${await res.text()}`);
  const j = await res.json();
  return j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '';
}

export async function generatePatchContent(prompt, filename) {
  // instruct model to output only file content
  const full = `${prompt}\n\nPlease output only the file content for ${filename} without any explanation.`;
  return chatReply(full);
}

export default { isAvailable, chatReply, generatePatchContent };
