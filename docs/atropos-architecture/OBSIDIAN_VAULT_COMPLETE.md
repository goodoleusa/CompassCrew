╔═══════════════════════════════════════════════════════════════════════════╗
║              ✅ OBSIDIAN VAULT SETUP COMPLETE                             ║
║      Offline Campaign Builder & Education Management System               ║
╔═══════════════════════════════════════════════════════════════════════════╗

Status: ✅ PRODUCTION READY
Location: obsidian-vault/
Sync: ✅ BIDIRECTIONAL (Obsidian ↔️ App)
Plugins: Breadcrumbs, Excalibrain, Dataview, Templater, Obsidian Git

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 WHAT YOU GET:

✅ OFFLINE CAMPAIGN BUILDER
   • Create campaigns anywhere (no internet needed)
   • Templater templates with auto-fill
   • Full Markdown support
   • Sync to app when ready

✅ VISUAL CURRICULUM DESIGN
   • Excalibrain: See entire learning structure as graph
   • Breadcrumbs: Navigate parent/sibling/child relationships
   • Identify gaps visually
   • Understand hierarchies at a glance

✅ METADATA MANAGEMENT
   • Consistent frontmatter via templates
   • Only parent/sibling/child relationships (no confusion!)
   • Metadata Menu for visual editing
   • Validation before sync

✅ POWERFUL QUERIES
   • Dataview: SQL-like queries on metadata
   • Find orphaned notes
   • Track completion status
   • Generate live reports

✅ VERSION CONTROL
   • Obsidian Git: Auto-commits every 10 min
   • Full change history
   • Team collaboration
   • Rollback capability

✅ BIDIRECTIONAL SYNC
   • Edit in Obsidian → Export to app
   • Edit in app → Import to Obsidian
   • No data loss
   • Work in whichever environment you prefer

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📁 VAULT STRUCTURE:

obsidian-vault/
├── START_HERE.md               # 👋 Begin here!
├── README.md                   # Vault overview
├── METADATA_STANDARDS.md       # Frontmatter rules (CRITICAL!)
├── MOC - Education Management.md # Dashboard
├── tags.md                     # Tag taxonomy
│
├── Curriculum/                 # Main curriculum
│   ├── Curriculum.md          # Root node
│   ├── Modules/               # Learning modules
│   └── Tracks/                # Specialization tracks
│
├── Campaigns/                  # Investigation campaigns
│   ├── Beginner/
│   ├── Intermediate/
│   ├── Advanced/
│   └── Expert/
│
├── Learning-Paths/             # Career tracks
│   ├── OSINT Specialist Path.md
│   ├── Financial Investigator Path.md
│   ├── Threat Intel Analyst Path.md
│   └── Security Researcher Path.md
│
├── Achievements/               # Achievement definitions
│   ├── Discovery/
│   ├── Speed/
│   ├── Mastery/
│   ├── Social/
│   └── Special/
│
├── Tools/                      # Tool docs
│   ├── OSINT/
│   ├── Network/
│   ├── Malware/
│   └── Social/
│
├── Guides/                     # How-to guides
│   └── Campaign Builder Guide.md
│
├── Templates/                  # Templater templates
│   ├── Campaign Template.md
│   ├── Learning Path Template.md
│   ├── Achievement Template.md
│   └── Tool Template.md
│
└── Scripts/                    # Templater scripts
    └── helpers.js

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚀 QUICK START:

1. INITIALIZE VAULT (1 command):
   ```bash
   cd atropos
   ./script/init-obsidian-vault.sh
   ```

2. OPEN IN OBSIDIAN:
   ```bash
   # macOS:
   open -a Obsidian obsidian-vault
   
   # Linux:
   obsidian obsidian-vault
   
   # Or: Obsidian → Open folder → Select obsidian-vault/
   ```

3. INSTALL PLUGINS (5 minutes):
   Settings → Community Plugins → Browse
   
   REQUIRED:
   ✅ Breadcrumbs - Hierarchical navigation
   ✅ Excalibrain - Visual graph
   ✅ Dataview - Metadata queries
   ✅ Templater - Template system
   
   RECOMMENDED:
   ✅ Obsidian Git - Auto version control
   ✅ Metadata Menu - Visual frontmatter editor

