import { runGarageBot } from '../tests/sim/garageBot';
const r = runGarageBot(5 * 3600, 1.5, Number(process.argv[2] ?? 42));
console.log(JSON.stringify({ garage: r.garage, firstPad: r.firstPad, hotdog: r.hotdog, carwash: r.carwash, robot: r.robot, rebirths: r.rebirths.map((x) => Math.round(x / 60)), lease: r.lease && Math.round(r.lease / 60) }));
console.log(r.glog.join('\n'));
console.log('couch', r.couchRate.toFixed(0), 'games', JSON.stringify(r.gameRates));
