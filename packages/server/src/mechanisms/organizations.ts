/**
 * The organizations mechanisms (company mode): what a node may require, declared apart from
 * what implements it.
 */
import { Interface } from "@prismshadow/penguin-core/kernel";
import type { Opaque } from "@prismshadow/penguin-core/kernel";
import type { OrgCalendarOutcome } from "../api/types.js";
import type {
  OrgBudgetStateRow,
  OrgCalendarStateRow,
  OrgDeskNoticeRow,
  OrgSessionOwner,
  OrgSessionRow,
  OrgTicketSessionRow,
  OrgTicketStateRow,
} from "../db/repos/organizations.js";
import type { OrganizationService } from "../runtime/organization/service.js";

/**
 * OrgCache: the mechanism OrgCacheRepo implements — the company-mode caches. The organization
 * runtime uses all of it; the rest of the server reads which organization owns a Session,
 * resets the @-chain on a person's message, and cleans up when a Project is destroyed.
 */
export abstract class OrgCache extends Interface<{
  deskSessions(projectId: string, orgId: string): OrgSessionRow[];
  syncDeskSessions(
    projectId: string,
    orgId: string,
    rows: Array<{ sessionId: string; agentId: string; current: boolean }>,
  ): void;
  ticketSessions(projectId: string, orgId: string): OrgTicketSessionRow[];
  syncTicketSessions(
    projectId: string,
    orgId: string,
    rows: Array<{ ticketId: string; sessionId: string; agentId: string }>,
  ): void;
  addTicketSession(
    projectId: string,
    orgId: string,
    ticketId: string,
    sessionId: string,
    agentId: string,
  ): void;
  ownerOfSession(sessionId: string): OrgSessionOwner | null;
  orgIdsOfProject(projectId: string): Opaque<"OrgIdsOfProject", Map<string, string>>;
  setTriggerHop(sessionId: string, hop: number): void;
  findCalendar(
    projectId: string,
    orgId: string,
    agentId: string,
    name: string,
  ): OrgCalendarStateRow | null;
  listCalendar(projectId: string, orgId: string): OrgCalendarStateRow[];
  registerCalendar(args: {
    projectId: string;
    orgId: string;
    agentId: string;
    name: string;
    startAtMs: number;
    defHash: string;
  }): { row: OrgCalendarStateRow; fresh: boolean };
  markCalendarSlot(
    projectId: string,
    orgId: string,
    agentId: string,
    name: string,
    slotMs: number,
  ): void;
  markCalendarFired(
    projectId: string,
    orgId: string,
    agentId: string,
    name: string,
    firedAt: string,
    oneShot: boolean,
  ): void;
  markCalendarMissed(projectId: string, orgId: string, agentId: string, name: string): void;
  markCalendarOutcome(
    projectId: string,
    orgId: string,
    agentId: string,
    name: string,
    outcome: OrgCalendarOutcome,
  ): void;
  deleteMissingCalendar(
    projectId: string,
    orgId: string,
    present: Array<{ agentId: string; name: string }>,
  ): void;
  deleteCalendar(projectId: string, orgId: string, agentId: string, name: string): void;
  findTicketState(projectId: string, orgId: string, ticketId: string): OrgTicketStateRow | null;
  upsertTicketState(row: OrgTicketStateRow): void;
  deleteMissingTicketState(projectId: string, orgId: string, presentIds: string[]): void;
  channelOffset(projectId: string, orgId: string, channelId: string, date: string): number;
  setChannelOffset(
    projectId: string,
    orgId: string,
    channelId: string,
    date: string,
    offset: number,
  ): void;
  readCursor(projectId: string, orgId: string, channelId: string, userId: string): string | null;
  setReadCursor(
    projectId: string,
    orgId: string,
    channelId: string,
    userId: string,
    lastReadId: string,
  ): void;
  budgetState(
    projectId: string,
    orgId: string,
    agentId: string,
    period: string,
  ): OrgBudgetStateRow | null;
  listBudgetStates(projectId: string, orgId: string, period: string): OrgBudgetStateRow[];
  markBudget(
    projectId: string,
    orgId: string,
    agentId: string,
    period: string,
    patch: { warnedAt?: string | null; pausedAt?: string | null },
  ): void;
  queueDeskNotice(row: Omit<OrgDeskNoticeRow, "seq">): void;
  takeDeskNotices(projectId: string, orgId: string, agentId: string): OrgDeskNoticeRow[];
  deleteDeskNotices(projectId: string, orgId: string, agentId: string): void;
  deleteOrg(projectId: string, orgId: string): void;
  deleteProject(projectId: string): void;
}>() {}

/** Organizations: what the organization routes call on the runtime's service. */
export abstract class Organizations extends Interface<
  Pick<
    OrganizationService,
    | "list"
    | "create"
    | "suggestId"
    | "detail"
    | "patch"
    | "chart"
    | "hire"
    | "patchEmployee"
    | "leave"
    | "desk"
    | "handbook"
    | "writeHandbook"
    | "handbookFiles"
    | "handbookFile"
    | "writeHandbookFile"
    | "deleteHandbookFile"
    | "calendar"
    | "upsertCalendar"
    | "deleteCalendar"
    | "tickets"
    | "createTicket"
    | "ticket"
    | "updateTicket"
    | "moveTicket"
    | "blockTicket"
    | "unblockTicket"
    | "progressTicket"
    | "startTicket"
    | "attachTicket"
    | "channels"
    | "createChannel"
    | "channel"
    | "patchChannel"
    | "addChannelMember"
    | "removeChannelMember"
    | "channelMessages"
    | "sendChannelMessage"
    | "markRead"
    | "finance"
    | "sessions"
  >
>() {}
