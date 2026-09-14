/**
 * A ticket's detail, in a right-hand drawer over the board. The header names the ticket
 * (status, priority, id with a copy button, cost); the blocked strip says why and on whom
 * it waits; then the sections in reading order — the header fields (the one owner, parent,
 * notify, due, created), the goal, the acceptance criteria, the progress prose with its
 * one-line append, the result, and under them two disclosures folded on every visit: the
 * summary (child tickets with the rolled-up cost, contributing sessions with the start and
 * attach controls) and the operation history, newest first. Each editable section edits in
 * place with its own save / cancel; the footer holds the block / unblock and move actions.
 * Saves confirm first, like every organization write.
 */
import { Fragment, useCallback, useEffect, useId, useState } from "react";
import { useNavigate } from "react-router";
import type {
  OrgEmployeeItem,
  OrgTicketDetail,
  OrgTicketItem,
  OrgTicketPriority,
  OrgTicketStatus,
  OrgTicketUpdateRequest,
} from "@prismshadow/penguin-server/api";
import type { ReactNode } from "react";
import * as api from "../../api/endpoints";
import { S } from "../../lib/strings";
import { apiErrorText } from "../../lib/api-error";
import { formatDateTime, formatMoney } from "../../lib/format";
import { ICON_GAP, ICON_SIZE } from "../../lib/icon-scale";
import { toneInk, toneStrip } from "../../lib/tone";
import { useAuth } from "../../state/auth";
import { useSessions } from "../../state/sessions";
import { useTheme } from "../../state/theme";
import { Drawer } from "../../components/ui/drawer";
import { Button } from "../../components/ui/button";
import { Chevron } from "../../components/ui/chevron";
import { Input, Textarea } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { Segmented } from "../../components/ui/segmented";
import { FieldLabel } from "../../components/ui/field";
import { ConfirmModal } from "../../components/ui/confirm-modal";
import { Modal } from "../../components/ui/modal";
import { Skeleton } from "../../components/ui/skeleton";
import { CopyButton, ROW_COPY_CLASS } from "../../components/ui/copy-button";
import { SessionActivityIcon } from "../../components/ui/session-activity-icon";
import { toastError, toastInfo, toastSuccess } from "../../components/ui/toast";
import { Md } from "../chat/md";
import { OrgSection } from "./org-layout";
import {
  BlockedBadge,
  PrincipalChip,
  PriorityBadge,
  TicketStatusBadge,
  principalLabel,
} from "./shared";
import { agentPrincipal, splitPrincipalList } from "./principals";
import { orgRowActivity } from "./org-sessions";
import { TICKET_COLUMNS, isBlocked, isOverdue, ticketCreatedDate } from "./ticket-board";
import { ticketHistoryRows, ticketSummaryCounts } from "./ticket-history";
import type { TicketHistoryNote } from "./ticket-history";
import { dayKey } from "./calendar-geom";

const PRIORITIES: readonly OrgTicketPriority[] = ["P0", "P1", "P2"];

/** The sections that edit in place; one at a time, so a save always names what it rewrites. */
type Section = "summary" | "goal" | "acceptance" | "result";

interface SummaryDraft {
  title: string;
  owner: string;
  parent: string;
  notify: string;
  priority: OrgTicketPriority;
  due: string;
}

