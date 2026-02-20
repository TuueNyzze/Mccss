import fs from 'fs';
import path from 'path';

// Seed the synthetic dataset into a JSON-backed store for the server.
const dataPath = path.resolve(new URL(import.meta.url).pathname, '../data/synthetic_dataset.json');
const outPath = path.resolve(process.cwd(), 'Edenfield-main', 'data', 'store_documents.json');

async function run() {
  try {
    const raw = await fs.promises.readFile(dataPath, 'utf8');
    const parsed = JSON.parse(raw);
    await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
    await fs.promises.writeFile(outPath, JSON.stringify(parsed, null, 2), 'utf8');
    console.log('Seeded synthetic dataset to', outPath);
  } catch (e) {
    console.error('Seeding failed', e);
    process.exit(1);
  }
}

run();
