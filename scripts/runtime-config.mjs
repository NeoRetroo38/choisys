// Internal JSON adapter for the PowerShell launcher. Never returns secrets.
import { discoverTailscaleNames, isTailscaleIPv4, runtimeConfig } from './lib/runtime.mjs';

const args = process.argv.slice(2);
const value = name => args[args.indexOf(name) + 1];
try {
  const host = args.includes('--host') ? value('--host') : '127.0.0.1';
  const dnsNames = args.includes('--tailscale') || isTailscaleIPv4(host) ? discoverTailscaleNames(host) : [];
  console.log(JSON.stringify(runtimeConfig({ host, dnsNames,
    apiPort: args.includes('--api-port') ? Number(value('--api-port')) : 3000,
    webPort: args.includes('--web-port') ? Number(value('--web-port')) : 8081,
  })));
} catch {
  console.error('Invalid runtime configuration: check private bind address, ports and exact HTTP(S) origins.');
  process.exitCode = 1;
}
