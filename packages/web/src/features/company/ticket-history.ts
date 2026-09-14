/**
 * The drawer's two folded sections, shaped (pure, unit tested): the operation history the
 * ticket's frontmatter carries — newest first, each note read according to the action that
 * wrote it, so a session id becomes a link and a move names its column — and the counts the
 * summary fold shows in its header.
 */
import type {
  OrgTicketDetail,
  OrgTicketHistoryAction,
  OrgTicketHistoryEntry,
  OrgTicketStatus,
} from "@prismshadow/penguin-server/api";
import { isTicketStatus } from "./ticket-board";

/**
 * What a history entry's `note` holds, by the action that wrote it: nothing, a principal (an
 * assignment), a session id (a session started or attached), the column a move landed in with
 * the reason it carried, or a plain sentence (a block reason, a progress line, an edit's
 * field list). The renderer decides how each is drawn; the reading is done here.
 */
export type TicketHistoryNote =
  | { kind: "none" }
  | { kind: "text"; text: string }
  | { kind: "principal"; principal: string }
  | { kind: "session"; sessionId: string }
  | { kind: "column"; status: OrgTicketStatus; reason?: string };

export interface TicketHistoryRow {
  /** Stable across refetches: the entries themselves carry no id. */
  key: string;
  at: string;
  by: string;
  action: OrgTicketHistoryAction;
  note: TicketHistoryNote;
}

export function ticketHistoryNote(entry: OrgTicketHistoryEntry): TicketHistoryNote {
  const note = entry.note ?? "";
  if (note === "") return { kind: "none" };
  switch (entry.action) {
    case "assigned":
      return { kind: "principal", principal: note };
    case "session_started":
    case "session_attached":
      return { kind: "session", sessionId: note };
    case "moved": {
      // `<column>` or `<column>: <reason>`, as the server writes a move.
      const m = /^([a-z_]+)(?::\s*(.*))?$/.exec(note);
      const status = m?.[1] ?? "";
      if (!isTicketStatus(status)) return { kind: "text", text: note };
      const reason = (m?.[2] ?? "").trim();
      return { kind: "column", status, ...(reason !== "" ? { reason } : {}) };
    }
    default:
      return { kind: "text", text: note };
  }
}

/** The history as the drawer lists it: newest first, each note already read. */
export function ticketHistoryRows(history: readonly OrgTicketHistoryEntry[]): TicketHistoryRow[] {
  return history
    .map((entry, i) => ({
      key: `${i}-${entry.at}-${entry.action}`,
      at: entry.at,
      by: entry.by,
      action: entry.action,
      note: ticketHistoryNote(entry),
    }))
    .reverse();
}

export interface TicketSummaryCounts {
  children: number;
  sessions: number;
  /** Nothing to count: the fold still shows, with "none" where the counts would be. */
  empty: boolean;
}

/** What the summary fold's header counts: the child tickets and the contributing sessions. */
export function ticketSummaryCounts(
  detail: Pick<OrgTicketDetail, "children" | "sessionItems">,
): TicketSummaryCounts {
  const children = detail.children.length;
  const sessions = detail.sessionItems.length;
  return { children, sessions, empty: children === 0 && sessions === 0 };
}
