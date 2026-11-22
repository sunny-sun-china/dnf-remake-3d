import {kiriKannaLines} from './npc-kiri-kanna.js';
import {fengFireLines} from './npc-feng-fire.js';

export const npcLines={...kiriKannaLines,...fengFireLines};
export const voiceKey=line=>'voice-'+line.file;