4. START CREATING:
   • Open: START_HERE.md (in vault)
   • Read: Campaign Builder Guide
   • Create: Ctrl/Cmd+P → "Templater: Campaign Template"
   • Sync: npm run sync:campaigns

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎨 CAMPAIGN BUILDER WORKFLOW:

1. CREATE from template (30 sec)
   → Ctrl/Cmd+P → "Templater: Campaign Template"
   → Name: "Your Campaign Name"
   → Templater auto-fills ID, dates, structure

2. DEFINE metadata (2 min)
   → Set difficulty, time, tags, color
   → Assign parent: [[Module Name]]
   → List siblings: [[Related Campaign]]

3. WRITE content (10-15 min)
   → Objectives, tools, starter prompt
   → ALL 5 teaching adaptations (critical!)
   → Investigation steps
   → Learning outcomes

4. VISUALIZE in Excalibrain (30 sec)
   → Open Excalibrain sidebar
   → See your campaign in hierarchy
   → Verify relationships correct

5. SYNC to app (30 sec)
   → npm run sync:campaigns
   → Creates client/src/config/obsidianCampaigns.ts

6. TEST in app (5 min)
   → npm run dev
   → Visit /campaigns
   → Play your campaign
   → Verify it works

7. ITERATE (repeat 3-6 until perfect)

Total time: 20-30 min per campaign (faster than web editor!)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔄 SYNC COMMANDS:

# Export FROM Obsidian TO App:
npm run sync:campaigns         # Campaigns only
npm run sync:achievements      # Achievements only
npm run sync:learning-paths    # Learning paths only
npm run sync:from-obsidian     # Everything

# Import FROM App TO Obsidian:
npm run sync:to-obsidian       # Export existing campaigns to vault

# Vault Management:
npm run vault:init             # Initialize vault (first time)
npm run vault:open             # Open in Obsidian

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🧠 PLUGIN FEATURES:

1. BREADCRUMBS (Hierarchical Navigation)
   • parent: What this belongs to (⬆️)
   • sibling: Same-level alternatives (↔️)
   • child: What this contains (⬇️)
   
   Example:
   Curriculum (root)
   └── OSINT Path (parent: Curriculum)
       └── Module (parent: OSINT Path)
           └── Campaign (parent: Module)
   
   Navigate with trail view: Root → Path → Module → Campaign

2. EXCALIBRAIN (Visual Knowledge Graph)
   • See entire curriculum as graph
   • Parent nodes above
   • Sibling nodes sideways
   • Child nodes below
   • Click to navigate
   • Zoom/pan to explore
   
   Perfect for:
   - Curriculum design
   - Gap identification
   - Structure verification
   - Big picture view

3. DATAVIEW (Metadata Queries)
   • SQL-like queries on frontmatter
   • Live-updating tables/lists
   • Filter by any field
   • Aggregate statistics
   
   Example queries:
   ```dataview
   TABLE difficulty, estimatedTime
   FROM "Campaigns"
   WHERE parent = [[Module]]
   SORT difficulty ASC
   ```

4. TEMPLATER (Template System)
   • Auto-apply templates by folder
   • Auto-fill fields (ID, dates)
   • Custom scripts (helpers.js)
   • Cursor jumping
   
   Templates for:
   - Campaign Template.md
   - Learning Path Template.md
   - Achievement Template.md
   - Tool Template.md

5. OBSIDIAN GIT (Version Control)
   • Auto-commit every 10 min
   • Auto-pull every 5 min
   • Manual commit/push commands
   • Full git integration
   
   Collaboration:
   - Team edits in Obsidian
   - Commits automatically
   - Pull others' changes
   - Merge via git

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 METADATA STANDARDS:

ONLY USE THESE 3 RELATIONSHIPS:
✅ parent: [[Note Name]]       # One level up
✅ sibling: [[Note Name]]      # Same level
✅ child: [[Note Name]]        # One level down

DON'T USE (breaks Breadcrumbs/Excalibrain):
❌ prerequisite:
❌ requires:
❌ unlocks:
❌ related:
❌ leads-to:
❌ part-of:

REQUIRED FIELDS (All Notes):
- id: unique_slug
- name: Display Name
- type: campaign|learning-path|achievement|tool|module
- status: draft|active|archived
- created: YYYY-MM-DD
- modified: YYYY-MM-DD
- parent: [[Parent]] or null
- sibling: [[Sibling]] or []
- child: [[Child]] or []

