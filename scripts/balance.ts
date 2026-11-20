import { runBot } from '../tests/sim/bot';
const r = runBot(Number(process.argv[2] ?? 4 * 3600), Number(process.argv[3] ?? 1.5));
console.log(JSON.stringify({ ...r, log: undefined }));
console.log(r.log.join('\n'));
