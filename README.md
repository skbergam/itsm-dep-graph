# ITSM Dependency Graph

Board tooling for ITSM task visualization and release tracking.

## Features

- **Dependency Graph**: Hierarchical task dependency visualization with Blocked emphasis
- **Task Timelines**: Detailed timeline views with spans and events
- **Release Progress**: Track release milestones across components and sections
- **Daily Reports**: Static HTML reports for task progress

## Setup  // pragma: allowlist secret

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables (optional):

Create a `.env.local` file:

```env
# Neon Postgres (for timelines and release metrics)
DATABASE_URL=postgresql://user:pass@host/db

# Notion API (for release tracking)
NOTION_TOKEN=ntn_your_integration_token
# Optional: Override default database IDs
# NOTION_RELEASES_DATABASE_ID=5f9550febb5044d19b752dfba180b5d7
# NOTION_FEATURES_DATABASE_ID=d007a63f4108487483e20771fa2f593a
# NOTION_PROJECTS_DATABASE_ID=18786fc7-9aff-4fac-9bfa-2e7a521c821f
```

3. Start the local server:
```bash
npm start
```

4. Build for production:
```bash
npm run build
```

## Routes

- `/` - Main dependency graph
- `/timelines` - List of task timelines
- `/timelines/[id]` - Individual timeline view
- `/releases` - Release progress dashboard (requires Notion config)
- `/reports/` - Daily task reports (static HTML)

## Database Migration

To migrate existing timeline JSON files to Neon Postgres:

```bash
DATABASE_URL=<your-neon-url> node scripts/migrate-timelines.js
```

The migration is idempotent and can be run multiple times safely.

## Stack

- Next.js 15.3
- React 19
- TypeScript
- Tailwind CSS
- Neon Postgres (via @neondatabase/serverless)
- Notion API

## Architecture

### Timelines

Timelines can be served from either:
1. **Neon Postgres** (when DATABASE_URL is set) - Primary storage
2. **Static JSON files** (fallback) - Files in `public/timelines/`

The API routes automatically fall back to files if Neon is unavailable.

### Release Metrics

Release progress metrics are:
- Calculated from Notion features (when NOTION_TOKEN is set)
- Snapshotted daily to `release_metric_snapshots` table
- Displayed with drift comparison (day-over-day, week-over-week)

## License

Internal tooling - Sean/Leslie push-and-fly.
