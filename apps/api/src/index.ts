import { createApp } from './app.js';
import { readConfig } from './config.js';

try {
  const config = readConfig();
  const server = createApp(config).listen(config.port, config.host, () => {
    console.log(`choisys-api listening on http://${config.host}:${config.port}`);
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  server.on('error', () => {
    console.error('choisys-api could not listen on the configured address.');
    process.exitCode = 1;
  });
} catch {
  console.error('choisys-api configuration invalid: check local token, host, port and origins.');
  process.exitCode = 1;
}
