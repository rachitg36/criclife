import type { Database } from '@/types/database';

type PlayerRole = Database['public']['Enums']['player_role'];
type BattingHand = Database['public']['Enums']['batting_hand'];
type BowlingStyle = Database['public']['Enums']['bowling_style'];
type TeamRole = Database['public']['Enums']['team_role'];

export const PLAYER_ROLE_LABEL: Record<PlayerRole, string> = {
  batter: 'Batter',
  bowler: 'Bowler',
  all_rounder: 'All-rounder',
  wicket_keeper: 'Wicket-keeper',
  wk_batter: 'WK-Batter',
};

export const BATTING_HAND_LABEL: Record<BattingHand, string> = {
  right: 'Right-hand bat',
  left: 'Left-hand bat',
};

export const BOWLING_STYLE_LABEL: Record<BowlingStyle, string> = {
  right_arm_fast: 'Right-arm fast',
  right_arm_fast_medium: 'Right-arm fast-medium',
  right_arm_medium: 'Right-arm medium',
  right_arm_off_break: 'Right-arm off-break',
  right_arm_leg_break: 'Right-arm leg-break',
  left_arm_fast: 'Left-arm fast',
  left_arm_fast_medium: 'Left-arm fast-medium',
  left_arm_medium: 'Left-arm medium',
  left_arm_orthodox: 'Left-arm orthodox',
  left_arm_chinaman: 'Left-arm chinaman',
  none: 'Does not bowl',
};

export const TEAM_ROLE_LABEL: Record<TeamRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  captain: 'Captain',
  vice_captain: 'Vice-captain',
  player: 'Player',
};
