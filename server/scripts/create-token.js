// Usage: npm run token:create -- --plan free|pro [--email someone@example.com]
import { loadConfig } from '../src/config.js';
import { JsonStore } from '../src/store.js';

const args = process.argv.slice(2);
const arg = (name, d) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : d;
};

const cfg = loadConfig();
const store = new JsonStore(cfg.dataFile);
const { user, token } = store.createUser({ plan: arg('plan', 'free'), email: arg('email', null) });
store.flush();
console.log(`Created ${user.id} (plan: ${user.plan})`);
console.log(`Token (shown once, paste into the extension options): ${token}`);
