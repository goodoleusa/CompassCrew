# Architecture Overview & Lotus Integration Plan

## Current Architecture

### System Overview
**SysAdmin Corp** is a full-stack TypeScript web application combining:
- **Interactive Terminal Game** - CTF/escape room experience with occult/cyber-ritual aesthetic
- **OSINT Investigation Platform** - Security research tools and workflows
- **AI-Powered Assistant (NEXUS)** - OpenRouter-backed agent for investigations and guidance
- **Campaign Designer** - Visual flow editor for investigation campaigns

### Technology Stack

#### Frontend (`client/`)
- **Framework**: React 19 + TypeScript
- **Build Tool**: Vite 7
- **Routing**: Wouter
- **State Management**: 
  - TanStack Query (server state)
  - Zustand (learning preferences)
  - React Context (game state)
- **Styling**: Tailwind CSS v4 + Framer Motion
- **UI Components**: shadcn/ui (Radix UI primitives)

#### Backend (`server/`)
- **Runtime**: Node.js with Express 5
- **Language**: TypeScript (ESM modules)
- **Build**: esbuild (server bundling)
- **API Pattern**: REST JSON APIs under `/api/`
- **Database**: PostgreSQL via Drizzle ORM
- **Session Management**: express-session with PostgreSQL store

#### Data Layer (`shared/`)
- **Schema**: Drizzle ORM schema definitions
- **Models**: Type-safe database models and Zod schemas
- **Tables**: 
  - Game sessions, clues, quests, campaigns
  - OSINT tools, tool calls, investigations
  - Behavioral profiles, user analyses
  - Interaction logs, state capsules

### Key Components

#### 1. NEXUS AI Agent System
**Location**: `client/src/components/AgentChat.tsx`, `client/src/config/agentPrompts.ts`

- **Purpose**: User-facing AI assistant for investigations and game guidance
- **Backend**: OpenRouter API integration (`server/replit_integrations/chat/`)
- **Features**:
  - Dynamic system prompt building with modular capabilities
  - Context compression and state capsules for handoffs
  - Learning profile integration
  - Campaign-aware responses
- **Identity**: Always referred to as **"NEXUS"** in user-facing contexts

#### 2. OSINT Tool Integration
**Location**: `server/routes/osint.ts`, `server/services/osint.ts`

- **Purpose**: Configurable OSINT tool registry and execution
- **Current Tools**: DNS Lookup, WHOIS, URLScan, VirusTotal, AbuseIPDB, Wayback, Shodan
- **Features**:
  - Tool registry with rate limiting
  - Multi-tool query execution
  - Investigation context tracking
  - Tool call logging and analytics

#### 3. Investigation Workspace
**Location**: `client/src/pages/InvestigationWorkspace.tsx`

- **Purpose**: Unified hub for OSINT investigations
- **Features**:
  - Agent Chat (NEXUS)
  - AI Lab for quick model testing
  - Learning Profile configuration
  - Investigation context management

#### 4. Campaign Designer
**Location**: `client/src/components/CampaignDesigner.tsx`

- **Purpose**: Visual flow editor for investigation campaigns
- **Features**:
  - Node-based flow editing
  - Wikilinks (`[[Node Title]]`) for auto-linking
  - Campaign templates and modular chunks
  - Cross-campaign linking

#### 5. Existing Atropos Tool
**Location**: `tools/atropos/`

- **Current State**: Rust-based OSINT scanner with Lua scripting
- **Features**:
  - Lua script execution engine
  - Web UI (vaporwave-themed)
  - Integrated OSINT tools (BBOT, Amass, Nuclei, Shodan, etc.)
  - REST API (`/api/scan`, `/api/results`, etc.)
- **Status**: Standalone tool, not fully integrated with main app

### Data Flow

```
User → React Frontend → Express API → PostgreSQL
                              ↓
                         OSINT Services
                              ↓
                    External APIs (Shodan, VirusTotal, etc.)
```

### Current Integration Points

1. **OSINT Tools**: REST API endpoints in `server/routes/osint.ts`
2. **Investigation Context**: Shared state across features via `investigationContexts` table
3. **Tool Calls**: Logged to `osintToolCalls` table for analytics
4. **NEXUS Agent**: Can suggest and trigger OSINT tool calls via chat

---

