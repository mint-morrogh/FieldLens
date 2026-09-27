// Uploads hf-space/ to the FieldLens BioCLIP Hugging Face Space.
// Usage: npm run space:deploy   (reads HF_DEPLOY_TOKEN / HF_SPACE_REPO from .env.local or the environment)
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { uploadFiles } from '@huggingface/hub';

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
loadEnvFile('.env.local');

const token = process.env.HF_DEPLOY_TOKEN;
const repo = process.env.HF_SPACE_REPO || 'mintmundane/fieldlens-bioclip';
if (!token) {
  console.error('Set HF_DEPLOY_TOKEN (a Hugging Face WRITE token) in .env.local first.');
  process.exit(1);
}

const dir = 'hf-space';
const files = readdirSync(dir)
  .filter((f) => !f.startsWith('.') && f !== '__pycache__')
  .map((f) => ({ path: f, content: new Blob([readFileSync(join(dir, f))]) }));

await uploadFiles({
  repo: { type: 'space', name: repo },
  accessToken: token,
  files,
  commitTitle: 'Deploy from FieldLens repo',
});
console.log(
  `Uploaded ${files.map((f) => f.path).join(', ')} to spaces/${repo}. The Space will rebuild.`,
);
