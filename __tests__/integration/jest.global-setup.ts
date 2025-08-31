import { spawn, spawnSync } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const TMP_DIR = path.join(process.cwd(), '.jest-integration');
const PID_FILE = path.join(TMP_DIR, 'server.pid');
const PORT = process.env.PORT || '4000';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

async function waitForServer(url: string, attempts = 60, intervalMs = 1000) {
  for (let i = 0; i < attempts; i++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const req = http.get(url, res => {
          res.resume();
          if (res.statusCode && res.statusCode < 500) resolve();
          else reject(new Error(`Status ${res.statusCode}`));
        });
        req.on('error', reject);
      });
      return true;
    } catch (_) {
      await new Promise(r => setTimeout(r, intervalMs));
    }
  }
  return false;
}

export default async function globalSetup() {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

  // Prepare DB schema quickly (best-effort)
  const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/techtrend_test';
  process.env.DATABASE_URL = dbUrl;
  spawnSync('npx', ['prisma', 'generate'], { stdio: 'inherit' });
  spawnSync('npx', ['prisma', 'db', 'push'], { stdio: 'inherit', env: process.env });
  // Seeding is optional; skip to save time unless explicitly requested
  if (process.env.INTEGRATION_SEED === 'true') {
    spawnSync('npx', ['tsx', 'prisma/seed-test.ts'], { stdio: 'inherit', env: process.env });
  }

  // If server already up, reuse
  const ok = await waitForServer(`${BASE_URL}/`, 2, 500);
  if (ok) {
    process.env.BASE_URL = BASE_URL;
    return;
  }

  // Start Next dev server for speed (no build)
  const child = spawn('npm', ['run', 'dev'], {
    stdio: 'inherit',
    env: { ...process.env, PORT, NODE_ENV: 'test' },
    detached: true,
  });

  fs.writeFileSync(PID_FILE, String(child.pid));

  const ready = await waitForServer(`${BASE_URL}/`);
  if (!ready) {
    try { process.kill(-child.pid); } catch {}
    throw new Error('Next server failed to start for integration tests');
  }
  process.env.BASE_URL = BASE_URL;
}

