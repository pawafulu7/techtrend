import fs from 'fs';
import path from 'path';

const TMP_DIR = path.join(process.cwd(), '.jest-integration');
const PID_FILE = path.join(TMP_DIR, 'server.pid');

export default async function globalTeardown() {
  try {
    if (fs.existsSync(PID_FILE)) {
      const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8'), 10);
      if (!Number.isNaN(pid)) {
        try {
          process.kill(-pid);
        } catch {}
      }
      fs.unlinkSync(PID_FILE);
    }
  } catch (_) {
    // ignore errors
  }
}

