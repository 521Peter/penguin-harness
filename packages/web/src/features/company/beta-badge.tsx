/**
 * Company mode says it is a beta, in the two shapes that fact takes in the shell.
 *
 * The pill — a small 内测版 / Beta tag beside the organization switcher's name, at the
 * top-left of the company shell, where it is in view on every organization page rather than
 * only on the one that happens to explain the mode. It is a plain `Badge` in the muted tone:
 * the tag labels an attribute of the whole mode, not the state of anything on screen, so it
 * must not read as a status mark competing with the organization's own status dot beside it.
 *
 * The notice — the sentence a person gets the first time they switch this browser into the
 * mode (state/company.tsx's `setWorkMode`), and the once-only decision behind it. The flag
 * lives in localStorage rather than in the user's preferences because it is about this
 * browser having shown a toast, not about the user: a second browser is a second first time,
 * and a preferences round trip would decide it too late to toast on the click that caused it.
 */
import { S } from "../../lib/strings";
import { Badge } from "../../components/ui/badge";

/** The localStorage key remembering that this browser has shown the beta notice. */
export const BETA_NOTICE_KEY = "penguin.companyBetaNoticeShown";

/** Minimal storage surface (the subset of localStorage used here); tests inject an in-memory one. */
export interface BetaNoticeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Whether the beta notice is still owed in this browser.
 *
 * Storage that is missing or refuses to answer (a Node test with no localStorage, a browser
 * with site data blocked) means no notice rather than one on every switch: the sentence also
 * stands under the admin's master switch and in the docs, so the cost of skipping the toast
 * is smaller than the cost of repeating it forever.
 */
export function shouldShowBetaNotice(storage?: BetaNoticeStorage): boolean {
  try {
    return (storage ?? localStorage).getItem(BETA_NOTICE_KEY) !== "1";
  } catch {
    return false;
  }
}

/** Remembers that the notice has been shown; a storage that refuses only costs a repeat. */
export function markBetaNoticeShown(storage?: BetaNoticeStorage): void {
  try {
    (storage ?? localStorage).setItem(BETA_NOTICE_KEY, "1");
  } catch {
    /* best-effort persistence (quota limits / private browsing) */
  }
}

/**
 * The pill itself. The tooltip sits on the wrapper rather than on the `Badge`, which takes no
 * attributes of its own — and it is a `title` because every other tooltip in the switcher it
 * stands in is one.
 */
export function BetaBadge() {
  return (
    <span className="shrink-0" title={S.company.betaTitle}>
      <Badge tone="gray">{S.company.beta}</Badge>
    </span>
  );
}
