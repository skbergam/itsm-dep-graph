# Release Progress Route Guide

## Access the Release Progress UI

Once deployed, access the release progress page at:

**Route**: `/releases`

Example: `https://your-domain.vercel.app/releases`

## Features

### 1. Release Picker
- Dropdown to select from available releases in Notion
- Shows empty state with clear message if Notion is not configured

### 2. Drift Comparison Toggle
- **Off**: Show current metrics only
- **Day-over-Day**: Compare with yesterday's snapshot (numerator and denominator deltas)
- **Week-over-Week**: Compare with last week's snapshot

### 3. Release Rollup
Displays aggregate progress across all sections:
- Features to Alpha milestone
- Features to Beta milestone  
- Features to GA milestone
- Derived release milestone (floor of features completed)

### 4. Section Views
Three sections displayed in order:
- **Product** (App component)
- **Engines** (Engine component)
- **Platform** (Platform component)

Each section shows:
- Section rollup with Alpha/Beta/GA fractions
- "X remaining" counts (not percentages)
- Component boxes below

### 5. Component Boxes
- Always rendered (even if 0/0, shown de-emphasized)
- Label above the box
- Staircase display: Alpha / Beta / GA fractions
- Click to drill down

### 6. Drill-down Modal
Click any component box to see:
- Feature list for that component in the selected release
- Feature name with Notion link
- Milestone badge (Alpha/Beta/GA/None)
- Open/Total tasks count (informational only, no task fractions)
- Expand feature → see task list with status + Notion links

## Configuration

### Notion Setup (Required for Release Data)

Set these environment variables in Vercel or `.env.local`:

```env
NOTION_TOKEN=ntn_your_integration_token
NOTION_DATABASE_ID=your_database_id
```

**Without Notion configured**: The page shows an empty release picker with a message explaining that Notion needs to be set up.

### Neon Postgres (Required for Snapshots)

Set in Vercel or `.env.local`:

```env
DATABASE_URL=postgresql://user:pass@host/db
```

**Without DATABASE_URL**: Snapshots won't be saved, drift comparison won't work, but current metrics still calculate from Notion.

## API Endpoints Used

The release page calls these internal API routes:

- `GET /api/releases` - List releases from Notion
- `GET /api/releases/[id]/features` - Get features for a release
- `GET /api/releases/snapshots?date=YYYY-MM-DD&release_id=xxx` - Fetch snapshot
- `POST /api/releases/snapshots` - Save snapshot

## Metrics Calculation

**Features in Release**: `F(R,C) = features where release=R AND project=C`

**Milestone Counts**:
- `alpha_n` = features with milestone ≥ Alpha (Alpha, Beta, GA)
- `alpha_d` = total features in release
- `beta_n` = features with milestone ≥ Beta (Beta, GA)
- `beta_d` = total features in release
- `ga_n` = features with milestone = GA
- `ga_d` = total features in release

**Section Rollups**: Sum across all components in that section

**Release Milestone**: Floor of features (GA > Beta > Alpha > None)

## Labels Used

- "X remaining to Alpha"
- "X remaining to Beta"
- "X remaining to GA"

**Never**: "% complete" or schedule/RAG colors

## Component to Section Mapping

This is hardcoded in the UI logic:

- `App` → `Product`
- `Engine` → `Engines`
- `Platform` → `Platform`

Update `componentToSection` in `/app/releases/page.tsx` if your Notion uses different project names.

## Testing Locally

1. Set environment variables in `.env.local`
2. Run `npm start` (or `npm run build && npm start`)
3. Navigate to `http://localhost:3000/releases`

## Build Verification

The build output should show:

```
Route (app)                              Size  First Load JS
...
├ ○ /releases                         2.48 kB         105 kB
...
```

The `○` indicates it's a static page (pre-rendered), which is correct.
