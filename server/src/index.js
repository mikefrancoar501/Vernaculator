import { loadConfig } from './config.js';
import { createApp } from './app.js';

const cfg = loadConfig();
const { server, store } = createApp(cfg);

server.listen(cfg.port, () => {
  console.log(`Fancy Bot middleware listening on http://localhost:${cfg.port}`);
  console.log(`  LLM: ${cfg.llm.provider}${cfg.llm.provider === 'anthropic' ? ` (${cfg.llm.model}, effort ${cfg.llm.effort})` : ''}`);
  console.log(`  TTS: ${cfg.tts.provider}`);
  console.log('  Create a user token with: npm run token:create -- --plan free');
});

const shutdown = () => {
  store.flush();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