export function TicketDrawer({
  projectId,
  orgId,
  ticketId,
  employees,
  tickets,
  version,
  onClose,
  onChanged,
  onOpenTicket,
  onMove,
}: {
  projectId: string;
  orgId: string;
  /** Null closes the drawer. */
  ticketId: string | null;
  employees: readonly OrgEmployeeItem[];
  /** Every ticket of the board (the parent picker, the child list's titles). */
  tickets: readonly OrgTicketItem[];
  /** Bumped by the board when the ticket may have changed under the drawer. */
  version: number;
  onClose: () => void;
  onChanged: () => void;
  /** Jump to another ticket (a child, the parent) inside the same drawer. */
  onOpenTicket: (ticketId: string) => void;
  /** Hand a move to the board's confirm flow (the same dialog a drag-and-drop goes through). */
  onMove: (ticket: OrgTicketItem, to: OrgTicketStatus) => void;
}) {
  const navigate = useNavigate();
  const { currency } = useTheme();
  const { user } = useAuth();
  const { sessions } = useSessions();
  const me = user?.userId ?? null;
  const [detail, setDetail] = useState<OrgTicketDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Section | null>(null);
  const [summaryDraft, setSummaryDraft] = useState<SummaryDraft | null>(null);
  const [textDraft, setTextDraft] = useState("");
  const [pendingSave, setPendingSave] = useState<OrgTicketUpdateRequest | null>(null);
  const [confirmStart, setConfirmStart] = useState(false);
  const [confirmUnblock, setConfirmUnblock] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockReason, setBlockReason] = useState("");
  const [blockBy, setBlockBy] = useState("");
  const [progressText, setProgressText] = useState("");
  const [attachId, setAttachId] = useState("");
  const [moveTarget, setMoveTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const names = new Map(employees.map((e) => [e.agentId, e.name]));
  const titles = new Map(tickets.map((t) => [t.ticketId, t.title]));

  const load = useCallback(async () => {
    if (ticketId === null) return;
    try {
      setDetail(await api.getOrgTicket(projectId, orgId, ticketId));
      setError(null);
    } catch (e) {
      setError(apiErrorText(e));
    }
  }, [projectId, orgId, ticketId]);
  // Another ticket: start blank. A version bump on the same ticket refetches in place, so a
  // board event under an open drawer never flashes the skeleton or drops an edit in progress.
  useEffect(() => {
    setDetail(null);
    setError(null);
    setEditing(null);
    setMoveTarget("");
  }, [ticketId]);
  useEffect(() => {
    void load();
  }, [load, version]);

  const run = async (work: () => Promise<void>, done?: string) => {
    setBusy(true);
    try {
      await work();
      if (done !== undefined) toastSuccess(done);
      await load();
      onChanged();
    } catch (e) {
      toastError(apiErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (section: Section) => {
    if (detail === null) return;
    if (section === "summary") {
      setSummaryDraft({
        title: detail.title,
        owner: detail.owner,
        parent: detail.parent ?? "",
        notify: detail.notify.join(", "),
        priority: detail.priority,
        due: detail.due ?? "",
      });
    } else {
      setTextDraft(
        section === "goal"
          ? detail.goal
          : section === "acceptance"
            ? detail.acceptanceCriteria
            : detail.result,
      );
    }
    setEditing(section);
  };

  /** What the open section changed, as the update body; nothing changed → a toast, no dialog. */
  const requestSave = () => {
    if (detail === null || editing === null) return;
    const body: OrgTicketUpdateRequest = {};
    if (editing === "summary" && summaryDraft !== null) {
      const d = summaryDraft;
      if (d.title.trim() && d.title.trim() !== detail.title) body.title = d.title.trim();
      // A ticket always has an owner: an empty box is no change, never a clearing.
      if (d.owner !== "" && d.owner !== detail.owner) body.owner = d.owner;
      if (d.parent !== (detail.parent ?? "")) body.parent = d.parent === "" ? null : d.parent;
      const notify = splitPrincipalList(d.notify);
      if (notify.join(",") !== detail.notify.join(",")) body.notify = notify;
      if (d.priority !== detail.priority) body.priority = d.priority;
      if (d.due !== (detail.due ?? "")) body.due = d.due === "" ? null : d.due;
    } else if (editing === "goal" && textDraft !== detail.goal) {
      body.goal = textDraft;
    } else if (editing === "acceptance" && textDraft !== detail.acceptanceCriteria) {
      body.acceptanceCriteria = textDraft;
    } else if (editing === "result" && textDraft !== detail.result) {
      body.result = textDraft;
    }
    if (Object.keys(body).length === 0) {
      toastInfo(S.common.noChangesToSave);
      setEditing(null);
      return;
    }
    setPendingSave(body);
  };

  const commitSave = () => {
    if (detail === null || pendingSave === null) return;
    const body = pendingSave;
    setPendingSave(null);
    void run(async () => {
      await api.updateOrgTicket(projectId, orgId, detail.ticketId, body);
      setEditing(null);
    }, S.company.tickets.saved);
  };

  const addProgress = () => {
    if (detail === null || !progressText.trim() || busy) return;
    void run(async () => {
      await api.progressOrgTicket(projectId, orgId, detail.ticketId, {
        text: progressText.trim(),
      });
      setProgressText("");
    });
  };

  const attachable = sessions.filter((s) => !(detail?.sessions ?? []).includes(s.sessionId));
  const children = (detail?.children ?? []).map(
    (id) => tickets.find((t) => t.ticketId === id) ?? { ticketId: id, title: id },
  );
  const blocked = detail !== null && isBlocked(detail);
  const todayKey = dayKey(Date.now());
  const created = detail === null ? null : ticketCreatedDate(detail.ticketId);
  const counts = detail === null ? null : ticketSummaryCounts(detail);
  const history = detail === null ? [] : ticketHistoryRows(detail.history);
  const sessionTitles = new Map(
    (detail?.sessionItems ?? []).map((s) => [s.sessionId, s.title ?? s.sessionId]),
  );
  /** A history line's principal: the employee's name, "you" for the reader, else the user id. */
  const historyPrincipal = (principal: string) =>
    me !== null && principal === `user:${me}`
      ? S.company.channels.you
      : principalLabel(principal, names);
  /**
   * The owner picker's options. Employees first; a ticket owned by a person keeps that owner
   * on the list, so opening the form does not silently reassign it to the first employee.
   */
  const ownerOptions = [
    ...employees.map((e) => ({ value: agentPrincipal(e.agentId), label: e.name })),
    ...(detail !== null && !employees.some((e) => agentPrincipal(e.agentId) === detail.owner)
      ? [{ value: detail.owner, label: principalLabel(detail.owner, names) }]
      : []),
  ];

  /** A history note, drawn by what the action wrote there. */
  const noteNode = (note: TicketHistoryNote): ReactNode => {
    switch (note.kind) {
      case "none":
        return null;
      case "principal":
        return <span className="min-w-0">{historyPrincipal(note.principal)}</span>;
      case "session":
        return (
          <button
            type="button"
            className={`min-w-0 truncate ${toneInk.busy} hover:underline`}
            onClick={() => navigate(`/chat/${note.sessionId}`)}
          >
            {sessionTitles.get(note.sessionId) ?? note.sessionId}
          </button>
        );
      case "column":
        return (
          <span className="min-w-0">
            {S.company.tickets.columns[note.status] ?? note.status}
            {note.reason !== undefined && ` · ${note.reason}`}
          </span>
        );
      default:
        return <span className="min-w-0">{note.text}</span>;
    }
  };

  /** A section's trailing controls: an edit button at rest, cancel / save while it is open. */
  const sectionActions = (section: Section) =>
    editing === section ? (
      <>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(null)}>
          {S.common.cancel}
        </Button>
        <Button size="sm" variant="primary" disabled={busy} onClick={requestSave}>
          {S.common.save}
        </Button>
      </>
    ) : (
      <Button
        size="sm"
        variant="ghost"
        disabled={busy || editing !== null}
        onClick={() => startEdit(section)}
      >
        {S.common.edit}
      </Button>
    );

  /** A Markdown body, or its "nothing here yet" line; a textarea while the section is open. */
  const textSection = (section: Exclude<Section, "summary">, text: string, empty: string) =>
    editing === section ? (
      <Textarea
        size="sm"
        rows={6}
        aria-label={S.company.tickets[section]}
        value={textDraft}
        autoFocus
        onChange={(e) => setTextDraft(e.target.value)}
      />
    ) : text.trim() === "" ? (
      <p className="text-xs text-gray-400 dark:text-gray-500">{empty}</p>
    ) : (
      <div className="md-body text-sm leading-relaxed text-gray-800 dark:text-gray-100">
        <Md text={text} />
      </div>
    );

  const row = (label: string, value: ReactNode) => (
    <>
      <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="min-w-0 text-gray-800 dark:text-gray-100">{value}</dd>
    </>
  );

  return (
    <Drawer
      open={ticketId !== null}
      side="right"
      title={detail?.title ?? S.company.tickets.detail}
      onClose={onClose}
      widthClass="max-w-2xl"
    >
      <div className="flex min-h-full flex-col">
        <div className="flex-1 space-y-5 px-4 py-4">
          {error !== null && detail === null ? (
            <div
              className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs ${toneStrip.danger}`}
            >
              <span>{error}</span>
              <Button size="sm" onClick={() => void load()}>
                {S.common.retry}
              </Button>
            </div>
          ) : detail === null ? (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Skeleton className="h-5 w-14 rounded-full" />
                <Skeleton className="h-5 w-10 rounded-full" />
                <Skeleton className="h-5 w-40" />
              </div>
              <Skeleton className="h-28" />
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          ) : (
            <>
              {/* Identity line: status, priority, the blocked mark, the id with its copy, the cost. */}
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <TicketStatusBadge status={detail.status} />
                <PriorityBadge priority={detail.priority} />
                {blocked && (
                  <BlockedBadge
                    reason={detail.blocked ?? ""}
                    {...(detail.blockedBy !== undefined ? { by: detail.blockedBy } : {})}
                  />
                )}
                <span className="inline-flex items-center gap-0.5 font-mono">
                  {detail.ticketId}
                  <CopyButton
                    text={detail.ticketId}
                    label={S.company.tickets.copyId}
                    className={ROW_COPY_CLASS}
                  />
                </span>
                <span className="ml-auto tabular-nums">
                  {S.company.tickets.cost}{" "}
                  <span className="font-medium text-gray-700 dark:text-gray-200">
                    {formatMoney(detail.cost, currency)}
                  </span>
                  {" · "}
                  {S.company.tickets.rolledUpCost}{" "}
                  <span className="font-medium text-gray-700 dark:text-gray-200">
                    {formatMoney(detail.rolledUpCost, currency)}
                  </span>
                </span>
              </div>
              {detail.invalid !== undefined && (
                <div className={`rounded-md border px-3 py-2 text-xs ${toneStrip.danger}`}>
                  {detail.invalid}
                </div>
              )}
              {blocked && (
                <div
                  className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-xs ${toneStrip.attention}`}
                >
                  <span>
                    <span className="font-medium">{S.company.tickets.blockedReason}:</span>{" "}
                    {detail.blocked}
                  </span>
                  {detail.blockedBy !== undefined && (
                    <span className="inline-flex items-center gap-1">
                      {S.company.tickets.blockedBy}:{" "}
                      <PrincipalChip principal={detail.blockedBy} names={names} />
                    </span>
                  )}
                </div>
              )}

              {/* Summary: the header fields as a definition list, a form while editing. */}
              <OrgSection title={S.company.tickets.summary} actions={sectionActions("summary")}>
                {editing === "summary" && summaryDraft !== null ? (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <Input
                        size="sm"
                        label={S.company.tickets.ticketTitle}
                        required
                        value={summaryDraft.title}
                        onChange={(e) =>
                          setSummaryDraft({ ...summaryDraft, title: e.target.value })
                        }
                      />
                    </div>
                    <Select
                      size="sm"
                      label={S.company.tickets.owner}
                      value={summaryDraft.owner}
                      onChange={(e) => setSummaryDraft({ ...summaryDraft, owner: e.target.value })}
                    >
                      {ownerOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                    <Select
                      size="sm"
                      label={S.company.tickets.parent}
                      value={summaryDraft.parent}
                      onChange={(e) => setSummaryDraft({ ...summaryDraft, parent: e.target.value })}
                    >
                      <option value="">{S.company.tickets.noParent}</option>
                      {tickets
                        .filter((t) => t.ticketId !== detail.ticketId)
                        .map((t) => (
                          <option key={t.ticketId} value={t.ticketId}>
                            {t.title}
                          </option>
                        ))}
                    </Select>
                    <div>
                      <FieldLabel>{S.company.tickets.priority}</FieldLabel>
                      <Segmented
                        options={PRIORITIES.map((p) => ({ value: p, label: p }))}
                        value={summaryDraft.priority}
                        onChange={(priority) => setSummaryDraft({ ...summaryDraft, priority })}
                        cols={3}
                      />
                    </div>
                    <Input
                      size="sm"
                      label={S.company.tickets.due}
                      type="date"
                      value={summaryDraft.due}
                      className="font-mono"
                      onChange={(e) => setSummaryDraft({ ...summaryDraft, due: e.target.value })}
                    />
                    <div className="md:col-span-2">
                      <Input
                        size="sm"
                        label={S.company.tickets.notify}
                        value={summaryDraft.notify}
                        hint={S.company.tickets.notifyHint}
                        className="font-mono"
                        onChange={(e) =>
                          setSummaryDraft({ ...summaryDraft, notify: e.target.value })
                        }
                      />
                    </div>
                  </div>
                ) : (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
                    {row(
                      S.company.tickets.owner,
                      <PrincipalChip principal={detail.owner} names={names} />,
                    )}
                    {row(
                      S.company.tickets.parent,
                      detail.parent !== undefined ? (
                        <button
                          type="button"
                          className="text-left hover:underline"
                          title={detail.parent}
                          onClick={() => onOpenTicket(detail.parent!)}
                        >
                          {titles.get(detail.parent) ?? detail.parent}
                        </button>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500">
                          {S.company.tickets.noParent}
                        </span>
                      ),
                    )}
                    {row(
                      S.company.tickets.notify,
                      detail.notify.length === 0 ? (
                        <span className="text-gray-400 dark:text-gray-500">{S.common.none}</span>
                      ) : (
                        <span className="flex flex-wrap gap-x-3 gap-y-1">
                          {detail.notify.map((p) => (
                            <PrincipalChip key={p} principal={p} names={names} />
                          ))}
                        </span>
                      ),
                    )}
                    {row(
                      S.company.tickets.due,
                      detail.due !== undefined ? (
                        <span
                          className={`font-mono tabular-nums ${
                            isOverdue(detail.due, todayKey) &&
                            detail.status !== "done" &&
                            detail.status !== "rejected"
                              ? toneInk.danger
                              : ""
                          }`}
                        >
                          {detail.due}
                          {isOverdue(detail.due, todayKey) &&
                            detail.status !== "done" &&
                            detail.status !== "rejected" &&
                            ` · ${S.company.tickets.overdue}`}
                        </span>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500">
                          {S.company.tickets.noDue}
                        </span>
                      ),
                    )}
                    {created !== null &&
                      row(
                        S.common.created,
                        <span className="font-mono tabular-nums">{created}</span>,
                      )}
                  </dl>
                )}
              </OrgSection>

              <OrgSection title={S.company.tickets.goal} actions={sectionActions("goal")}>
                {textSection("goal", detail.goal, S.company.tickets.noGoal)}
              </OrgSection>

              <OrgSection
                title={S.company.tickets.acceptance}
                actions={sectionActions("acceptance")}
              >
                {textSection(
                  "acceptance",
                  detail.acceptanceCriteria,
                  S.company.tickets.noAcceptance,
                )}
              </OrgSection>

              {/* Progress: the sentences as written, oldest first, plus the one-line append.
                  Who wrote one and when is a history entry, not a chip on the sentence; the
                  bullets are md-compact so a one-line note reads as a line, not a paragraph. */}
              <OrgSection title={S.company.tickets.progress}>
                {detail.progress.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {S.company.tickets.progressEmpty}
                  </p>
                ) : (
                  <ul className="md-body md-compact list-disc pl-5 text-sm text-gray-800 marker:text-gray-400 dark:text-gray-100 dark:marker:text-gray-500">
                    {detail.progress.map((p, i) => (
                      <li key={`${i}-${p}`}>
                        <Md text={p} />
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <Input
                      size="sm"
                      aria-label={S.company.tickets.addProgress}
                      placeholder={S.company.tickets.progressPlaceholder}
                      value={progressText}
                      onChange={(e) => setProgressText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.nativeEvent.isComposing) addProgress();
                      }}
                    />
                  </div>
                  <Button size="sm" disabled={busy || !progressText.trim()} onClick={addProgress}>
                    {S.company.tickets.addProgress}
                  </Button>
                </div>
              </OrgSection>

              <OrgSection title={S.company.tickets.result} actions={sectionActions("result")}>
                {textSection("result", detail.result, S.company.tickets.noResult)}
              </OrgSection>

              {/* What hangs off the ticket rather than describing it: the children and the
                  sessions, folded together under one row so the prose above stays the page. */}
              <Fold
                title={S.company.tickets.summaryFold}
                summary={
                  counts === null || counts.empty
                    ? S.common.none
                    : S.company.tickets.summaryCounts(counts.children, counts.sessions)
                }
              >
                <FoldBlock
                  title={`${S.company.tickets.children} · ${S.company.tickets.rolledUpCost} ${formatMoney(detail.rolledUpCost, currency)}`}
                >
                  {children.length === 0 ? (
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {S.company.tickets.childrenEmpty}
                    </p>
                  ) : (
                    <ul className="space-y-0.5">
                      {children.map((c) => (
                        <li key={c.ticketId}>
                          <button
                            type="button"
                            onClick={() => onOpenTicket(c.ticketId)}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors duration-150 hover:bg-gray-100 dark:hover:bg-gray-800"
                          >
                            <span className="min-w-0 flex-1 truncate">{c.title}</span>
                            {"priority" in c && <PriorityBadge priority={c.priority} />}
                            {"status" in c && <TicketStatusBadge status={c.status} />}
                            {"cost" in c && (
                              <span className="shrink-0 font-mono text-[11px] tabular-nums text-gray-400 dark:text-gray-500">
                                {formatMoney(c.cost, currency)}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </FoldBlock>

                {/* Contributing sessions: open one, start another, attach an existing one. */}
                <FoldBlock
                  title={`${S.company.tickets.sessions} · ${S.company.tickets.sessionsCount(detail.sessionItems.length)}`}
                  actions={
                    <Button size="sm" disabled={busy} onClick={() => setConfirmStart(true)}>
                      {S.company.tickets.startSession}
                    </Button>
                  }
                >
                  {detail.sessionItems.length === 0 ? (
                    <p className="text-xs text-gray-400 dark:text-gray-500">{S.common.none}</p>
                  ) : (
                    <ul className="space-y-0.5">
                      {detail.sessionItems.map((s) => {
                        const activity = orgRowActivity(s.status);
                        return (
                          <li key={s.sessionId}>
                            <button
                              type="button"
                              onClick={() => navigate(`/chat/${s.sessionId}`)}
                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors duration-150 hover:bg-gray-100 dark:hover:bg-gray-800"
                            >
                              <PrincipalChip principal={agentPrincipal(s.agentId)} names={names} />
                              <span className="min-w-0 flex-1 truncate text-gray-600 dark:text-gray-300">
                                {s.title ?? s.sessionId}
                              </span>
                              {activity !== null && <SessionActivityIcon activity={activity} />}
                              {s.lastActiveAt !== undefined && (
                                <span className="shrink-0 font-mono text-[11px] tabular-nums text-gray-400 dark:text-gray-500">
                                  {formatDateTime(s.lastActiveAt)}
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <div className="mt-3 flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <Select
                        size="sm"
                        aria-label={S.company.tickets.attachSession}
                        value={attachId}
                        onChange={(e) => setAttachId(e.target.value)}
                      >
                        <option value="">{S.company.tickets.attachPick}</option>
                        {attachable.map((s) => (
                          <option key={s.sessionId} value={s.sessionId}>
                            {(s.title ?? S.company.sessionList.untitledSession) + ` · ${s.agentId}`}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <Button
                      size="sm"
                      disabled={busy || attachId === ""}
                      onClick={() =>
                        void run(async () => {
                          await api.attachOrgTicket(projectId, orgId, detail.ticketId, {
                            sessionId: attachId,
                          });
                          setAttachId("");
                        }, S.company.tickets.attached)
                      }
                    >
                      {S.company.tickets.attachSession}
                    </Button>
                  </div>
                </FoldBlock>
              </Fold>

              {/* Every write the ticket file recorded, newest first. */}
              <Fold
                title={S.company.tickets.history}
                summary={history.length === 0 ? S.common.none : `${history.length}`}
              >
                {history.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {S.company.tickets.historyEmpty}
                  </p>
                ) : (
                  <ol className="space-y-1.5 text-xs">
                    {history.map((h) => {
                      const note = noteNode(h.note);
                      const parts: ReactNode[] = [
                        // A ticket converted from the format that predates the history has no
                        // time on its first entry; the line then starts with who did it.
                        ...(h.at === ""
                          ? []
                          : [
                              <span
                                key="at"
                                className="shrink-0 font-mono tabular-nums text-gray-400 dark:text-gray-500"
                                title={h.at}
                              >
                                {formatDateTime(h.at)}
                              </span>,
                            ]),
                        <span key="by" className="text-gray-700 dark:text-gray-200">
                          {historyPrincipal(h.by)}
                        </span>,
                        <span key="action" className="text-gray-500 dark:text-gray-400">
                          {S.company.tickets.historyActions[h.action] ?? h.action}
                        </span>,
                        ...(note === null ? [] : [<Fragment key="note">{note}</Fragment>]),
                      ];
                      return (
                        <li
                          key={h.key}
                          className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-gray-600 dark:text-gray-300"
                        >
                          {parts.map((part, i) => (
                            <Fragment key={i}>
                              {i > 0 && (
                                <span aria-hidden className="text-gray-300 dark:text-gray-600">
                                  ·
                                </span>
                              )}
                              {part}
                            </Fragment>
                          ))}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </Fold>
            </>
          )}
        </div>

        {/* Footer: block / unblock on the left, the move on the right. */}
        {detail !== null && (
          <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
            {blocked ? (
              <Button size="sm" disabled={busy} onClick={() => setConfirmUnblock(true)}>
                {S.company.tickets.unblock}
              </Button>
            ) : (
              <Button size="sm" disabled={busy} onClick={() => setBlockOpen(true)}>
                {S.company.tickets.block}
              </Button>
            )}
            <div className="ml-auto flex items-center gap-2">
              <div className="w-36">
                <Select
                  size="sm"
                  aria-label={S.company.tickets.moveTitle}
                  value={moveTarget}
                  onChange={(e) => setMoveTarget(e.target.value)}
                >
                  <option value="">{S.company.tickets.moveTo}</option>
                  {TICKET_COLUMNS.filter((s) => s !== detail.status).map((s) => (
                    <option key={s} value={s}>
                      {S.company.tickets.columns[s] ?? s}
                    </option>
                  ))}
                </Select>
              </div>
              <Button
                size="sm"
                variant="primary"
                disabled={busy || moveTarget === ""}
                onClick={() => {
                  const to = TICKET_COLUMNS.find((s) => s === moveTarget);
                  if (to !== undefined) onMove(detail, to);
                }}
              >
                {S.company.tickets.move}
              </Button>
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        open={pendingSave !== null}
        title={S.common.confirmSaveTitle}
        tone="primary"
        confirmLabel={S.common.save}
        busy={busy}
        onClose={() => (busy ? undefined : setPendingSave(null))}
        onConfirm={commitSave}
      >
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {S.company.tickets.saveConfirm(detail?.title ?? "")}
        </p>
      </ConfirmModal>
      <ConfirmModal
        open={confirmStart}
        title={S.company.tickets.startSession}
        tone="primary"
        confirmLabel={S.common.confirm}
        busy={busy}
        onClose={() => (busy ? undefined : setConfirmStart(false))}
        onConfirm={() => {
          if (detail === null) return;
          setConfirmStart(false);
          void run(async () => {
            const res = await api.startOrgTicket(projectId, orgId, detail.ticketId);
            navigate(`/chat/${res.sessionId}`);
          }, S.company.tickets.started);
        }}
      >
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {S.company.tickets.startSessionConfirm(detail?.title ?? "")}
        </p>
      </ConfirmModal>
      <ConfirmModal
        open={confirmUnblock}
        title={S.company.tickets.unblock}
        tone="primary"
        confirmLabel={S.common.confirm}
        busy={busy}
        onClose={() => (busy ? undefined : setConfirmUnblock(false))}
        onConfirm={() => {
          if (detail === null) return;
          setConfirmUnblock(false);
          void run(async () => {
            await api.unblockOrgTicket(projectId, orgId, detail.ticketId);
          });
        }}
      >
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {S.company.tickets.unblockConfirm(detail?.title ?? "")}
        </p>
      </ConfirmModal>
      <Modal
        open={blockOpen}
        title={S.company.tickets.blockTitle}
        onClose={() => setBlockOpen(false)}
        footer={
          <>
            <Button size="sm" onClick={() => setBlockOpen(false)} disabled={busy}>
              {S.common.cancel}
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={busy || !blockReason.trim()}
              onClick={() => {
                if (detail === null) return;
                setBlockOpen(false);
                void run(async () => {
                  await api.blockOrgTicket(projectId, orgId, detail.ticketId, {
                    reason: blockReason.trim(),
                    ...(blockBy.trim() ? { by: blockBy.trim() } : {}),
                  });
                  setBlockReason("");
                  setBlockBy("");
                });
              }}
            >
              {S.company.tickets.block}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            size="sm"
            label={S.company.tickets.blockedReason}
            required
            value={blockReason}
            hint={S.company.tickets.blockReasonHint}
            autoFocus
            onChange={(e) => setBlockReason(e.target.value)}
          />
          <Input
            size="sm"
            label={S.company.tickets.blockedBy}
            value={blockBy}
            hint={S.company.tickets.blockByHint}
            className="font-mono"
            onChange={(e) => setBlockBy(e.target.value)}
          />
        </div>
      </Modal>
    </Drawer>
  );
}

/**
 * A section of the drawer that is folded on every visit: the ruled header of `OrgSection`
 * with the app's one collapse chevron in front of it, and the counts it holds after it, so a
 * reader decides from the closed row whether to open it. The panel stays in the DOM and is
 * `hidden` while collapsed — the WAI-ARIA disclosure pattern, so `aria-controls` always
 * resolves — and nothing is persisted: what hangs off a ticket is looked up, not tracked.
 */
function Fold({
  title,
  summary,
  children,
}: {
  title: string;
  /** What the closed row reports: the counts, or "none" when there is nothing inside. */
  summary: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <section className="min-w-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center ${ICON_GAP.row} border-b border-gray-200 pb-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 transition-colors duration-150 hover:text-gray-800 dark:border-gray-800 dark:text-gray-400 dark:hover:text-gray-200`}
      >
        <Chevron open={open} size={ICON_SIZE.chevronDense} />
        <span className="min-w-0 truncate">{title}</span>
        <span className="min-w-0 truncate font-normal normal-case tracking-normal text-gray-400 dark:text-gray-500">
          · {summary}
        </span>
      </button>
      <div id={panelId} hidden={!open} className="mt-3 space-y-4">
        {children}
      </div>
    </section>
  );
}

/** One block inside a fold: a plain label row (the fold already owns the rule) and its body. */
function FoldBlock({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {title}
        </p>
        {actions !== undefined && (
          <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
        )}
      </div>
      {children}
    </div>
  );
}
