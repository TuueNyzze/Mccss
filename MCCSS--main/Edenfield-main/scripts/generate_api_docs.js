import fs from 'fs';
import path from 'path';

// Very small OpenAPI -> Markdown generator for README consumption.
const inPath = path.resolve(process.cwd(), 'docs', 'openapi.yaml');
const outPath = path.resolve(process.cwd(), 'docs', 'API.md');

async function run() {
  try {
    const raw = await fs.promises.readFile(inPath, 'utf8');
    // crude split by path entries
    const lines = raw.split('\n');
    const paths = [];
    let current = null;
    for (const l of lines) {
      const m = l.match(/^\s{2}([\/]\S+):$/);
      if (m) { current = { path: m[1], methods: [] }; paths.push(current); continue; }
      const mm = l.match(/^\s{4}([a-z]+):/);
      if (mm && current) { current.methods.push(mm[1].toUpperCase()); }
    }

    const md = ['# API Contract', ''];
    for (const p of paths) {
      md.push(`## ${p.path}`);
      md.push(`Methods: ${p.methods.join(', ')}`);
      md.push('');
    }

    await fs.promises.writeFile(outPath, md.join('\n'), 'utf8');
    console.log('Generated', outPath);
  } catch (e) {
    console.error('generate_api_docs failed', e);
    process.exit(1);
  }
}

run();