VALIDATION:
- YAML syntax must be valid
- Wiki links must resolve
- No circular references
- No self-references
- IDs must be unique

See: obsidian-vault/METADATA_STANDARDS.md for complete guide

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎓 USE CASES:

1. OFFLINE CAMPAIGN BUILDING
   → Work on plane/train with no internet
   → Edit faster in native app
   → Sync when you're back online

2. CURRICULUM DESIGN
   → Visualize entire learning structure
   → Identify gaps and opportunities
   → Reorganize with drag-and-drop (mental model)
   → Balance difficulty across paths

3. TEAM COLLABORATION
   → Multiple educators editing
   → Git version control
   → Review changes via diffs
   → Merge contributions

4. CONTENT MANAGEMENT
   → Query all content with Dataview
   → Find incomplete campaigns
   → Track draft → active → archived lifecycle
   → Manage 100+ campaigns easily

5. LEARNING PATH DESIGN
   → Map career outcomes to campaigns
   → Create module progressions
   → Define prerequisites visually
   → Export complete paths to app

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📚 DOCUMENTATION:

IN VAULT:
• START_HERE.md - New user onboarding ⭐ START HERE
• README.md - Vault overview
• METADATA_STANDARDS.md - Canonical reference (2,400 words!)
• Campaign Builder Guide.md - Step-by-step workflow
• MOC - Education Management.md - Content dashboard

IN REPO:
• docs/OBSIDIAN_VAULT_GUIDE.md - Complete setup guide
• docs/CURRICULUM.md - Main curriculum (syncs to vault)
• docs/CAMPAIGN_LEARNING_TEMPLATE.md - Template guide

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 BENEFITS OVER WEB EDITOR:

| Feature | Web Editor | Obsidian Vault |
|---------|------------|----------------|
| Offline | ❌ No | ✅ Yes |
| Speed | 🐌 Slow (HTTP) | ⚡ Fast (native) |
| Visual Graph | ❌ No | ✅ Excalibrain |
| Hierarchical Nav | ❌ Manual | ✅ Breadcrumbs |
| Queries | ❌ No | ✅ Dataview |
| Version Control | ❌ No | ✅ Git |
| Templates | ⚠️ Basic | ✅ Templater |
| Batch Edit | ❌ One by one | ✅ Multi-file |
| Backup | ⚠️ Database | ✅ Git + Files |
| Collaboration | ⚠️ Hard | ✅ Git flow |

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 YOUR WORKFLOW NOW:

MORNING:
1. Open Obsidian vault
2. Pull latest: Obsidian Git auto-pulls
3. Check MOC dashboard for tasks

DURING DAY:
4. Create campaigns from templates
5. Edit learning paths
6. Design achievements
7. Visualize in Excalibrain
8. Navigate with Breadcrumbs
9. Query with Dataview
10. Git auto-commits (every 10 min)

EVENING:
11. Review changes in Git
12. Sync to app: npm run sync:from-obsidian
13. Test: npm run dev
14. Push to remote: Git auto-pushes

WEEKLY:
15. Review orphaned notes (Dataview query)
16. Check Excalibrain for structure issues
17. Update modified dates
18. Bulk sync: npm run sync:from-obsidian

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔧 SETUP INSTRUCTIONS:

STEP 1: Initialize (1 command)
```bash
cd atropos
./script/init-obsidian-vault.sh
```

Output:
✅ Vault structure created
✅ Templates configured
✅ Existing campaigns exported
✅ Git repository initialized
✅ Ready to open!

STEP 2: Open Obsidian
```bash
# macOS:
open -a Obsidian obsidian-vault

# Linux:
obsidian obsidian-vault

# Windows:
start obsidian://open?path=%cd%\obsidian-vault

# Or manually:
Obsidian → Open folder → Select: obsidian-vault/
```

STEP 3: Install Plugins (Settings → Community Plugins)
1. Enable Community Plugins
2. Browse and install:
   - Breadcrumbs (hierarchical nav)
   - Excalibrain (visual graph)
   - Dataview (queries)
   - Templater (templates)
   - Obsidian Git (version control)
   - Metadata Menu (frontmatter editor)
