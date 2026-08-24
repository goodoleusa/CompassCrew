# Lotus → Atropos Integration Quick Start

## Overview

This guide provides a quick reference for integrating the **lotus** repository as the **Atropos OSINT Tool** while keeping **NEXUS** as the user-facing AI agent.

## Key Concepts

### Naming
- **NEXUS** = User-facing AI agent (always uppercase, never changes)
- **Atropos** = OSINT scanning tool (the lotus repository)
- **lotus** = Source repository name (temporary, will be rebranded)

### Architecture Layers

```
┌─────────────────────────────────────────┐
│         React Frontend (client/)        │
│  - NEXUS Agent Chat                    │
│  - Investigation Workspace              │
│  - Atropos Panel (NEW)                 │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│      Express Backend (server/)          │
│  - /api/atropos/* routes (NEW)          │
│  - AtroposService wrapper (NEW)         │
│  - Existing OSINT routes                │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│      Atropos Tool (tools/atropos/)       │
│  - Rust binary                          │
│  - Lua script execution                 │
│  - OSINT tool integrations              │
└─────────────────────────────────────────┘
```

## Step-by-Step Integration

### Step 1: Repository Setup

```bash
# Create feature branch
git checkout -b feature/lotus-integration

# Add lotus remote
git remote add lotus https://github.com/goodoleusa/lotus.git
git fetch lotus

# Add as subtree (recommended)
git subtree add --prefix=tools/atropos lotus main --squash
```

### Step 2: Rebrand Lotus → Atropos

Update in `tools/atropos/`:
- `Cargo.toml`: Change package name to `atropos`
- `README.md`: Update branding
- Binary name: `atropos` (already correct)
- Web UI: Update references

### Step 3: Build Integration

Add to `script/build.ts`:

```typescript
async function buildAtropos() {
  console.log("building atropos tool...");
  await exec("cd tools/atropos && cargo build --release");
  await copyFile(
    "tools/atropos/target/release/atropos",
    "dist/bin/atropos"
  );
}
```

### Step 4: Create Service Wrapper

Create `server/services/atropos.ts`:

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

export class AtroposService {
  private binaryPath: string;
  
  constructor() {
    this.binaryPath = process.env.ATROPOS_BINARY_PATH || './dist/bin/atropos';
  }
  
  async executeScript(params: {
    scriptPath: string;
    target: string;
    outputPath?: string;
  }) {
    const cmd = `echo "${params.target}" | ${this.binaryPath} scan ${params.scriptPath}`;
    const { stdout, stderr } = await execAsync(cmd);
    return JSON.parse(stdout);
  }
}
```

### Step 5: Create API Routes

Create `server/routes/atropos.ts`:

```typescript
import { Router } from 'express';
import { AtroposService } from '../services/atropos';

const router = Router();
const atropos = new AtroposService();

router.post('/scan', async (req, res) => {
  const { scriptPath, target } = req.body;
  const result = await atropos.executeScript({ scriptPath, target });
  res.json(result);
});

export default router;
```

### Step 6: Register Routes

In `server/routes.ts`:

```typescript
import atroposRouter from './routes/atropos';

// ... existing code ...
app.use('/api/atropos', atroposRouter);
```

### Step 7: Frontend Component

Create `client/src/components/AtroposPanel.tsx`:

```typescript
export function AtroposPanel() {
  const [target, setTarget] = useState('');
  const [script, setScript] = useState('');
  const [results, setResults] = useState(null);
  
  const runScan = async () => {
    const res = await fetch('/api/atropos/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scriptPath: script, target })
    });
    setResults(await res.json());
  };
  
  return (
    <div>
      {/* UI for scan execution */}
    </div>
  );
}
```

### Step 8: Database Schema

Add to `shared/schema.ts`:

```typescript
export const atroposScans = pgTable("atropos_scans", {
  id: serial("id").primaryKey(),
  scanId: text("scan_id").notNull().unique(),
  sessionToken: text("session_token").notNull(),
  scriptPath: text("script_path").notNull(),
  target: text("target").notNull(),
  status: text("status").notNull().default("pending"),
  results: jsonb("results"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

Run migration:
```bash
npm run db:push
```

### Step 9: NEXUS Integration

In `client/src/components/AgentChat.tsx`, add ability to trigger scans:

```typescript
// When NEXUS suggests a scan
const handleAtroposScan = async (script: string, target: string) => {
  const result = await fetch('/api/atropos/scan', {
    method: 'POST',
    body: JSON.stringify({ scriptPath: script, target })
  });
  // Feed results back to NEXUS
  sendMessage(`Atropos scan completed. Results: ${JSON.stringify(await result.json())}`);
};
```

## Testing Checklist

- [ ] Atropos binary builds successfully
- [ ] Can execute simple Lua script
- [ ] API route responds correctly
- [ ] Frontend component renders
- [ ] Scan execution works end-to-end
- [ ] Results stored in database
- [ ] NEXUS can trigger scans
- [ ] Results appear in Investigation Workspace

## Common Issues & Solutions

### Issue: Rust binary not found
**Solution**: Ensure `ATROPOS_BINARY_PATH` is set correctly, or build binary first

### Issue: Lua script execution fails
**Solution**: Check script path, ensure Lua dependencies are available

### Issue: Process spawn errors
**Solution**: Check file permissions, ensure binary is executable

### Issue: API timeout
**Solution**: Implement async scan execution with status polling

## Environment Variables

```bash
# Atropos Configuration
ATROPOS_BINARY_PATH=./dist/bin/atropos
ATROPOS_SCRIPTS_DIR=./tools/atropos/examples

# API Keys for Atropos tools
SHODAN_API_KEY=your-key
VIRUSTOTAL_API_KEY=your-key
GITHUB_TOKEN=your-token
```

## File Structure After Integration

```
mcl/
├── client/
│   └── src/
│       └── components/
│           ├── AgentChat.tsx          # NEXUS agent (unchanged name)
│           └── AtroposPanel.tsx      # NEW: Atropos UI
├── server/
│   ├── routes/
│   │   ├── osint.ts                  # Existing OSINT routes
│   │   └── atropos.ts                # NEW: Atropos routes
│   └── services/
│       ├── osint.ts                  # Existing OSINT service
│       └── atropos.ts                # NEW: Atropos service
├── tools/
│   └── lotus/                         # Lotus repo (will be rebranded)
│       ├── Cargo.toml
│       ├── src/
│       └── examples/
└── shared/
    └── schema.ts                      # Updated with atropos tables
```

## Next Steps

1. Review `ARCHITECTURE.md` for detailed plan
2. Start with Step 1 (repository setup)
3. Follow phases sequentially
4. Test each phase before moving to next
5. Update documentation as you go

---

*For detailed architecture and planning, see `ARCHITECTURE.md`*
