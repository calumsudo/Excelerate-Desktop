/**
 * Database admin service — CRUD for the lookup tables (industries, states,
 * funders) and the shared soft-delete lifecycle.
 *
 * Nothing here ever issues a DELETE: rows are soft-deleted by flipping
 * is_deleted (a DB trigger stamps deleted_at) and restored the same way.
 * Rows soft-deleted for 30+ days are hard-deleted by the DB's daily
 * purge_soft_deleted() job, so "Recently Deleted" shows a countdown.
 *
 * Lookup writes are admin-only at the RLS level; merchants/deals restore is
 * gated by portfolio access like the rest of their CRUD.
 */
import { supabase } from "./supabase";

export const PURGE_DAYS = 30;

export interface IndustryRow {
  id: number;
  name: string;
}

export interface StateRow {
  id: number;
  code: string;
  name: string;
}

export interface FunderRow {
  id: number;
  name: string;
  code: string | null;
  sheet_name: string | null;
}

export type LookupTable = "industries" | "states" | "funders";
export type SoftDeleteTable = LookupTable | "merchants" | "deals";

export interface DeletedRow {
  table: SoftDeleteTable;
  id: number | string;
  /** Primary display text (name, or merchant + advance id for deals). */
  label: string;
  /** Secondary display text (code, sheet name, …). */
  detail: string | null;
  deleted_at: string;
}

export function daysUntilPurge(deletedAt: string): number {
  const purgeAt = new Date(deletedAt).getTime() + PURGE_DAYS * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((purgeAt - Date.now()) / (24 * 60 * 60 * 1000)));
}

export class DatabaseAdminService {
  static async listIndustries(): Promise<IndustryRow[]> {
    const { data, error } = await supabase
      .from("industries")
      .select("id, name")
      .eq("is_deleted", false)
      .order("name");
    if (error) throw new Error(`Failed to load industries: ${error.message}`);
    return data ?? [];
  }

  static async listStates(): Promise<StateRow[]> {
    const { data, error } = await supabase
      .from("states")
      .select("id, code, name")
      .eq("is_deleted", false)
      .order("code");
    if (error) throw new Error(`Failed to load states: ${error.message}`);
    return data ?? [];
  }

  static async listFunders(): Promise<FunderRow[]> {
    const { data, error } = await supabase
      .from("funders")
      .select("id, name, code, sheet_name")
      .eq("is_deleted", false)
      .order("name");
    if (error) throw new Error(`Failed to load funders: ${error.message}`);
    return data ?? [];
  }

  static async createIndustry(name: string): Promise<void> {
    const { error } = await supabase.from("industries").insert({ name: name.trim() });
    if (error) throw new Error(`Failed to create industry: ${error.message}`);
  }

  static async updateIndustry(id: number, name: string): Promise<void> {
    const { error } = await supabase.from("industries").update({ name: name.trim() }).eq("id", id);
    if (error) throw new Error(`Failed to update industry: ${error.message}`);
  }

  static async createState(code: string, name: string): Promise<void> {
    const { error } = await supabase
      .from("states")
      .insert({ code: code.trim().toUpperCase(), name: name.trim() });
    if (error) throw new Error(`Failed to create state: ${error.message}`);
  }

  static async updateState(id: number, code: string, name: string): Promise<void> {
    const { error } = await supabase
      .from("states")
      .update({ code: code.trim().toUpperCase(), name: name.trim() })
      .eq("id", id);
    if (error) throw new Error(`Failed to update state: ${error.message}`);
  }

  static async createFunder(
    name: string,
    code: string | null,
    sheetName: string | null
  ): Promise<void> {
    const { error } = await supabase.from("funders").insert({
      name: name.trim(),
      code: code?.trim() || null,
      sheet_name: sheetName?.trim() || null,
    });
    if (error) throw new Error(`Failed to create funder: ${error.message}`);
  }