3. Enable all installed plugins
4. Restart Obsidian

STEP 4: Configure Templater (Settings → Templater)
✅ Templates folder: Templates
✅ Trigger on file creation: ON
✅ Auto jump to cursor: ON
✅ Enable folder templates: ON

STEP 5: Test
1. Open: START_HERE.md
2. Create: Ctrl/Cmd+P → "Templater: Campaign Template"
3. Visualize: Open Excalibrain
4. Sync: npm run sync:campaigns
5. Test: npm run dev, visit /campaigns

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 EXAMPLE QUERIES:

# Find all draft campaigns
```dataview
LIST FROM "Campaigns" WHERE status = "draft"
```

# Campaign statistics by difficulty
```dataview
TABLE length(rows) as Count
FROM "Campaigns"
GROUP BY difficulty
```

# Orphaned notes (quality control)
```dataview
LIST FROM "" WHERE !parent AND type != null
```

# Learning path overview
```dataview
TABLE estimatedHours, targetRoles, length(child) as Modules
FROM "Learning-Paths"
SORT difficulty ASC
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 HIERARCHICAL RELATIONSHIPS (Remember!):

ONLY USE THESE 3:
• parent: [[What I Belong To]]      ⬆️ Up in hierarchy
• sibling: [[Alternatives]]         ↔️ Same level
• child: [[What I Contain]]         ⬇️ Down in hierarchy

EXAMPLE:
```yaml
# Campaign note:
parent: [[SOCMINT Module]]           # I belong to this module
sibling:                             # Alternative campaigns
  - [[LinkedIn OSINT]]
  - [[Facebook Investigation]]
child:                               # My sub-steps
  - [[Step 1 Profile Analysis]]
  - [[Step 2 Network Mapping]]
```

VISUALIZES AS:
```
          SOCMINT Module (parent)
                 |
    ┌────────────┼────────────┐
    ↓            ↓            ↓
LinkedIn    Twitter ⬅️     Facebook
(sibling)   (YOU)          (sibling)
             |
        ┌────┴────┐
        ↓         ↓
     Step 1    Step 2
     (child)   (child)
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✨ KEY FEATURES:

1. TEMPLATER TEMPLATES
   • Campaign Template - Full campaign with all fields
   • Learning Path Template - Career track structure
   • Achievement Template - Achievement definition
   • Tool Template - Tool documentation
   • Auto-fill: ID, dates, structure

2. BREADCRUMBS NAVIGATION
   • Trail: Curriculum → Path → Module → Campaign ← YOU
   • Matrix: Grid view of all relationships
   • Quick nav: Click parent/sibling/child links

3. EXCALIBRAIN VISUALIZATION
   • Graph view of entire curriculum
   • Color by type/difficulty
   • Zoom/pan/navigate
   • Identify gaps/orphans

4. DATAVIEW QUERIES
   • Find drafts needing completion
   • Track campaign statistics
   • Generate reports
   • Quality control checks

5. OBSIDIAN GIT SYNC
   • Auto-commit every 10 min
   • Auto-pull every 5 min
   • Full git history
   • Team collaboration ready

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎉 SUCCESS CRITERIA:

You're successful when:
✅ Can create campaign in under 10 minutes
✅ Excalibrain shows clean hierarchy
✅ Breadcrumbs navigation intuitive
✅ Sync completes without errors
✅ Campaigns work in app immediately
✅ Git commits are automatic
✅ No orphaned notes
✅ All metadata validated

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📖 DOCUMENTATION LOCATIONS:

START HERE:
→ obsidian-vault/START_HERE.md

CRITICAL READS:
→ obsidian-vault/METADATA_STANDARDS.md (2,400 words!)
→ obsidian-vault/README.md
→ obsidian-vault/Guides/Campaign Builder Guide.md

SETUP GUIDE:
→ docs/OBSIDIAN_VAULT_GUIDE.md

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚀 YOU'RE READY!

Your offline-first education management system is complete.

Build campaigns anywhere. Visualize curriculum structure. 
Navigate hierarchically. Query powerfully. Version control everything.
Sync bidirectionally. Work offline. Deploy online.

Open: obsidian-vault/START_HERE.md

BEGIN! 🎓

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
