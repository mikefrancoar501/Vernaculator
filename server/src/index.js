import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { loadKeysFile } from './keysfile.js';

// `npm start` does not go through fancybot-setup.bat, so read the saved keys.env here too.
const keys = loadKeysFile();
const cfg = loadConfig();
const { server, store } = createApp(cfg);

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nPort ${cfg.port} is already in use: another Fancy Bot server (or another program) is running.`);
    console.error('Close the other server window first, then start this one again.\n');
    process.exit(1);
  }
  throw err;
});

server.listen(cfg.port, () => {
  console.log(`Fancy Bot middleware listening on http://localhost:${cfg.port}`);
  console.log(`  LLM: ${cfg.llm.provider}${cfg.llm.provider === 'anthropic' ? ` (${cfg.llm.model}, effort ${cfg.llm.effort})` : ''}`);
  console.log(`  TTS: ${cfg.tts.provider}`);
  console.log(keys ? `  Keys file: ${keys.file}${keys.loaded.length ? ` (loaded ${keys.loaded.join(', ')})` : ''}` : '  Keys file: none found (Documents\\FancyBot\\keys.env)');
  const mock = [cfg.llm.provider !== 'anthropic' && 'LLM', cfg.tts.provider !== 'fish' && 'TTS'].filter(Boolean);
  if (mock.length) {
    const bar = '!'.repeat(72);
    console.warn(`\n${bar}`);
    console.warn(`  TEST MODE (${mock.join(' + ')} = mock): no real API keys are in use.`);
    if (cfg.tts.provider !== 'fish') console.warn('  Voices: every character makes beeping, squeaky sounds instead of words.');
    if (cfg.llm.provider !== 'anthropic') console.warn('  Words: replies are canned test text, not Claude.');
    console.warn('  Fix: double-click fancybot-keys.bat, type your keys, then start with fancybot-setup.bat');
    console.warn('  (or set FANCYBOT_KEYS to your keys.env path before npm start).');
    console.warn(`${bar}\n`);
  }
  console.log(`  Accounts and tokens: ${cfg.dataFile}`);
  console.log('  Create a user token with: npm run token:create -- --plan free');
});

const shutdown = () => {
  store.flush();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
