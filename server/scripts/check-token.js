// Usage: node scripts/check-token.js <token>
// Exits 0 if the token is valid in this server's data file (DATA_FILE), 1 if not.
import { loadConfig } from '../src/config.js';
import { JsonStore } from '../src/store.js';

const token = String(process.argv[2] || '').trim();
const cfg = loadConfig();
const ok = !!new JsonStore(cfg.dataFile).findUserByToken(token);
console.log(ok ? `Token OK (${cfg.dataFile})` : `Token not found in ${cfg.dataFile}`);
process.exit(ok ? 0 : 1);
