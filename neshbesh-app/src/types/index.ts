export type PlayerSign = 1 | -1;
export type DiceRoll = [number, number];
export type VictoryType = 'Simple' | 'Mars' | 'Turkish Mars' | 'Star Mars';

export type Phase =
  | 'INITIAL_ROLL'
  | 'WAITING_ROLL'
  | 'MOVING'
  | 'SKIP'
  | 'SPECIAL_CHOOSE_DOUBLE'
  | 'SPECIAL_NESH_STRIKE_FREE_MOVE'
  | 'SPECIAL_63_CHOICE'
  | 'SPECIAL_43_ROLL'
  | 'SPECIAL_43_RESULT'
  | 'SPECIAL_51_ROLL'
  | 'SPECIAL_51_RESULT'
  | 'TABLE_FLIP'
  | 'GAME_OVER';

export interface Score {
  whitePoints: number;
  blackPoints: number;
  whiteSets: number;
  blackSets: number;
}

export interface VictoryInfo {
  type: VictoryType;
  points: number; // Infinity = instant championship
}
