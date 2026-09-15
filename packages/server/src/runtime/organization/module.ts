/**
 * The organization runtime as a node of the module tree: it binds the narrow seams the
 * runtime is written against (deps.ts) to the mechanisms the rest of the tree offers, builds
 * the scheduler and the service over them, and runs the scheduler for as long as this App
 * is up — one reconcile pass at setup (no backfill), stopped by the dispose effect.
 */
import { Module, Provide, Use } from "@prismshadow/penguin-core/kernel";
import type { ClassCtx } from "@prismshadow/penguin-core/kernel";
import type { ServerEvent } from "../../api/types.js";
import type { Channels, Clock, Log, Paths } from "../../hmr/capabilities.js";
import { userChannelKey } from "../../http/routes/events.js";
import type { AgentConfig, AgentLifecycle } from "../../mechanisms/agents.js";
import type { Errors, UsageQueries } from "../../mechanisms/observability.js";
import type { OrgCache, Organizations } from "../../mechanisms/organizations.js";
import type {
  AgentIndex,
  Members,
  ProjectConfigStore,
  Projects,
} from "../../mechanisms/projects.js";
import type { SessionIndex } from "../../mechanisms/sessions.js";
import type { Settings } from "../../mechanisms/settings.js";
import { OrgStore } from "../../organization/store.js";
import type { Sessions, SessionServiceIface } from "../session-manager.js";
import type { OrgDeps } from "./deps.js";
import { OrganizationScheduler } from "./scheduler.js";
import { OrganizationService } from "./service.js";

@Module()
export class OrganizationModule {
  @Use() private readonly paths!: Paths;
  @Use() private readonly cache!: OrgCache;
  @Use() private readonly projects!: Projects;
  @Use() private readonly members!: Members;
  @Use() private readonly sessions!: SessionIndex;
  @Use() private readonly manager!: Sessions;
  @Use() private readonly sessionService!: SessionServiceIface;
  @Use() private readonly agentIndex!: AgentIndex;
  @Use() private readonly agentConfig!: AgentConfig;
  @Use() private readonly agentLifecycle!: AgentLifecycle;
  @Use() private readonly projectConfig!: ProjectConfigStore;
  @Use() private readonly usage!: UsageQueries;
  @Use() private readonly errors!: Errors;
  @Use() private readonly settings!: Settings;
  @Use() private readonly channels!: Channels;
  @Use() private readonly clock!: Clock;
  @Use() private readonly log!: Log;
  @Provide() organizations!: Organizations;

  async setup({ effect }: ClassCtx) {
    const { agentIndex, agentConfig, agentLifecycle, manager, projectConfig } = this;
    const deps: OrgDeps = {
      root: this.paths.root,
      store: new OrgStore(this.paths.root),
      cache: this.cache,
      projects: this.projects,
      members: this.members,
      sessions: this.sessions,
      runner: manager,
      sessionCreator: this.sessionService,
      agents: {
        exists: async (projectId, agentId) =>
          agentIndex.exists(projectId, agentId) || agentConfig.exists(projectId, agentId),
        create: async (projectId, agentId, name, description, plugins) => {
          await agentLifecycle.createAgent(projectId, agentId, name, description, plugins);
        },
        displayName: async (projectId, agentId) =>
          (await agentConfig.readCardMeta(projectId, agentId)).name ?? agentId,
        writeAgentsMd: (projectId, agentId, content) =>
          agentConfig.updateConfig(projectId, agentId, { agentsMd: content }),
        pluginVersion: (projectId, agentId, plugin) =>
          agentLifecycle.pluginVersion(projectId, agentId, plugin),
        updatePlugin: async (projectId, agentId, plugin) => {
          await agentLifecycle.updatePlugin(projectId, agentId, plugin);
          // Same reason the plugins route invalidates: a hook package is bound when a core
          // Session is built, so a runtime cached for this employee would keep the old set
          // until it was evicted. A Task in flight keeps what it started with.
          manager.invalidateAgentRuntimes(projectId, agentId);
        },
      },
      projectConfig,
      completeOnce: (projectId, prompt) => projectConfig.completeOnce(projectId, prompt),
      usage: this.usage,
      errors: this.errors,
      notifyProject: (projectId: string, event: ServerEvent) => {
        const ownerUserId = this.projects.findById(projectId)?.ownerUserId;
        if (ownerUserId === undefined) return;
        const audience = new Set([
          ownerUserId,
          ...this.members.list(projectId).map((m) => m.userId),
        ]);
        for (const userId of audience) {
          this.channels.peek(userChannelKey(userId))?.publish(event, "server_event");
        }
      },
      companyModeEnabled: () => this.settings.getCompanyMode(),
      now: () => this.clock.now().getTime(),
      log: (line) => this.log.line(line),
    };
    const scheduler = new OrganizationScheduler(deps);
    this.organizations = new OrganizationService(deps, scheduler);
    // Only active while this App is; the successor's setup reconciles again.
    effect(() => scheduler.stop());
    await scheduler.start();
  }
}
