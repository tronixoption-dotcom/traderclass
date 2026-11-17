export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      funding_methods: {
        Row: { id: string; code: string; name: string; provider: string; asset: string; network: string; deposit_address: string; instructions: string; min_amount: number; max_amount: number; deposits_enabled: boolean; withdrawals_enabled: boolean; sort_order: number; created_at: string; updated_at: string }
        Insert: { id?: string; code: string; name: string; provider: string; asset: string; network?: string; deposit_address?: string; instructions?: string; min_amount?: number; max_amount?: number; deposits_enabled?: boolean; withdrawals_enabled?: boolean; sort_order?: number; created_at?: string; updated_at?: string }
        Update: { id?: string; code?: string; name?: string; provider?: string; asset?: string; network?: string; deposit_address?: string; instructions?: string; min_amount?: number; max_amount?: number; deposits_enabled?: boolean; withdrawals_enabled?: boolean; sort_order?: number; updated_at?: string }
        Relationships: []
      }
      funding_wallets: {
        Row: { user_id: string; asset: string; balance: number; updated_at: string }
        Insert: { user_id: string; asset: string; balance?: number; updated_at?: string }
        Update: { user_id?: string; asset?: string; balance?: number; updated_at?: string }
        Relationships: []
      }
      funding_transactions: {
        Row: { id: string; user_id: string; method_id: string | null; method_name: string; kind: string; asset: string; amount: number; status: string; user_reference: string; destination: string; admin_note: string; reviewed_by: string | null; reviewed_at: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; user_id: string; method_id?: string | null; method_name: string; kind: string; asset: string; amount: number; status: string; user_reference?: string; destination?: string; admin_note?: string; reviewed_by?: string | null; reviewed_at?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; user_id?: string; method_id?: string | null; method_name?: string; kind?: string; asset?: string; amount?: number; status?: string; user_reference?: string; destination?: string; admin_note?: string; reviewed_by?: string | null; reviewed_at?: string | null; created_at?: string; updated_at?: string }
        Relationships: []
      }
      real_trades: {
        Row: { id: string; request_id: string; user_id: string; symbol: string; inst_id: string; direction: string; asset: string; stake: number; entry_price: number; entry_price_ts: number; duration_seconds: number; payout_multiplier: number; reserved_profit: number; expires_at: string; status: string; close_price: number | null; close_candle_ts: number | null; payout: number; settled_at: string | null; by_robot: boolean; created_at: string }
        Insert: { id?: string; request_id: string; user_id: string; symbol: string; inst_id: string; direction: string; asset?: string; stake: number; entry_price: number; entry_price_ts: number; duration_seconds: number; payout_multiplier?: number; reserved_profit: number; expires_at: string; status?: string; close_price?: number | null; close_candle_ts?: number | null; payout?: number; settled_at?: string | null; by_robot?: boolean; created_at?: string }
        Update: { id?: string; request_id?: string; user_id?: string; symbol?: string; inst_id?: string; direction?: string; asset?: string; stake?: number; entry_price?: number; entry_price_ts?: number; duration_seconds?: number; payout_multiplier?: number; reserved_profit?: number; expires_at?: string; status?: string; close_price?: number | null; close_candle_ts?: number | null; payout?: number; settled_at?: string | null; by_robot?: boolean; created_at?: string }
        Relationships: []
      }
      real_trading_reserves: {
        Row: { asset: string; available: number; reserved_profit: number; reserved_stakes: number; updated_at: string }
        Insert: { asset?: string; available?: number; reserved_profit?: number; reserved_stakes?: number; updated_at?: string }
        Update: { asset?: string; available?: number; reserved_profit?: number; reserved_stakes?: number; updated_at?: string }
        Relationships: []
      }
      real_trading_reserve_ledger: {
        Row: { id: string; asset: string; amount: number; kind: string; available_after: number; reserved_profit_after: number; reserved_stakes_after: number; reference_id: string | null; note: string; actor_id: string | null; created_at: string }
        Insert: { id?: string; asset?: string; amount: number; kind: string; available_after: number; reserved_profit_after: number; reserved_stakes_after: number; reference_id?: string | null; note?: string; actor_id?: string | null; created_at?: string }
        Update: { id?: string; asset?: string; amount?: number; kind?: string; available_after?: number; reserved_profit_after?: number; reserved_stakes_after?: number; reference_id?: string | null; note?: string; actor_id?: string | null; created_at?: string }
        Relationships: []
      }
      admin_audit: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          id: string
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      admin_session_unlocks: {
        Row: {
          expires_at: string
          session_id: string
          user_id: string
        }
        Insert: {
          expires_at: string
          session_id: string
          user_id: string
        }
        Update: {
          expires_at?: string
          session_id?: string
          user_id?: string
        }
        Relationships: []
      }
      practice_accounts: {
        Row: {
          state: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          state?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          state?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          referral_code: string
          referred_by: string | null
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          id: string
          referral_code: string
          referred_by?: string | null
          updated_at?: string
          username?: string
        }
        Update: {
          created_at?: string
          id?: string
          referral_code?: string
          referred_by?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          announcement: string
          deposit_fee_percent: number
          deposits_enabled: boolean
          fraud_detection_enabled: boolean
          fraud_max_trades_per_minute: number
          id: boolean
          real_daily_loss_cap: number
          real_market_exposure_cap: number
          real_max_stake: number
          real_min_stake: number
          real_monthly_loss_cap: number
          real_trading_enabled: boolean
          real_user_exposure_cap: number
          real_weekly_loss_cap: number
          robot_enabled: boolean
          trading_enabled: boolean
          updated_at: string
          withdrawal_fee_percent: number
          withdrawals_enabled: boolean
        }
        Insert: {
          announcement?: string
          deposit_fee_percent?: number
          deposits_enabled?: boolean
          fraud_detection_enabled?: boolean
          fraud_max_trades_per_minute?: number
          id?: boolean
          real_daily_loss_cap?: number
          real_market_exposure_cap?: number
            real_max_stake?: number
            real_min_stake?: number
          real_monthly_loss_cap?: number
            real_trading_enabled?: boolean
          real_user_exposure_cap?: number
          real_weekly_loss_cap?: number
          robot_enabled?: boolean
          trading_enabled?: boolean
          updated_at?: string
          withdrawal_fee_percent?: number
          withdrawals_enabled?: boolean
        }
        Update: {
          announcement?: string
          deposit_fee_percent?: number
          deposits_enabled?: boolean
          fraud_detection_enabled?: boolean
          fraud_max_trades_per_minute?: number
          id?: boolean
          real_daily_loss_cap?: number
          real_market_exposure_cap?: number
            real_max_stake?: number
            real_min_stake?: number
          real_monthly_loss_cap?: number
            real_trading_enabled?: boolean
          real_user_exposure_cap?: number
          real_weekly_loss_cap?: number
          robot_enabled?: boolean
          trading_enabled?: boolean
          updated_at?: string
          withdrawal_fee_percent?: number
          withdrawals_enabled?: boolean
        }
        Relationships: []
      }
      staff_invitations: {
        Row: {
          created_at: string
          email: string
          invited_by: string | null
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          email: string
          invited_by?: string | null
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          email?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          created_at: string
          id: string
          message: string
          reply: string
          status: string
          subject: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          reply?: string
          status?: string
          subject: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          reply?: string
          status?: string
          subject?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      request_funding_deposit: { Args: { p_method_id: string; p_amount: number; p_reference?: string }; Returns: string }
      request_funding_withdrawal: { Args: { p_method_id: string; p_amount: number; p_destination: string }; Returns: string }
      review_funding_transaction: { Args: { p_transaction_id: string; p_approve: boolean; p_note?: string }; Returns: undefined }
      open_real_trade: { Args: { p_user_id: string; p_symbol: string; p_inst_id: string; p_direction: string; p_stake: number; p_duration_seconds: number; p_entry_price: number; p_entry_price_ts: number; p_request_id: string; p_by_robot?: boolean }; Returns: string }
      settle_real_trade: { Args: { p_trade_id: string; p_close_price: number; p_close_candle_ts: number }; Returns: string }
      adjust_real_trading_reserve: { Args: { p_actor_id: string; p_delta: number; p_note: string }; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      my_referral_count: { Args: never; Returns: number }
      redeem_staff_invitation: { Args: never; Returns: undefined }
      revoke_staff: { Args: { target_user: string }; Returns: undefined }
      set_staff_role: {
        Args: {
          new_role: Database["public"]["Enums"]["app_role"]
          target_user: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "agent" | "support"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "agent", "support"],
    },
  },
} as const
