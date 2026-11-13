import { loadConfig } from './config.js';
import { createApp } from './app.js';

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