  static async updateFunder(
    id: number,
    name: string,
    code: string | null,
    sheetName: string | null
  ): Promise<void> {
    const { error } = await supabase
      .from("funders")
      .update({
        name: name.trim(),
        code: code?.trim() || null,
        sheet_name: sheetName?.trim() || null,
      })
      .eq("id", id);
    if (error) throw new Error(`Failed to update funder: ${error.message}`);
  }

  /** Move a row to Recently Deleted. The deleted_at stamp comes from a DB trigger. */
  static async softDelete(table: SoftDeleteTable, id: number | string): Promise<void> {
    const { error } = await this.setDeleted(table, id, true);
    if (error) throw new Error(`Failed to delete: ${error.message}`);
  }

  /** Bring a soft-deleted row back; clears its purge countdown. */
  static async restore(table: SoftDeleteTable, id: number | string): Promise<void> {
    const { error } = await this.setDeleted(table, id, false);
    if (error) throw new Error(`Failed to restore: ${error.message}`);
  }

  private static setDeleted(table: SoftDeleteTable, id: number | string, isDeleted: boolean) {
    // One branch per table keeps the typed client happy (each table has its
    // own Update type) and pins ids to the right runtime type.
    switch (table) {
      case "industries":
        return supabase.from("industries").update({ is_deleted: isDeleted }).eq("id", Number(id));
      case "states":
        return supabase.from("states").update({ is_deleted: isDeleted }).eq("id", Number(id));
      case "funders":
        return supabase.from("funders").update({ is_deleted: isDeleted }).eq("id", Number(id));
      case "merchants":
        return supabase.from("merchants").update({ is_deleted: isDeleted }).eq("id", String(id));
      case "deals":
        return supabase.from("deals").update({ is_deleted: isDeleted }).eq("id", String(id));
    }
  }

  /** Everything currently in the recycle bin, most recently deleted first. */
  static async listRecentlyDeleted(): Promise<DeletedRow[]> {
    const [industries, states, funders, merchants, deals] = await Promise.all([
      supabase.from("industries").select("id, name, deleted_at").eq("is_deleted", true),
      supabase.from("states").select("id, code, name, deleted_at").eq("is_deleted", true),
      supabase.from("funders").select("id, name, code, deleted_at").eq("is_deleted", true),
      supabase.from("merchants").select("id, name, deleted_at").eq("is_deleted", true),
      supabase
        .from("deals")
        .select("id, advance_id, deleted_at, merchants(name)")
        .eq("is_deleted", true),
    ]);

    const firstError =
      industries.error ?? states.error ?? funders.error ?? merchants.error ?? deals.error;
    if (firstError) throw new Error(`Failed to load recently deleted: ${firstError.message}`);

    const rows: DeletedRow[] = [
      ...(industries.data ?? []).map((r) => ({
        table: "industries" as const,
        id: r.id,
        label: r.name,
        detail: null,
        deleted_at: r.deleted_at ?? "",
      })),
      ...(states.data ?? []).map((r) => ({
        table: "states" as const,
        id: r.id,
        label: r.name,
        detail: r.code,
        deleted_at: r.deleted_at ?? "",
      })),
      ...(funders.data ?? []).map((r) => ({
        table: "funders" as const,
        id: r.id,
        label: r.name,
        detail: r.code,
        deleted_at: r.deleted_at ?? "",
      })),
      ...(merchants.data ?? []).map((r) => ({
        table: "merchants" as const,
        id: r.id,
        label: r.name,
        detail: null,
        deleted_at: r.deleted_at ?? "",
      })),
      ...(deals.data ?? []).map((r) => ({
        table: "deals" as const,
        id: r.id,
        label: (r.merchants as { name: string } | null)?.name ?? "Unknown merchant",
        detail: r.advance_id ? `Advance ${r.advance_id}` : null,
        deleted_at: r.deleted_at ?? "",
      })),
    ];

    return rows.sort((a, b) => b.deleted_at.localeCompare(a.deleted_at));
  }
}
