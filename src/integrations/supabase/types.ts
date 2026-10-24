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
      audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      bot_execution_locks: {
        Row: {
          acquired_at: string
          owner: string
          phase: string
          user_id: string
          wallet_scope: string
        }
        Insert: {
          acquired_at?: string
          owner: string
          phase?: string
          user_id: string
          wallet_scope?: string
        }
        Update: {
          acquired_at?: string
          owner?: string
          phase?: string
          user_id?: string
          wallet_scope?: string
        }
        Relationships: []
      }
      bot_wallets: {
        Row: {
          address: string
          created_at: string
          enc_key: string
          user_id: string
          wallet_scope: string
        }
        Insert: {
          address: string
          created_at?: string
          enc_key: string
          user_id: string
          wallet_scope?: string
        }
        Update: {
          address?: string
          created_at?: string
          enc_key?: string
          user_id?: string
          wallet_scope?: string
        }
        Relationships: []
      }
      execution_submissions: {
        Row: {
          checked_at: string | null
          created_at: string
          finished_at: string | null
          id: string
          intent: Json
          lock_owner: string
          nonce: number
          receipt: Json | null
          tx_hash: string
          user_id: string
          wallet_scope: string
        }
        Insert: {
          checked_at?: string | null
          created_at?: string
          finished_at?: string | null
          id: string
          intent: Json
          lock_owner: string
          nonce: number
          receipt?: Json | null
          tx_hash: string
          user_id: string
          wallet_scope?: string
        }
        Update: {
          checked_at?: string | null
          created_at?: string
          finished_at?: string | null
          id?: string
          intent?: Json
          lock_owner?: string
          nonce?: number
          receipt?: Json | null
          tx_hash?: string
          user_id?: string
          wallet_scope?: string
        }
        Relationships: []
      }
      grid_bots: {
        Row: {
          archived_at: string | null
          armed: boolean
          gas_reserve_bnb: number
          id: string
          last_error: string | null
          last_level: number | null
          last_price: number | null
          last_reason: string | null
          last_run_at: string | null
          levels: number
          lower_price: number
          max_impact_pct: number
          max_slippage_pct: number
          mode: string
          order_bnb: number
          strat_state: Json
          token: string
          updated_at: string
          upper_price: number
          user_id: string
          wallet_scope: string
        }
        Insert: {
          archived_at?: string | null
          armed?: boolean
          gas_reserve_bnb?: number
          id?: string
          last_error?: string | null
          last_level?: number | null
          last_price?: number | null
          last_reason?: string | null
          last_run_at?: string | null
          levels?: number
          lower_price?: number
          max_impact_pct?: number
          max_slippage_pct?: number
          mode?: string
          order_bnb?: number
          strat_state?: Json
          token: string
          updated_at?: string
          upper_price?: number
          user_id: string
          wallet_scope?: string
        }
        Update: {
          archived_at?: string | null
          armed?: boolean
          gas_reserve_bnb?: number
          id?: string
          last_error?: string | null
          last_level?: number | null
          last_price?: number | null
          last_reason?: string | null
          last_run_at?: string | null
          levels?: number
          lower_price?: number
          max_impact_pct?: number
          max_slippage_pct?: number
          mode?: string
          order_bnb?: number
          strat_state?: Json
          token?: string
          updated_at?: string
          upper_price?: number
          user_id?: string
          wallet_scope?: string
        }
        Relationships: []
      }
      internal_tokens: {
        Row: {
          name: string
          token: string
        }
        Insert: {
          name: string
          token?: string
        }
        Update: {
          name?: string
          token?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          link: string | null
          push_attempts: number
          push_claimed_at: string | null
          push_sent_at: string | null
          read: boolean
          title: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          link?: string | null
          push_attempts?: number
          push_claimed_at?: string | null
          push_sent_at?: string | null
          read?: boolean
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          link?: string | null
          push_attempts?: number
          push_claimed_at?: string | null
          push_sent_at?: string | null
          read?: boolean
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          accounting_status: string
          actual_bnb_received: number | null
          actual_token_delta: string | null
          amount_in: string
          amount_out_min: string
          approve_hash: string | null
          block_number: number | null
          created_at: string
          deadline: number
          error: string | null
          gas_bnb: number | null
          id: string
          pair_address: string | null
          quoted_out: string
          side: string
          slippage_pct: number
          source: string
          status: string
          token: string
          tx_hash: string | null
          updated_at: string
          user_id: string
          wallet: string
          wallet_scope: string
        }
        Insert: {
          accounting_status?: string
          actual_bnb_received?: number | null
          actual_token_delta?: string | null
          amount_in: string
          amount_out_min: string
          approve_hash?: string | null
          block_number?: number | null
          created_at?: string
          deadline: number
          error?: string | null
          gas_bnb?: number | null
          id?: string
          pair_address?: string | null
          quoted_out: string
          side: string
          slippage_pct: number
          source?: string
          status?: string
          token?: string
          tx_hash?: string | null
          updated_at?: string
          user_id: string
          wallet: string
          wallet_scope?: string
        }
        Update: {
          accounting_status?: string
          actual_bnb_received?: number | null
          actual_token_delta?: string | null
          amount_in?: string
          amount_out_min?: string
          approve_hash?: string | null
          block_number?: number | null
          created_at?: string
          deadline?: number
          error?: string | null
          gas_bnb?: number | null
          id?: string
          pair_address?: string | null
          quoted_out?: string
          side?: string
          slippage_pct?: number
          source?: string
          status?: string
          token?: string
          tx_hash?: string | null
          updated_at?: string
          user_id?: string
          wallet?: string
          wallet_scope?: string
        }
        Relationships: []
      }
      price_alerts: {
        Row: {
          base_price: number
          created_at: string
          direction: string
          enabled: boolean
          id: string
          last_checked_at: string | null
          last_price: number | null
          last_state: string
          symbol: string
          target_pct: number
          token_address: string
          user_id: string
          warn_before_pct: number
        }
        Insert: {
          base_price: number
          created_at?: string
          direction?: string
          enabled?: boolean
          id?: string
          last_checked_at?: string | null
          last_price?: number | null
          last_state?: string
          symbol: string
          target_pct: number
          token_address: string
          user_id: string
          warn_before_pct?: number
        }
        Update: {
          base_price?: number
          created_at?: string
          direction?: string
          enabled?: boolean
          id?: string
          last_checked_at?: string | null
          last_price?: number | null
          last_state?: string
          symbol?: string
          target_pct?: number
          token_address?: string
          user_id?: string
          warn_before_pct?: number
        }
        Relationships: []
      }
      price_candles: {
        Row: {
          candles: Json
          pool: string
          token: string
          updated_at: string
        }
        Insert: {
          candles?: Json
          pool: string
          token: string
          updated_at?: string
        }
        Update: {
          candles?: Json
          pool?: string
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      push_devices: {
        Row: {
          created_at: string
          id: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      sim_accounts: {
        Row: {
          archived: boolean
          cost_basis: number
          created_at: string
          fees_paid: number
          id: string
          initial_quote: number
          quote_balance: number
          quote_symbol: string
          realized_pnl: number
          revision: number
          token: string | null
          token_balance: number
          user_id: string
        }
        Insert: {
          archived?: boolean
          cost_basis?: number
          created_at?: string
          fees_paid?: number
          id?: string
          initial_quote: number
          quote_balance: number
          quote_symbol?: string
          realized_pnl?: number
          revision?: number
          token?: string | null
          token_balance?: number
          user_id: string
        }
        Update: {
          archived?: boolean
          cost_basis?: number
          created_at?: string
          fees_paid?: number
          id?: string
          initial_quote?: number
          quote_balance?: number
          quote_symbol?: string
          realized_pnl?: number
          revision?: number
          token?: string | null
          token_balance?: number
          user_id?: string
        }
        Relationships: []
      }
      sim_trades: {
        Row: {
          account_id: string
          created_at: string
          fee: number
          gas_estimate: number
          id: string
          pair_address: string | null
          price: number
          quote_amount: number
          realized_pnl: number
          reason: string | null
          request_id: string | null
          side: string
          slippage_pct: number
          token_amount: number
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          fee: number
          gas_estimate?: number
          id?: string
          pair_address?: string | null
          price: number
          quote_amount: number
          realized_pnl?: number
          reason?: string | null
          request_id?: string | null
          side: string
          slippage_pct: number
          token_amount: number
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          fee?: number
          gas_estimate?: number
          id?: string
          pair_address?: string | null
          price?: number
          quote_amount?: number
          realized_pnl?: number
          reason?: string | null
          request_id?: string | null
          side?: string
          slippage_pct?: number
          token_amount?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sim_trades_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "sim_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      strategies: {
        Row: {
          config: Json
          id: string
          mode: string
          pair_address: string | null
          status: string
          token: string
          tracked_wallet: string | null
          updated_at: string
          user_id: string
          version: number
          wallet_scope: string
        }
        Insert: {
          config?: Json
          id?: string
          mode?: string
          pair_address?: string | null
          status?: string
          token?: string
          tracked_wallet?: string | null
          updated_at?: string
          user_id: string
          version?: number
          wallet_scope?: string
        }
        Update: {
          config?: Json
          id?: string
          mode?: string
          pair_address?: string | null
          status?: string
          token?: string
          tracked_wallet?: string | null
          updated_at?: string
          user_id?: string
          version?: number
          wallet_scope?: string
        }
        Relationships: []
      }
      strategy_drafts: {
        Row: {
          base_version: number
          config: Json
          revision: number
          token: string
          tracked_wallet: string | null
          updated_at: string
          user_id: string
          wallet_scope: string
        }
        Insert: {
          base_version: number
          config: Json
          revision: number
          token: string
          tracked_wallet?: string | null
          updated_at?: string
          user_id: string
          wallet_scope?: string
        }
        Update: {
          base_version?: number
          config?: Json
          revision?: number
          token?: string
          tracked_wallet?: string | null
          updated_at?: string
          user_id?: string
          wallet_scope?: string
        }
        Relationships: []
      }
      user_tokens: {
        Row: {
          address: string
          created_at: string
          decimals: number
          id: string
          name: string
          symbol: string
          user_id: string
        }
        Insert: {
          address: string
          created_at?: string
          decimals: number
          id?: string
          name: string
          symbol: string
          user_id: string
        }
        Update: {
          address?: string
          created_at?: string
          decimals?: number
          id?: string
          name?: string
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
      user_wallets: {
        Row: {
          address: string
          created_at: string
          id: string
          label: string
          user_id: string
        }
        Insert: {
          address: string
          created_at?: string
          id?: string
          label?: string
          user_id: string
        }
        Update: {
          address?: string
          created_at?: string
          id?: string
          label?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_sim_trade: {
        Args: {
          p_account: string
          p_next: Json
          p_request: string
          p_revision: number
          p_token: string
          p_trade: Json
          p_user: string
        }
        Returns: undefined
      }
      apply_strategy_with_draft: {
        Args: {
          p_config: Json
          p_draft_revision: number
          p_token: string
          p_user: string
          p_version: number
          p_wallet: string
        }
        Returns: undefined
      }
      apply_strategy_with_draft_scoped: {
        Args: {
          p_config: Json
          p_draft_revision: number
          p_scope: string
          p_token: string
          p_user: string
          p_version: number
          p_wallet: string
        }
        Returns: undefined
      }
      complete_execution_submission: {
        Args: { p_id: string; p_order: Json; p_patch: Json; p_receipt: Json }
        Returns: undefined
      }
      configure_guided_bot: {
        Args: {
          p_config: Json
          p_draft_revision: number
          p_grid: Json
          p_scope: string
          p_token: string
          p_user: string
          p_version: number
        }
        Returns: string
      }
      record_alert_transition: {
        Args: {
          p_body: string
          p_checked: string
          p_id: string
          p_next: string
          p_previous: string
          p_price: number
          p_title: string
        }
        Returns: boolean
      }
      recover_preflight_execution: {
        Args: { p_scope: string; p_user: string }
        Returns: boolean
      }
      remove_paused_bot: {
        Args: { p_bot: string; p_scope: string; p_user: string }
        Returns: undefined
      }
      reset_strategy_configuration: {
        Args: { p_scope?: string; p_user: string }
        Returns: Json
      }
      save_strategy_draft: {
        Args: {
          p_base_version: number
          p_config: Json
          p_revision: number
          p_token: string
          p_user: string
          p_wallet: string
        }
        Returns: number
      }
      save_strategy_draft_scoped: {
        Args: {
          p_base_version: number
          p_config: Json
          p_revision: number
          p_scope: string
          p_token: string
          p_user: string
          p_wallet: string
        }
        Returns: number
      }
      save_user_strategy: {
        Args: {
          p_config: Json
          p_token: string
          p_user: string
          p_version: number
          p_wallet: string
        }
        Returns: undefined
      }
      save_user_strategy_scoped: {
        Args: {
          p_config: Json
          p_scope: string
          p_token: string
          p_user: string
          p_version: number
          p_wallet: string
        }
        Returns: undefined
      }
      start_checked_bot: {
        Args: {
          p_bot: string
          p_scope: string
          p_updated_at: string
          p_user: string
          p_version: number
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
