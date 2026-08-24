# Architecture Summary: SysAdmin Corp / Atropos Platform

## Executive Summary

**SysAdmin Corp** is a full-stack web application combining an interactive CTF/escape room game with OSINT investigation capabilities. The system features:

- **NEXUS**: User-facing AI agent for investigations and guidance (OpenRouter-powered)
- **Atropos OSINT Tool**: Advanced security scanning engine (Rust-based, Lua scripting)
- **Investigation Workspace**: Unified hub for security research
- **Campaign Designer**: Visual flow editor for investigation campaigns

---

## Current Architecture

### Technology Stack

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend Layer                           │
│  React 19 + TypeScript + Vite                              │
│  - Wouter (routing)                                          │
│  - TanStack Query (server state)                            │
│  - Zustand (local state)                                    │
│  - Tailwind CSS v4 + Framer Motion                         │
│  - shadcn/ui components                                     │
└─────────────────────────────────────────────────────────────┘
                            ↕ HTTP/REST
┌─────────────────────────────────────────────────────────────┐
│                    Backend Layer                             │
│  Express 5 + TypeScript (ESM)                              │
│  - REST API endpoints (/api/*)                              │
│  - Session management (PostgreSQL store)                    │
│  - OpenRouter integration (NEXUS agent)                     │
│  - OSINT tool services                                       │
└─────────────────────────────────────────────────────────────┘
                            ↕ SQL
┌─────────────────────────────────────────────────────────────┐
│                    Data Layer                                │
│  PostgreSQL + Drizzle ORM                                   │
│  - Game sessions, clues, quests                             │
│  - OSINT tools, investigations                              │
│  - Behavioral profiles, interaction logs                     │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

#### 1. **NEXUS AI Agent** (`client/src/components/AgentChat.tsx`)
- **Purpose**: Primary user-facing AI assistant
- **Backend**: OpenRouter API via `server/replit_integrations/chat/`
- **Features**:
  - Dynamic system prompt building
  - Context compression and state capsules
  - Learning profile integration
  - Campaign-aware responses
- **Identity**: Always **"NEXUS"** (never changes)

#### 2. **OSINT Tool System** (`server/routes/osint.ts`, `server/services/osint.ts`)
- **Purpose**: Configurable OSINT tool registry
- **Current Tools**: DNS, WHOIS, URLScan, VirusTotal, AbuseIPDB, Wayback, Shodan
- **Features**:
  - Tool registry with rate limiting
  - Multi-tool query execution
  - Investigation context tracking
  - Tool call logging

#### 3. **Investigation Workspace** (`client/src/pages/InvestigationWorkspace.tsx`)
- **Purpose**: Unified hub for OSINT investigations
- **Features**:
  - NEXUS Agent Chat
  - AI Lab (model testing)
  - Learning Profile configuration
  - Investigation context management

#### 4. **Campaign Designer** (`client/src/components/CampaignDesigner.tsx`)
- **Purpose**: Visual flow editor for investigation campaigns
- **Features**:
  - Node-based flow editing
  - Wikilinks (`[[Node Title]]`) for auto-linking
  - Campaign templates and modular chunks

#### 5. **Existing Atropos Tool** (`tools/atropos/`)
- **Status**: Rust-based OSINT scanner (standalone, not fully integrated)
- **Features**: Lua scripting, web UI, integrated OSINT tools

---

## Lotus → Atropos Integration Plan

### Objective

Integrate **lotus** repository (https://github.com/goodoleusa/lotus) as the **Atropos OSINT Tool**, where:
- **Lotus** becomes **"Atropos OSINT Tool"** (backend scanning engine)
- **NEXUS** remains the user-facing AI agent name
- Both systems work together seamlessly

### Integration Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    User Interface                           │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   NEXUS      │  │ Investigation │  │   Atropos    │    │
│  │   Agent      │  │  Workspace    │  │    Panel     │    │
│  │   Chat       │  │               │  │   (NEW)      │    │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘    │
│         │                  │                  │            │
│         └──────────────────┼──────────────────┘            │
│                            │                               │
└────────────────────────────┼───────────────────────────────┘
                             │
┌────────────────────────────▼───────────────────────────────┐
│                    Express API Layer                      │
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ /api/osint/* │  │/api/atropos/* │  │ /api/chat/*  │  │
│  │ (existing)   │  │   (NEW)       │  │ (NEXUS)      │  │
│  └──────────────┘  └───────┬───────┘  └──────────────┘  │
│                            │                             │
└────────────────────────────┼─────────────────────────────┘
                             │
┌────────────────────────────▼───────────────────────────────┐
│                    Service Layer                          │
│                                                           │
│  ┌──────────────┐  ┌──────────────┐                      │
│  │ OSINTService │  │AtroposService│                      │
│  │ (existing)   │  │   (NEW)      │                      │
│  └──────────────┘  └───────┬───────┘                      │
│                            │                             │
└────────────────────────────┼─────────────────────────────┘
                             │
┌────────────────────────────▼───────────────────────────────┐
│                    Atropos Tool (Rust)                     │
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Lua        │  │   OSINT      │  │   Web UI     │  │
│  │   Engine     │  │   Tools      │  │   (optional)  │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                           │
│  Tools: BBOT, Amass, Nuclei, Shodan, VirusTotal, etc.    │
└───────────────────────────────────────────────────────────┘
```

### Integration Phases

#### **Phase 1: Repository Setup** (1-2 days)
- Create `feature/lotus-integration` branch
- Add lotus as git subtree/submodule
- Establish directory structure

#### **Phase 2: Atropos Tool Integration** (3-5 days)
- Rebrand lotus → Atropos
- Build Rust binary integration
- Create `AtroposService` wrapper
- Implement Express routes (`/api/atropos/*`)

#### **Phase 3: Frontend Integration** (3-4 days)
- Create `AtroposPanel` component
- Integrate with Investigation Workspace
- Enable NEXUS to trigger scans
- Results display and management

#### **Phase 4: Database Schema** (1-2 days)
- Add `atropos_scans` table
- Add `atropos_scripts` table
- Run migrations

#### **Phase 5: Build & Deployment** (2-3 days)
- Update build scripts
- Docker integration
- Environment configuration

#### **Phase 6: Testing** (2-3 days)
- Unit tests
- Integration tests
- Manual testing

#### **Phase 7: Documentation** (1-2 days)
- Update README
- Migration guide
- User documentation

**Total Timeline**: ~2-3 weeks

---

## Naming Conventions

### Consistent Terminology

| Term | Usage | Context |
|------|-------|---------|
| **NEXUS** | User-facing AI agent | Always uppercase, never changes |
| **Atropos** | OSINT scanning tool | Capitalized, "Atropos OSINT Tool" in UI |
| **atropos** | Binary/command name | Lowercase |
| **lotus** | Source repository | Temporary, will be rebranded |

### Code References

- **Files**: `atropos.ts`, `AtroposPanel.tsx`
- **Database**: `atropos_scans`, `atropos_scripts`
- **API Routes**: `/api/atropos/*`
- **Env Vars**: `ATROPOS_*`

---

## Data Flow

### NEXUS → Atropos Scan Flow

```
1. User asks NEXUS: "Can you scan example.com for subdomains?"
   ↓
2. NEXUS suggests: "I can run an Atropos subdomain scan. Proceed?"
   ↓
3. User confirms
   ↓
4. NEXUS triggers: POST /api/atropos/scan
   {
     scriptPath: "examples/bbot_scanner.lua",
     target: "example.com"
   }
   ↓
5. AtroposService executes scan via Rust binary
   ↓
6. Results stored in database (atropos_scans table)
   ↓
7. Results returned to NEXUS
   ↓
8. NEXUS analyzes and presents findings to user
```

### Investigation Integration Flow

```
1. User creates investigation in Investigation Workspace
   ↓
2. User runs Atropos scan via AtroposPanel
   ↓
3. Scan results automatically linked to investigation
   ↓
4. Findings added to investigation context
   ↓
5. NEXUS can reference findings in conversation
   ↓
6. Results feed into Report Builder
```

---

## Key Files & Directories

### Current Structure

```
mcl/
├── client/                    # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── AgentChat.tsx      # NEXUS agent
│   │   │   └── CampaignDesigner.tsx
│   │   └── pages/
│   │       └── InvestigationWorkspace.tsx
│   └── public/
├── server/                    # Express backend
│   ├── routes/
│   │   ├── osint.ts              # Existing OSINT API
│   │   └── atropos.ts            # NEW: Atropos routes
│   ├── services/
│   │   ├── osint.ts              # Existing OSINT service
│   │   └── atropos.ts            # NEW: Atropos service
│   └── replit_integrations/
│       └── chat/                 # NEXUS agent backend
├── tools/
│   └── atropos/                  # Atropos OSINT tool
│       ├── Cargo.toml
│       ├── src/
│       └── examples/              # Lua scripts
├── shared/                    # Shared schemas
│   └── schema.ts                 # Database schema
└── script/
    └── build.ts                   # Build scripts
```

### After Integration

```
mcl/
├── client/
│   └── src/
│       └── components/
│           ├── AgentChat.tsx          # NEXUS (unchanged)
│           └── AtroposPanel.tsx      # NEW
├── server/
│   ├── routes/
│   │   └── atropos.ts                # NEW
│   └── services/
│       └── atropos.ts                # NEW
├── tools/
│   └── atropos/                      # Atropos OSINT tool
└── shared/
    └── schema.ts                      # Updated
```

---

## Environment Variables

### Current

```bash
PORT=5000
DATABASE_URL=postgresql://...
ISSUER_URL=...
```

### After Integration

```bash
# Existing
PORT=5000
DATABASE_URL=postgresql://...

# Atropos Configuration
ATROPOS_BINARY_PATH=./dist/bin/atropos
ATROPOS_SCRIPTS_DIR=./tools/atropos/examples

# Atropos API Keys (for integrated tools)
SHODAN_API_KEY=...
VIRUSTOTAL_API_KEY=...
GITHUB_TOKEN=...
SECURITYTRAILS_API_KEY=...
```

---

## Success Criteria

### Integration Complete When:

- [x] Lotus repository integrated as subtree/submodule
- [ ] Atropos tool builds successfully
- [ ] API routes functional (`/api/atropos/*`)
- [ ] Frontend components created and working
- [ ] NEXUS can trigger Atropos scans
- [ ] Results integrated into investigations
- [ ] Database schema updated and migrated
- [ ] Build process includes Atropos
- [ ] All tests passing
- [ ] Documentation updated

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Binary size | Docker multi-stage builds, strip symbols |
| Process management | Process pools, timeout handling |
| Script security | Sandbox execution, admin-only uploads |
| Performance | Queue system, rate limiting |
| Dependency conflicts | Document requirements, Docker option |

---

## Next Steps

1. **Review Plans**: 
   - `ARCHITECTURE.md` - Detailed integration plan
   - `INTEGRATION_QUICKSTART.md` - Quick reference guide

2. **Create Branch**: 
   ```bash
   git checkout -b feature/lotus-integration
   ```

3. **Start Integration**: Follow phases sequentially

4. **Test & Iterate**: Test each phase before proceeding

5. **Merge**: Once complete and tested, merge to main

---

## Documentation

- **`ARCHITECTURE.md`**: Comprehensive integration plan with all phases
- **`INTEGRATION_QUICKSTART.md`**: Step-by-step quick reference
- **`README.md`**: Project overview and setup instructions

---

*Last Updated: 2026-02-02*
*Status: Planning Phase - Ready for Implementation*
