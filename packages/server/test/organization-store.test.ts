import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { OrgStore } from "../src/organization/store.js";

describe("OrgStore", () => {
  it("lists only ticket-shaped markdown files", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "penguin-org-store-"));
    const column = path.join(root, "tickets", "2026-09", "proposed");
    await fs.mkdir(column, { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(column, "2026-09-15-fix-ticket-filter.md"), "# Ticket\n"),
      fs.writeFile(path.join(column, "2026-09-15-fix-735.md"), "# Legacy ticket\n"),
      fs.writeFile(path.join(column, "README.md"), "# Notes\n"),
    ]);

    const tickets = await new OrgStore(root).listTickets(root);

    expect(tickets.map((ticket) => ticket.ticketId)).toEqual([
      "2026-09-15-fix-735",
      "2026-09-15-fix-ticket-filter",
    ]);
  });
});
