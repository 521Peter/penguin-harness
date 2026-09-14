/**
 * ticket-history.ts unit tests: how each action's note is read (a principal, a session id, a
 * column with or without its reason, a plain sentence), the order and keys of the rows the
 * drawer lists, and the counts the summary fold shows.
 */
import { describe, expect, it } from "vitest";
import type { OrgTicketDetail, OrgTicketHistoryEntry } from "@prismshadow/penguin-server/api";
import {
  ticketHistoryNote,
  ticketHistoryRows,
  ticketSummaryCounts,
} from "../src/features/company/ticket-history";

const entry = (over: Partial<OrgTicketHistoryEntry> = {}): OrgTicketHistoryEntry => ({
  at: "2026-09-08T10:00:00.000Z",
  by: "user:alice",
  action: "created",
  ...over,
});

describe("ticketHistoryNote", () => {
  it("reads nothing where the action wrote nothing", () => {
    expect(ticketHistoryNote(entry())).toEqual({ kind: "none" });
    expect(ticketHistoryNote(entry({ action: "unblocked" }))).toEqual({ kind: "none" });
    expect(ticketHistoryNote(entry({ action: "moved", note: "" }))).toEqual({ kind: "none" });
  });

  it("reads an assignment's note as the principal it names", () => {
    expect(ticketHistoryNote(entry({ action: "assigned", note: "agent:mk_dev" }))).toEqual({
      kind: "principal",
      principal: "agent:mk_dev",
    });
  });

  it("reads a started or attached session's note as a session id", () => {
    expect(ticketHistoryNote(entry({ action: "session_started", note: "s-1" }))).toEqual({
      kind: "session",
      sessionId: "s-1",
    });
    expect(ticketHistoryNote(entry({ action: "session_attached", note: "s-2" }))).toEqual({
      kind: "session",
      sessionId: "s-2",
    });
  });

  it("reads a move's note as the column, with the reason it carried", () => {
    expect(ticketHistoryNote(entry({ action: "moved", note: "in_progress" }))).toEqual({
      kind: "column",
      status: "in_progress",
    });
    expect(ticketHistoryNote(entry({ action: "moved", note: "rejected: out of scope" }))).toEqual({
      kind: "column",
      status: "rejected",
      reason: "out of scope",
    });
    // A note that names no column is left as it was written.
    expect(ticketHistoryNote(entry({ action: "moved", note: "somewhere else" }))).toEqual({
      kind: "text",
      text: "somewhere else",
    });
  });

  it("leaves every other note as its sentence", () => {
    expect(ticketHistoryNote(entry({ action: "blocked", note: "waiting (by user:bob)" }))).toEqual({
      kind: "text",
      text: "waiting (by user:bob)",
    });
    expect(ticketHistoryNote(entry({ action: "progress", note: "drafted the schema" }))).toEqual({
      kind: "text",
      text: "drafted the schema",
    });
    expect(ticketHistoryNote(entry({ action: "edited", note: "title, due" }))).toEqual({
      kind: "text",
      text: "title, due",
    });
  });
});

describe("ticketHistoryRows", () => {
  it("lists the newest first and keys every row apart", () => {
    const rows = ticketHistoryRows([
      entry({ at: "2026-09-08T10:00:00.000Z", action: "created" }),
      entry({ at: "2026-09-08T11:00:00.000Z", action: "moved", note: "in_progress" }),
      entry({ at: "2026-09-08T11:00:00.000Z", action: "moved", note: "review" }),
    ]);
    expect(rows.map((r) => r.action)).toEqual(["moved", "moved", "created"]);
    expect(rows[0]!.note).toEqual({ kind: "column", status: "review" });
    expect(new Set(rows.map((r) => r.key)).size).toBe(3);
  });

  it("is empty for a ticket with no history", () => {
    expect(ticketHistoryRows([])).toEqual([]);
  });
});

describe("ticketSummaryCounts", () => {
  const detail = (
    children: string[],
    sessions: number,
  ): Pick<OrgTicketDetail, "children" | "sessionItems"> => ({
    children,
    sessionItems: Array.from({ length: sessions }, (_, i) => ({
      sessionId: `s${i}`,
      agentId: "mk_dev",
      status: "idle" as const,
    })),
  });

  it("counts the children and the contributing sessions", () => {
    expect(ticketSummaryCounts(detail(["a", "b"], 3))).toEqual({
      children: 2,
      sessions: 3,
      empty: false,
    });
  });

  it("is empty only when there is neither", () => {
    expect(ticketSummaryCounts(detail([], 0))).toEqual({ children: 0, sessions: 0, empty: true });
    expect(ticketSummaryCounts(detail([], 1)).empty).toBe(false);
    expect(ticketSummaryCounts(detail(["a"], 0)).empty).toBe(false);
  });
});
