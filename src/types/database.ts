/**
 * Generated from supabase/migrations/*.sql via direct Postgres introspection —
 * `supabase gen types typescript` needs Docker to pull postgres-meta, which this
 * sandbox's network policy blocks. Regenerate normally once Docker is available:
 *
 *   npx supabase gen types typescript --local > src/types/database.ts
 *
 * Schema reference: docs/02-DATA-MODEL.md
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type Database = {
  public: {
    Tables: {
      app_settings: {
        Row: {
          id: number;
          app_name: string;
          default_rules_profile_id: string | null;
          default_overs: number;
          allow_public_audience: boolean;
          allow_self_signup: boolean;
          branding: Json;
        };
        Insert: {
          id: number;
          app_name?: string;
          default_rules_profile_id?: string | null;
          default_overs?: number;
          allow_public_audience?: boolean;
          allow_self_signup?: boolean;
          branding?: Json;
        };
        Update: {
          id?: number;
          app_name?: string;
          default_rules_profile_id?: string | null;
          default_overs?: number;
          allow_public_audience?: boolean;
          allow_self_signup?: boolean;
          branding?: Json;
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: string;
          actor_profile_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string;
          before: Json | null;
          after: Json | null;
          ip: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_profile_id?: string | null;
          action: string;
          entity_type: string;
          entity_id: string;
          before?: Json | null;
          after?: Json | null;
          ip?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          actor_profile_id?: string | null;
          action?: string;
          entity_type?: string;
          entity_id?: string;
          before?: Json | null;
          after?: Json | null;
          ip?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      batting_card_entries: {
        Row: {
          id: string;
          innings_id: string;
          player_id: string;
          position: number | null;
          runs: number;
          balls: number;
          fours: number;
          sixes: number;
          status: string;
          dismissal_delivery_id: string | null;
          dismissal_text: string | null;
          minutes_at_crease: number | null;
        };
        Insert: {
          id?: string;
          innings_id: string;
          player_id: string;
          position?: number | null;
          runs?: number;
          balls?: number;
          fours?: number;
          sixes?: number;
          status?: string;
          dismissal_delivery_id?: string | null;
          dismissal_text?: string | null;
          minutes_at_crease?: number | null;
        };
        Update: {
          id?: string;
          innings_id?: string;
          player_id?: string;
          position?: number | null;
          runs?: number;
          balls?: number;
          fours?: number;
          sixes?: number;
          status?: string;
          dismissal_delivery_id?: string | null;
          dismissal_text?: string | null;
          minutes_at_crease?: number | null;
        };
        Relationships: [];
      };
      bowling_card_entries: {
        Row: {
          id: string;
          innings_id: string;
          player_id: string;
          overs_legal_balls: number;
          maidens: number;
          runs_conceded: number;
          wickets: number;
          wides: number;
          no_balls: number;
          dots: number;
          fours_conceded: number;
          sixes_conceded: number;
        };
        Insert: {
          id?: string;
          innings_id: string;
          player_id: string;
          overs_legal_balls?: number;
          maidens?: number;
          runs_conceded?: number;
          wickets?: number;
          wides?: number;
          no_balls?: number;
          dots?: number;
          fours_conceded?: number;
          sixes_conceded?: number;
        };
        Update: {
          id?: string;
          innings_id?: string;
          player_id?: string;
          overs_legal_balls?: number;
          maidens?: number;
          runs_conceded?: number;
          wickets?: number;
          wides?: number;
          no_balls?: number;
          dots?: number;
          fours_conceded?: number;
          sixes_conceded?: number;
        };
        Relationships: [];
      };
      deliveries: {
        Row: {
          id: string;
          innings_id: string;
          match_id: string;
          seq: number;
          over_no: number;
          ball_in_over: number;
          is_legal: boolean;
          striker_id: string;
          non_striker_id: string;
          bowler_id: string;
          runs_batter: number;
          runs_extras: number;
          extra_type: Database['public']['Enums']['extra_type'] | null;
          runs_total: number | null;
          is_wicket: boolean;
          wicket_type: Database['public']['Enums']['wicket_type'] | null;
          dismissed_player_id: string | null;
          fielder_id: string | null;
          assist_fielder_id: string | null;
          is_free_hit: boolean;
          creates_free_hit: boolean;
          is_boundary_four: boolean;
          is_boundary_six: boolean;
          shot_x: number | null;
          shot_y: number | null;
          pitch_x: number | null;
          pitch_y: number | null;
          commentary: string | null;
          scored_by_profile_id: string;
          client_delivery_id: string;
          is_deleted: boolean;
          created_at: string;
          crossed_before_dismissal: boolean | null;
        };
        Insert: {
          id?: string;
          innings_id: string;
          match_id: string;
          seq?: number;
          over_no: number;
          ball_in_over: number;
          is_legal: boolean;
          striker_id: string;
          non_striker_id: string;
          bowler_id: string;
          runs_batter?: number;
          runs_extras?: number;
          extra_type?: Database['public']['Enums']['extra_type'] | null;
          is_wicket?: boolean;
          wicket_type?: Database['public']['Enums']['wicket_type'] | null;
          dismissed_player_id?: string | null;
          fielder_id?: string | null;
          assist_fielder_id?: string | null;
          is_free_hit?: boolean;
          creates_free_hit?: boolean;
          is_boundary_four?: boolean;
          is_boundary_six?: boolean;
          shot_x?: number | null;
          shot_y?: number | null;
          pitch_x?: number | null;
          pitch_y?: number | null;
          commentary?: string | null;
          scored_by_profile_id: string;
          client_delivery_id: string;
          is_deleted?: boolean;
          created_at?: string;
          crossed_before_dismissal?: boolean | null;
        };
        Update: {
          id?: string;
          innings_id?: string;
          match_id?: string;
          seq?: number;
          over_no?: number;
          ball_in_over?: number;
          is_legal?: boolean;
          striker_id?: string;
          non_striker_id?: string;
          bowler_id?: string;
          runs_batter?: number;
          runs_extras?: number;
          extra_type?: Database['public']['Enums']['extra_type'] | null;
          is_wicket?: boolean;
          wicket_type?: Database['public']['Enums']['wicket_type'] | null;
          dismissed_player_id?: string | null;
          fielder_id?: string | null;
          assist_fielder_id?: string | null;
          is_free_hit?: boolean;
          creates_free_hit?: boolean;
          is_boundary_four?: boolean;
          is_boundary_six?: boolean;
          shot_x?: number | null;
          shot_y?: number | null;
          pitch_x?: number | null;
          pitch_y?: number | null;
          commentary?: string | null;
          scored_by_profile_id?: string;
          client_delivery_id?: string;
          is_deleted?: boolean;
          created_at?: string;
          crossed_before_dismissal?: boolean | null;
        };
        Relationships: [];
      };
      delivery_edits: {
        Row: {
          id: string;
          delivery_id: string;
          edited_by_profile_id: string;
          edit_type: string;
          before: Json | null;
          after: Json | null;
          reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          delivery_id: string;
          edited_by_profile_id: string;
          edit_type: string;
          before?: Json | null;
          after?: Json | null;
          reason?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          delivery_id?: string;
          edited_by_profile_id?: string;
          edit_type?: string;
          before?: Json | null;
          after?: Json | null;
          reason?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      handoff_tokens: {
        Row: {
          id: string;
          token: string;
          match_id: string;
          issued_by_profile_id: string;
          can_delegate: boolean;
          scope: string;
          expires_at: string;
          redeemed_at: string | null;
          redeemed_by_profile_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          token: string;
          match_id: string;
          issued_by_profile_id: string;
          can_delegate?: boolean;
          scope?: string;
          expires_at: string;
          redeemed_at?: string | null;
          redeemed_by_profile_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          token?: string;
          match_id?: string;
          issued_by_profile_id?: string;
          can_delegate?: boolean;
          scope?: string;
          expires_at?: string;
          redeemed_at?: string | null;
          redeemed_by_profile_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      innings: {
        Row: {
          id: string;
          match_id: string;
          innings_no: number;
          batting_team_id: string;
          bowling_team_id: string;
          is_super_over: boolean;
          total_runs: number;
          total_wickets: number;
          legal_balls: number;
          extras_wides: number;
          extras_no_balls: number;
          extras_byes: number;
          extras_leg_byes: number;
          extras_penalty: number;
          target: number | null;
          revised_target: number | null;
          revised_overs: number | null;
          status: string;
          end_reason: string | null;
          started_at: string | null;
          ended_at: string | null;
        };
        Insert: {
          id?: string;
          match_id: string;
          innings_no: number;
          batting_team_id: string;
          bowling_team_id: string;
          is_super_over?: boolean;
          total_runs?: number;
          total_wickets?: number;
          legal_balls?: number;
          extras_wides?: number;
          extras_no_balls?: number;
          extras_byes?: number;
          extras_leg_byes?: number;
          extras_penalty?: number;
          target?: number | null;
          revised_target?: number | null;
          revised_overs?: number | null;
          status?: string;
          end_reason?: string | null;
          started_at?: string | null;
          ended_at?: string | null;
        };
        Update: {
          id?: string;
          match_id?: string;
          innings_no?: number;
          batting_team_id?: string;
          bowling_team_id?: string;
          is_super_over?: boolean;
          total_runs?: number;
          total_wickets?: number;
          legal_balls?: number;
          extras_wides?: number;
          extras_no_balls?: number;
          extras_byes?: number;
          extras_leg_byes?: number;
          extras_penalty?: number;
          target?: number | null;
          revised_target?: number | null;
          revised_overs?: number | null;
          status?: string;
          end_reason?: string | null;
          started_at?: string | null;
          ended_at?: string | null;
        };
        Relationships: [];
      };
      innings_intervals: {
        Row: {
          id: string;
          innings_id: string;
          type: string;
          at_over: number | null;
          overs_lost: number | null;
          started_at: string | null;
          ended_at: string | null;
          note: string | null;
        };
        Insert: {
          id?: string;
          innings_id: string;
          type: string;
          at_over?: number | null;
          overs_lost?: number | null;
          started_at?: string | null;
          ended_at?: string | null;
          note?: string | null;
        };
        Update: {
          id?: string;
          innings_id?: string;
          type?: string;
          at_over?: number | null;
          overs_lost?: number | null;
          started_at?: string | null;
          ended_at?: string | null;
          note?: string | null;
        };
        Relationships: [];
      };
      match_squads: {
        Row: {
          id: string;
          match_id: string;
          team_id: string;
          player_id: string;
          is_playing_xi: boolean;
          is_captain: boolean;
          is_wicket_keeper: boolean;
          batting_order: number | null;
          role_in_match: Database['public']['Enums']['player_role'] | null;
        };
        Insert: {
          id?: string;
          match_id: string;
          team_id: string;
          player_id: string;
          is_playing_xi?: boolean;
          is_captain?: boolean;
          is_wicket_keeper?: boolean;
          batting_order?: number | null;
          role_in_match?: Database['public']['Enums']['player_role'] | null;
        };
        Update: {
          id?: string;
          match_id?: string;
          team_id?: string;
          player_id?: string;
          is_playing_xi?: boolean;
          is_captain?: boolean;
          is_wicket_keeper?: boolean;
          batting_order?: number | null;
          role_in_match?: Database['public']['Enums']['player_role'] | null;
        };
        Relationships: [];
      };
      matches: {
        Row: {
          id: string;
          public_slug: string | null;
          title: string | null;
          tournament_id: string | null;
          team_a_id: string;
          team_b_id: string;
          venue: string | null;
          scheduled_at: string | null;
          status: Database['public']['Enums']['match_status'];
          config: Json;
          toss_winner_team_id: string | null;
          toss_decision: string | null;
          current_innings_no: number;
          result_type: Database['public']['Enums']['result_type'] | null;
          winner_team_id: string | null;
          win_margin_runs: number | null;
          win_margin_wickets: number | null;
          player_of_match_id: string | null;
          result_text: string | null;
          created_by: string | null;
          completed_at: string | null;
          is_locked: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          public_slug?: string | null;
          title?: string | null;
          tournament_id?: string | null;
          team_a_id: string;
          team_b_id: string;
          venue?: string | null;
          scheduled_at?: string | null;
          status?: Database['public']['Enums']['match_status'];
          config: Json;
          toss_winner_team_id?: string | null;
          toss_decision?: string | null;
          current_innings_no?: number;
          result_type?: Database['public']['Enums']['result_type'] | null;
          winner_team_id?: string | null;
          win_margin_runs?: number | null;
          win_margin_wickets?: number | null;
          player_of_match_id?: string | null;
          result_text?: string | null;
          created_by?: string | null;
          completed_at?: string | null;
          is_locked?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          public_slug?: string | null;
          title?: string | null;
          tournament_id?: string | null;
          team_a_id?: string;
          team_b_id?: string;
          venue?: string | null;
          scheduled_at?: string | null;
          status?: Database['public']['Enums']['match_status'];
          config?: Json;
          toss_winner_team_id?: string | null;
          toss_decision?: string | null;
          current_innings_no?: number;
          result_type?: Database['public']['Enums']['result_type'] | null;
          winner_team_id?: string | null;
          win_margin_runs?: number | null;
          win_margin_wickets?: number | null;
          player_of_match_id?: string | null;
          result_text?: string | null;
          created_by?: string | null;
          completed_at?: string | null;
          is_locked?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          profile_id: string;
          type: string;
          payload: Json;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          type: string;
          payload?: Json;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          type?: string;
          payload?: Json;
          read_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      player_career_stats: {
        Row: {
          player_id: string;
          matches: number;
          innings_batted: number;
          innings_bowled: number;
          runs: number;
          highest_score: number;
          highest_score_not_out: boolean;
          batting_average: number | null;
          strike_rate: number | null;
          fifties: number;
          hundreds: number;
          ducks: number;
          balls_faced: number;
          wickets: number;
          best_bowling_wickets: number | null;
          best_bowling_runs: number | null;
          bowling_average: number | null;
          economy: number | null;
          three_wicket_hauls: number;
          five_wicket_hauls: number;
          catches: number;
          stumpings: number;
          run_outs: number;
          overall_rating: number | null;
          batting_rating: number | null;
          bowling_rating: number | null;
          allrounder_rating: number | null;
          fielding_rating: number | null;
          last_computed_at: string | null;
        };
        Insert: {
          player_id: string;
          matches?: number;
          innings_batted?: number;
          innings_bowled?: number;
          runs?: number;
          highest_score?: number;
          highest_score_not_out?: boolean;
          batting_average?: number | null;
          strike_rate?: number | null;
          fifties?: number;
          hundreds?: number;
          ducks?: number;
          balls_faced?: number;
          wickets?: number;
          best_bowling_wickets?: number | null;
          best_bowling_runs?: number | null;
          bowling_average?: number | null;
          economy?: number | null;
          three_wicket_hauls?: number;
          five_wicket_hauls?: number;
          catches?: number;
          stumpings?: number;
          run_outs?: number;
          overall_rating?: number | null;
          batting_rating?: number | null;
          bowling_rating?: number | null;
          allrounder_rating?: number | null;
          fielding_rating?: number | null;
          last_computed_at?: string | null;
        };
        Update: {
          player_id?: string;
          matches?: number;
          innings_batted?: number;
          innings_bowled?: number;
          runs?: number;
          highest_score?: number;
          highest_score_not_out?: boolean;
          batting_average?: number | null;
          strike_rate?: number | null;
          fifties?: number;
          hundreds?: number;
          ducks?: number;
          balls_faced?: number;
          wickets?: number;
          best_bowling_wickets?: number | null;
          best_bowling_runs?: number | null;
          bowling_average?: number | null;
          economy?: number | null;
          three_wicket_hauls?: number;
          five_wicket_hauls?: number;
          catches?: number;
          stumpings?: number;
          run_outs?: number;
          overall_rating?: number | null;
          batting_rating?: number | null;
          bowling_rating?: number | null;
          allrounder_rating?: number | null;
          fielding_rating?: number | null;
          last_computed_at?: string | null;
        };
        Relationships: [];
      };
      player_match_stats: {
        Row: {
          id: string;
          match_id: string;
          player_id: string;
          team_id: string;
          did_bat: boolean;
          did_bowl: boolean;
          runs: number;
          balls_faced: number;
          fours: number;
          sixes: number;
          is_out: boolean;
          is_not_out: boolean;
          strike_rate: number | null;
          balls_bowled: number;
          runs_conceded: number;
          wickets: number;
          maidens: number;
          dots: number;
          economy: number | null;
          catches: number;
          run_outs: number;
          stumpings: number;
          is_player_of_match: boolean;
          match_result_for_player: string | null;
          rating_points: number | null;
        };
        Insert: {
          id?: string;
          match_id: string;
          player_id: string;
          team_id: string;
          did_bat?: boolean;
          did_bowl?: boolean;
          runs?: number;
          balls_faced?: number;
          fours?: number;
          sixes?: number;
          is_out?: boolean;
          is_not_out?: boolean;
          strike_rate?: number | null;
          balls_bowled?: number;
          runs_conceded?: number;
          wickets?: number;
          maidens?: number;
          dots?: number;
          economy?: number | null;
          catches?: number;
          run_outs?: number;
          stumpings?: number;
          is_player_of_match?: boolean;
          match_result_for_player?: string | null;
          rating_points?: number | null;
        };
        Update: {
          id?: string;
          match_id?: string;
          player_id?: string;
          team_id?: string;
          did_bat?: boolean;
          did_bowl?: boolean;
          runs?: number;
          balls_faced?: number;
          fours?: number;
          sixes?: number;
          is_out?: boolean;
          is_not_out?: boolean;
          strike_rate?: number | null;
          balls_bowled?: number;
          runs_conceded?: number;
          wickets?: number;
          maidens?: number;
          dots?: number;
          economy?: number | null;
          catches?: number;
          run_outs?: number;
          stumpings?: number;
          is_player_of_match?: boolean;
          match_result_for_player?: string | null;
          rating_points?: number | null;
        };
        Relationships: [];
      };
      players: {
        Row: {
          id: string;
          profile_id: string | null;
          full_name: string;
          short_name: string | null;
          jersey_number: number | null;
          date_of_birth: string | null;
          photo_url: string | null;
          primary_role: Database['public']['Enums']['player_role'];
          secondary_role: Database['public']['Enums']['player_role'] | null;
          batting_hand: Database['public']['Enums']['batting_hand'];
          bowling_style: Database['public']['Enums']['bowling_style'] | null;
          bio: string | null;
          role_locked_by_admin: boolean;
          created_by: string | null;
          claim_code: string | null;
          claimed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id?: string | null;
          full_name: string;
          short_name?: string | null;
          jersey_number?: number | null;
          date_of_birth?: string | null;
          photo_url?: string | null;
          primary_role?: Database['public']['Enums']['player_role'];
          secondary_role?: Database['public']['Enums']['player_role'] | null;
          batting_hand?: Database['public']['Enums']['batting_hand'];
          bowling_style?: Database['public']['Enums']['bowling_style'] | null;
          bio?: string | null;
          role_locked_by_admin?: boolean;
          created_by?: string | null;
          claim_code?: string | null;
          claimed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string | null;
          full_name?: string;
          short_name?: string | null;
          jersey_number?: number | null;
          date_of_birth?: string | null;
          photo_url?: string | null;
          primary_role?: Database['public']['Enums']['player_role'];
          secondary_role?: Database['public']['Enums']['player_role'] | null;
          batting_hand?: Database['public']['Enums']['batting_hand'];
          bowling_style?: Database['public']['Enums']['bowling_style'] | null;
          bio?: string | null;
          role_locked_by_admin?: boolean;
          created_by?: string | null;
          claim_code?: string | null;
          claimed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          display_name: string;
          handle: string | null;
          avatar_url: string | null;
          email: string | null;
          phone: string | null;
          is_super_admin: boolean;
          theme_pref: string;
          accent_pref: string;
          haptics_enabled: boolean;
          sound_enabled: boolean;
          scorer_hand: string;
          reduced_motion_override: boolean | null;
          last_seen_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          handle?: string | null;
          avatar_url?: string | null;
          email?: string | null;
          phone?: string | null;
          is_super_admin?: boolean;
          theme_pref?: string;
          accent_pref?: string;
          haptics_enabled?: boolean;
          sound_enabled?: boolean;
          scorer_hand?: string;
          reduced_motion_override?: boolean | null;
          last_seen_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          handle?: string | null;
          avatar_url?: string | null;
          email?: string | null;
          phone?: string | null;
          is_super_admin?: boolean;
          theme_pref?: string;
          accent_pref?: string;
          haptics_enabled?: boolean;
          sound_enabled?: boolean;
          scorer_hand?: string;
          reduced_motion_override?: boolean | null;
          last_seen_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      ranking_snapshots: {
        Row: {
          id: string;
          player_id: string;
          scope: string;
          board: string;
          rank: number;
          rating: number;
          snapshot_date: string;
        };
        Insert: {
          id?: string;
          player_id: string;
          scope: string;
          board: string;
          rank: number;
          rating: number;
          snapshot_date: string;
        };
        Update: {
          id?: string;
          player_id?: string;
          scope?: string;
          board?: string;
          rank?: number;
          rating?: number;
          snapshot_date?: string;
        };
        Relationships: [];
      };
      role_change_suggestions: {
        Row: {
          id: string;
          player_id: string;
          suggested_by: string;
          suggested_role: Database['public']['Enums']['player_role'];
          note: string | null;
          status: string;
          resolved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          player_id: string;
          suggested_by: string;
          suggested_role: Database['public']['Enums']['player_role'];
          note?: string | null;
          status?: string;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          player_id?: string;
          suggested_by?: string;
          suggested_role?: Database['public']['Enums']['player_role'];
          note?: string | null;
          status?: string;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      rules_profiles: {
        Row: {
          id: string;
          name: string;
          config: Json;
          is_system: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          config: Json;
          is_system?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          config?: Json;
          is_system?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      scoring_grants: {
        Row: {
          id: string;
          match_id: string;
          grantee_profile_id: string;
          granted_by_profile_id: string;
          status: Database['public']['Enums']['grant_status'];
          can_delegate: boolean;
          scope: string;
          granted_at: string;
          expires_at: string | null;
          revoked_at: string | null;
          revoked_by_profile_id: string | null;
          transferred_to_grant_id: string | null;
          note: string | null;
        };
        Insert: {
          id?: string;
          match_id: string;
          grantee_profile_id: string;
          granted_by_profile_id: string;
          status?: Database['public']['Enums']['grant_status'];
          can_delegate?: boolean;
          scope?: string;
          granted_at?: string;
          expires_at?: string | null;
          revoked_at?: string | null;
          revoked_by_profile_id?: string | null;
          transferred_to_grant_id?: string | null;
          note?: string | null;
        };
        Update: {
          id?: string;
          match_id?: string;
          grantee_profile_id?: string;
          granted_by_profile_id?: string;
          status?: Database['public']['Enums']['grant_status'];
          can_delegate?: boolean;
          scope?: string;
          granted_at?: string;
          expires_at?: string | null;
          revoked_at?: string | null;
          revoked_by_profile_id?: string | null;
          transferred_to_grant_id?: string | null;
          note?: string | null;
        };
        Relationships: [];
      };
      team_members: {
        Row: {
          id: string;
          team_id: string;
          player_id: string;
          team_role: Database['public']['Enums']['team_role'];
          squad_number: number | null;
          joined_at: string;
          left_at: string | null;
          is_active: boolean | null;
        };
        Insert: {
          id?: string;
          team_id: string;
          player_id: string;
          team_role?: Database['public']['Enums']['team_role'];
          squad_number?: number | null;
          joined_at?: string;
          left_at?: string | null;
        };
        Update: {
          id?: string;
          team_id?: string;
          player_id?: string;
          team_role?: Database['public']['Enums']['team_role'];
          squad_number?: number | null;
          joined_at?: string;
          left_at?: string | null;
        };
        Relationships: [];
      };
      teams: {
        Row: {
          id: string;
          name: string;
          short_code: string;
          slug: string | null;
          logo_url: string | null;
          primary_color: string;
          secondary_color: string | null;
          home_ground: string | null;
          city: string | null;
          founded_year: number | null;
          owner_id: string;
          is_archived: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          short_code: string;
          slug?: string | null;
          logo_url?: string | null;
          primary_color?: string;
          secondary_color?: string | null;
          home_ground?: string | null;
          city?: string | null;
          founded_year?: number | null;
          owner_id: string;
          is_archived?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          short_code?: string;
          slug?: string | null;
          logo_url?: string | null;
          primary_color?: string;
          secondary_color?: string | null;
          home_ground?: string | null;
          city?: string | null;
          founded_year?: number | null;
          owner_id?: string;
          is_archived?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      _insert_scored_delivery: {
        Args: {
          p: Json | null;
          v_match: Database['public']['Tables']['matches']['Row'] | null;
          v_innings: Database['public']['Tables']['innings']['Row'] | null;
        };
        Returns: Json;
      };
      add_existing_profile_to_team: {
        Args: {
          p_team_id: string | null;
          p_profile_id: string | null;
          p_team_role?: Database['public']['Enums']['team_role'] | null;
        };
        Returns: Database['public']['Tables']['players']['Row'];
      };
      archive_team: {
        Args: {
          p_team_id: string | null;
          p_archived?: boolean | null;
        };
        Returns: undefined;
      };
      can_manage_match: {
        Args: {
          p_match_id: string | null;
        };
        Returns: boolean;
      };
      can_score: {
        Args: {
          p_match_id: string | null;
          p_profile_id: string | null;
        };
        Returns: boolean;
      };
      claim_player: {
        Args: {
          p_claim_code: string | null;
        };
        Returns: Database['public']['Tables']['players']['Row'];
      };
      /* Phase 8. Hand-added: `supabase gen types` still cannot run in this
         sandbox (no Docker — HANDOFF.md § 5.1), so new RPC signatures are
         written here by hand until someone regenerates against a real
         project. `refinalize_match` is the only Phase 8 function the client
         calls; the rest run from the trigger and are revoked from
         anon/authenticated on purpose. */
      refinalize_match: {
        Args: { p_match_id: string };
        Returns: Json;
      };
      complete_match: {
        Args: {
          p_match_id: string | null;
          p_result_type: Database['public']['Enums']['result_type'] | null;
          p_winner_team_id?: string | null;
          p_win_margin_runs?: number | null;
          p_win_margin_wickets?: number | null;
          p_result_text?: string | null;
          p_player_of_match_id?: string | null;
        };
        Returns: Database['public']['Tables']['matches']['Row'];
      };
      create_handoff_token: {
        Args: {
          p_match_id: string | null;
          p_ttl_seconds?: number | null;
        };
        Returns: Database['public']['Tables']['handoff_tokens']['Row'];
      };
      create_match: {
        Args: {
          p_team_a_id: string | null;
          p_team_b_id: string | null;
          p_config: Json | null;
          p_title?: string | null;
          p_venue?: string | null;
          p_scheduled_at?: string | null;
        };
        Returns: Database['public']['Tables']['matches']['Row'];
      };
      create_shadow_player: {
        Args: {
          p_team_id: string | null;
          p_full_name: string | null;
          p_primary_role?: Database['public']['Enums']['player_role'] | null;
          p_jersey_number?: number | null;
        };
        Returns: Database['public']['Tables']['players']['Row'];
      };
      create_team: {
        Args: {
          p_name: string | null;
          p_short_code: string | null;
          p_primary_color?: string | null;
          p_secondary_color?: string | null;
          p_home_ground?: string | null;
          p_city?: string | null;
        };
        Returns: Database['public']['Tables']['teams']['Row'];
      };
      edit_delivery: {
        Args: {
          p_delivery_id: string | null;
          p_changes: Json | null;
          p_reason?: string | null;
        };
        Returns: Json;
      };
      end_innings: {
        Args: {
          p_innings_id: string | null;
          p_reason: string | null;
        };
        Returns: Database['public']['Tables']['innings']['Row'];
      };
      get_match_grants: {
        Args: {
          p_match_id: string | null;
        };
        Returns: {
          id: string;
          match_id: string;
          grantee_profile_id: string;
          granted_by_profile_id: string;
          status: Database['public']['Enums']['grant_status'];
          can_delegate: boolean;
          scope: string;
          granted_at: string;
          expires_at: string | null;
          revoked_at: string | null;
          transferred_to_grant_id: string | null;
          note: string | null;
          grantee_display_name: string;
          grantee_avatar_url: string | null;
          granted_by_display_name: string | null;
        }[];
      };
      is_player_self: {
        Args: {
          p_player_id: string | null;
        };
        Returns: boolean;
      };
      is_super_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      is_team_admin: {
        Args: {
          p_team_id: string | null;
        };
        Returns: boolean;
      };
      is_team_manager: {
        Args: {
          p_team_id: string | null;
        };
        Returns: boolean;
      };
      issue_scoring_grant: {
        Args: {
          p_match_id: string | null;
          p_grantee_profile_id: string | null;
          p_can_delegate?: boolean | null;
          p_scope?: string | null;
          p_expires_at?: string | null;
          p_note?: string | null;
        };
        Returns: Database['public']['Tables']['scoring_grants']['Row'];
      };
      rebuild_innings: {
        Args: {
          p_innings_id: string | null;
        };
        Returns: undefined;
      };
      record_deliveries_batch: {
        Args: {
          p: Json | null;
        };
        Returns: Json;
      };
      record_delivery: {
        Args: {
          p: Json | null;
        };
        Returns: Json;
      };
      redeem_handoff_token: {
        Args: {
          p_token: string | null;
        };
        Returns: Database['public']['Tables']['scoring_grants']['Row'];
      };
      respond_to_role_suggestion: {
        Args: {
          p_suggestion_id: string | null;
          p_accept: boolean | null;
        };
        Returns: Database['public']['Tables']['role_change_suggestions']['Row'];
      };
      revoke_scoring_grant: {
        Args: {
          p_grant_id: string | null;
          p_reason?: string | null;
        };
        Returns: Database['public']['Tables']['scoring_grants']['Row'];
      };
      search_profiles: {
        Args: {
          p_query: string | null;
        };
        Returns: {
          id: string;
          display_name: string;
          handle: string | null;
          avatar_url: string | null;
        }[];
      };
      set_playing_xi: {
        Args: {
          p_match_id: string | null;
          p_team_id: string | null;
          p_player_ids: string[] | null;
          p_captain_id?: string | null;
          p_keeper_id?: string | null;
        };
        Returns: Database['public']['Tables']['match_squads']['Row'][];
      };
      set_toss: {
        Args: {
          p_match_id: string | null;
          p_winner_team_id: string | null;
          p_decision: string | null;
        };
        Returns: Database['public']['Tables']['matches']['Row'];
      };
      start_innings: {
        Args: {
          p_match_id: string | null;
        };
        Returns: Database['public']['Tables']['innings']['Row'];
      };
      suggest_role_change: {
        Args: {
          p_player_id: string | null;
          p_suggested_role: Database['public']['Enums']['player_role'] | null;
          p_note?: string | null;
        };
        Returns: Database['public']['Tables']['role_change_suggestions']['Row'];
      };
      transfer_scoring_grant: {
        Args: {
          p_grant_id: string | null;
          p_to_profile_id: string | null;
          p_keep_mine?: boolean | null;
        };
        Returns: Database['public']['Tables']['scoring_grants']['Row'];
      };
      transfer_team_ownership: {
        Args: {
          p_team_id: string | null;
          p_new_owner_profile_id: string | null;
        };
        Returns: undefined;
      };
      undo_last_delivery: {
        Args: {
          p_innings_id: string | null;
          p_reason?: string | null;
        };
        Returns: Json;
      };
      update_player_admin_fields: {
        Args: {
          p_player_id: string | null;
          p_full_name: string | null;
          p_jersey_number: number | null;
        };
        Returns: undefined;
      };
    };
    Enums: {
      batting_hand: 'right' | 'left';
      bowling_style:
        | 'right_arm_fast'
        | 'right_arm_fast_medium'
        | 'right_arm_medium'
        | 'right_arm_off_break'
        | 'right_arm_leg_break'
        | 'left_arm_fast'
        | 'left_arm_fast_medium'
        | 'left_arm_medium'
        | 'left_arm_orthodox'
        | 'left_arm_chinaman'
        | 'none';
      extra_type: 'wide' | 'no_ball' | 'bye' | 'leg_bye' | 'penalty';
      grant_status: 'active' | 'revoked' | 'expired' | 'transferred';
      match_status:
        'scheduled' | 'toss' | 'live' | 'innings_break' | 'super_over' | 'completed' | 'abandoned';
      player_role: 'batter' | 'bowler' | 'all_rounder' | 'wicket_keeper' | 'wk_batter';
      result_type:
        'win' | 'tie' | 'draw' | 'no_result' | 'abandoned' | 'super_over_win' | 'forfeit';
      team_role: 'owner' | 'admin' | 'captain' | 'vice_captain' | 'player';
      wicket_type:
        | 'bowled'
        | 'caught'
        | 'lbw'
        | 'run_out'
        | 'stumped'
        | 'hit_wicket'
        | 'retired_out'
        | 'retired_hurt'
        | 'obstructing_the_field'
        | 'handled_the_ball'
        | 'timed_out'
        | 'hit_ball_twice';
    };
    CompositeTypes: Record<string, never>;
  };
};
