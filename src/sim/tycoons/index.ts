import type { TycoonDef } from '@/sim/types';
import { lemonMogul } from './lemonMogul';
import { rubberDuckWorks } from './rubberDuckWorks';
import { sockSyndicate } from './sockSyndicate';
import { couchCoinMining } from './couchCoinMining';
import { hotDogHighway } from './hotDogHighway';
import { roboCarWash } from './roboCarWash';

/** Registry of all mini-tycoons. Adding a game = one file + one line here. */
export const TYCOONS: TycoonDef<never>[] = [lemonMogul, rubberDuckWorks, sockSyndicate, couchCoinMining, hotDogHighway, roboCarWash] as never;

export const tycoonById = (id: string): TycoonDef<unknown> => {
  const t = TYCOONS.find((d) => d.id === id);
  if (!t) throw new Error(`Unknown tycoon ${id}`);
  return t as unknown as TycoonDef<unknown>;
};