## Lotus → Atropos Integration Plan

### Objective
Integrate the **lotus** repository (https://github.com/goodoleusa/lotus) as a working branch, where:
- **Lotus** becomes the **"Atropos OSINT Tool"** (backend scanning engine)
- **NEXUS** remains the user-facing AI agent name
- Both systems work together seamlessly

### Phase 1: Repository Setup & Branch Strategy

#### 1.1 Create Integration Branch
```bash
# Create new branch from main
git checkout -b feature/lotus-integration

# Add lotus as remote
git remote add lotus https://github.com/goodoleusa/lotus.git

# Fetch lotus repository
git fetch lotus

# Create subtree or submodule (prefer subtree for easier merging)
git subtree add --prefix=tools/atropos lotus main --squash
```

#### 1.2 Directory Structure
```
mcl/
├── client/              # React frontend (unchanged)
├── server/              # Express backend
│   ├── routes/
│   │   ├── osint.ts     # Existing OSINT API
│   │   └── atropos.ts   # NEW: Atropos integration routes
│   └── services/
│       ├── osint.ts     # Existing OSINT service
│       └── atropos.ts   # NEW: Atropos service wrapper
├── tools/
│   └── atropos/         # Atropos OSINT tool (Rust/Lua)
└── shared/              # Shared schemas (unchanged)
```

### Phase 2: Atropos Tool Integration

#### 2.1 Rename & Rebrand Lotus → Atropos
- Update all references from "lotus" to "atropos" in:
  - `Cargo.toml` (package name)
  - `README.md` (documentation)
  - Binary name (`atropos` command)
  - Web UI branding
- Canonical Atropos tool source: `tools/atropos/`

#### 2.2 Build System Integration

**Primary: Option A — Standalone Binary**
- Build atropos as a standalone Rust binary; this is the default and only supported path for production.
- Express server spawns atropos processes for each scan (CLI: `echo <target> | atropos scan <script>`).
- Communication is process-based (stdin/stdout or CLI args); no long-lived atropos daemon required.
- Binary is built from `tools/atropos` and placed at `dist/bin/atropos` (or `ATROPOS_BINARY_PATH`).
- Enables clear process boundaries, easier security and resource limits, and works on Replit when Rust is in the Nix environment.

**Future: Option B — Embedded Library (groundwork only)**
- Possible evolution: compile atropos core as a Node.js addon (e.g. `neon` or `napi-rs`) for lower latency and no process spawn per scan.
- Requires: atropos core exposed as a callable library (e.g. `libatropos`), then a thin Node binding. Not implemented; the current codebase is structured so that a future library API could mirror `AtroposService.executeScript()` without changing the rest of the stack.
- Prefer only if profiling shows process spawn overhead is a bottleneck.

**Lightweight / Replit-optimized variant**
- If Replit or resource-constrained hosting needs a smaller footprint:
  - **Build**: Use `cargo build --release` with strip and optional LTO in `tools/atropos`; consider a feature flag or a separate minimal binary that only runs a subset of scripts (e.g. no web UI, no optional OSINT backends).
  - **Runtime**: The existing design already supports “binary missing”: if the atropos binary is not built or not installed, the API returns a clear health/error and the rest of the app runs. No separate “light” code path is required.
  - **Optional**: A future “atropos-lite” crate could exclude heavy dependencies (e.g. optional HTTP server, unused Lua extensions) and ship a smaller binary; document in `tools/atropos/README.md` and wire a second binary path (e.g. `ATROPOS_LITE_BINARY_PATH`) only if needed.

#### 2.3 API Integration Layer
Create `server/services/atropos.ts`:

```typescript
// Wrapper service for Atropos tool
export class AtroposService {
  // Execute Lua script via atropos CLI
  async executeScript(params: {
    scriptPath: string;
    target: string;
    outputPath?: string;
  }): Promise<ScanResult>
  
  // Start scan via HTTP API (if atropos web server running)
  async startScanViaAPI(params: {
    script: string;
    target: string;
  }): Promise<string> // scan ID
  
  // Get scan status
  async getScanStatus(scanId: string): Promise<ScanStatus>
  
  // List available scripts
  async listScripts(): Promise<ScriptInfo[]>
}
```

#### 2.4 Express Routes
Create `server/routes/atropos.ts`:

```typescript
// POST /api/atropos/scan
// Execute atropos scan with Lua script

// GET /api/atropos/scans/:id
// Get scan status and results

// GET /api/atropos/scripts
// List available Lua scripts

// POST /api/atropos/scripts
// Upload/register new script

// GET /api/atropos/tools
// List integrated OSINT tools (BBOT, Nuclei, etc.)
```

### Phase 3: Frontend Integration

#### 3.1 Atropos Tool Panel
**Location**: `client/src/components/AtroposPanel.tsx` (new)

- **Purpose**: UI for executing Atropos scans
- **Features**:
  - Script selector (dropdown of available Lua scripts)
  - Target input (domain, IP, URL)
  - Scan execution with progress tracking
  - Results display (JSON viewer)
  - Integration with Investigation Workspace

#### 3.2 NEXUS Agent Integration
**Location**: `client/src/components/AgentChat.tsx` (modify)

- **Enhancement**: NEXUS can suggest Atropos scans
- **Flow**:
  1. User asks NEXUS about a target
  2. NEXUS suggests: "I can run an Atropos subdomain scan. Should I proceed?"
  3. User confirms → NEXUS triggers Atropos scan
  4. Results fed back to NEXUS for analysis

#### 3.3 Investigation Workspace Integration
**Location**: `client/src/pages/InvestigationWorkspace.tsx` (modify)

- **Add Tab**: "Atropos Scans"
- **Features**:
  - List of executed scans
  - Quick scan launcher
  - Results viewer
  - Integration with investigation findings

### Phase 4: Database Schema Updates

#### 4.1 Atropos Scan Tracking
Add to `shared/schema.ts`:

```typescript
// Atropos Scans - track scan executions
export const atroposScans = pgTable("atropos_scans", {
  id: serial("id").primaryKey(),
  scanId: text("scan_id").notNull().unique(), // Atropos-generated ID
  sessionToken: text("session_token").notNull(),
  investigationId: text("investigation_id"),
  scriptPath: text("script_path").notNull(),
  target: text("target").notNull(),
  status: text("status").notNull().default("pending"), // pending, running, completed, failed
  results: jsonb("results").$type<any>(),
  error: text("error"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

// Atropos Scripts - registered Lua scripts
export const atroposScripts = pgTable("atropos_scripts", {
  id: serial("id").primaryKey(),
  scriptId: text("script_id").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull(), // 'osint', 'vulnerability', 'secret_detection'
  scriptPath: text("script_path").notNull(), // Path to .lua file
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

### Phase 5: Build & Deployment

#### 5.1 Build Script Updates
Modify `script/build.ts`:

```typescript
// Add Rust build step
async function buildAtropos() {
  console.log("building atropos tool...");
  await exec("cd tools/atropos && cargo build --release");
  // Copy binary to dist/
  await copyFile("tools/atropos/target/release/atropos", "dist/bin/atropos");
}
```

#### 5.2 Docker Integration
Update `Dockerfile` (if exists) or create new:

```dockerfile
# Multi-stage build
FROM rust:latest AS atropos-builder
WORKDIR /atropos
COPY tools/atropos .
RUN cargo build --release

FROM node:20-alpine
# ... existing Node.js setup ...
COPY --from=atropos-builder /atropos/target/release/atropos /usr/local/bin/atropos
```

#### 5.3 Environment Variables
Add to `.env.example`:

```bash
# Atropos Configuration
ATROPOS_BINARY_PATH=/usr/local/bin/atropos  # or relative path
ATROPOS_SCRIPTS_DIR=./tools/atropos/examples
ATROPOS_WEB_PORT=8081  # If running web UI separately

# Atropos API Keys (for integrated tools)
SHODAN_API_KEY=
VIRUSTOTAL_API_KEY=
GITHUB_TOKEN=
SECURITYTRAILS_API_KEY=
```

### Phase 6: Testing & Validation

#### 6.1 Unit Tests
- Test Atropos service wrapper
- Test API route handlers
- Test script execution

#### 6.2 Integration Tests
- End-to-end scan execution
- NEXUS agent → Atropos scan flow
- Results integration with investigations

#### 6.3 Manual Testing Checklist
- [ ] Execute basic subdomain scan
- [ ] Execute vulnerability scan
- [ ] NEXUS suggests Atropos scan
- [ ] Results appear in Investigation Workspace
- [ ] Scan results feed into investigation findings
- [ ] Multiple concurrent scans
- [ ] Error handling (invalid script, failed scan)

### Phase 7: Documentation & Migration

#### 7.1 Update README.md
- Add Atropos tool section
- Document integration points
- Update architecture diagram

#### 7.2 Migration Guide
- How to migrate from existing `tools/atropos/` (if needed)
- How to register new Lua scripts
- How to configure API keys

#### 7.3 User Documentation
- How to use Atropos scans in investigations
- Available scripts and their purposes
- NEXUS agent integration guide

---

## Naming Conventions

### Consistent Terminology
- **"NEXUS"**: User-facing AI agent (always uppercase, always "NEXUS")
- **"Atropos"**: OSINT scanning tool (capitalized, "Atropos OSINT Tool" in UI)
- **"atropos"**: Binary/command name (lowercase)
- **"lotus"**: Repository name (temporary, will be rebranded)

### Code References
- File names: `atropos.ts`, `AtroposPanel.tsx`
- Database tables: `atropos_scans`, `atropos_scripts`
- API routes: `/api/atropos/*`
- Environment variables: `ATROPOS_*`

---

## Risk Mitigation

### Potential Issues

1. **Binary Size**: Rust binary may be large
   - **Mitigation**: Use Docker multi-stage builds, strip symbols; for Replit or constrained hosts see §2.2 lightweight/Replit-optimized variant (optional atropos-lite, feature flags).

2. **Process Management**: Spawning processes from Node.js
   - **Mitigation**: Use proper process pools, timeout handling

3. **Script Security**: User-uploaded Lua scripts
   - **Mitigation**: Sandbox execution, validate scripts, admin-only uploads

4. **Performance**: Concurrent scans
   - **Mitigation**: Queue system, rate limiting, resource limits

5. **Dependency Conflicts**: Rust toolchain requirements
   - **Mitigation**: Document requirements, provide Docker option

---

## Success Criteria

### Phase 1 Complete
- [ ] Lotus repository integrated as subtree/submodule
- [ ] Branch created and pushed
- [ ] Directory structure established

### Phase 2 Complete
- [ ] Atropos tool builds successfully
- [ ] API integration layer implemented
- [ ] Express routes functional

### Phase 3 Complete
- [ ] Frontend UI components created
- [ ] NEXUS agent can trigger scans
- [ ] Results integrated into investigations

### Phase 4 Complete
- [ ] Database schema updated
- [ ] Migrations run successfully
- [ ] Data persistence working

### Phase 5 Complete
- [ ] Build process includes Atropos
- [ ] Docker image builds successfully
- [ ] Deployment process documented

### Phase 6 Complete
- [ ] All tests passing
- [ ] Manual testing complete
- [ ] Performance acceptable

### Phase 7 Complete
- [ ] Documentation updated
- [ ] Migration guide written
- [ ] Ready for production merge

---

## Timeline Estimate

- **Phase 1**: 1-2 days (repository setup)
- **Phase 2**: 3-5 days (API integration)
- **Phase 3**: 3-4 days (frontend integration)
- **Phase 4**: 1-2 days (database schema)
- **Phase 5**: 2-3 days (build & deployment)
- **Phase 6**: 2-3 days (testing)
- **Phase 7**: 1-2 days (documentation)

**Total**: ~2-3 weeks for complete integration

---

## Next Steps

1. **Review & Approve Plan**: Get stakeholder approval
2. **Create Branch**: Set up `feature/lotus-integration` branch
3. **Start Phase 1**: Integrate lotus repository
4. **Iterate**: Follow phases sequentially, adjust as needed
5. **Merge**: Once all phases complete and tested, merge to main

---

## Questions & Decisions Needed

1. **Subtree vs Submodule**: Prefer subtree for easier merging?
2. **Binary vs Library**: Start with binary, migrate to library later?
3. **Canonical tool directory**: Resolved — use `tools/atropos/` as single source.
4. **Web UI**: Integrate Atropos web UI or use main app UI only?
5. **Script Management**: Admin-only or user-uploadable scripts?

---

*Last Updated: 2026-02-02*
*Author: AI Assistant*
*Status: Draft - Pending Review*
