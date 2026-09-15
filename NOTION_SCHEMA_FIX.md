# Notion Schema Fix Summary

## Problem

The original Notion integration was designed for a hypothetical single-database structure with a `Type` property filter, but the real Workbench uses separate databases for Releases and Features.

## Real Workbench Schema

### Database Structure

1. **Releases Database**
   - Page ID: `5f9550febb5044d19b752dfba180b5d7`
   - Data Source: `collection://0debf91a-725e-46c7-8f7e-5f15f131b46f`
   - Properties:
     - `Name` (title)
     - `Features` (relation → Features DB)
     - `Note` (rich text)

2. **Features Database**
   - Page ID: `d007a63f4108487483e20771fa2f593a`
   - Data Source: `collection://0f7318ef-a302-4396-a5ea-540efc221883`
   - Properties:
     - `Name` (title)
     - `Project` (relation → Projects DB)
     - `Milestone` (select: Alpha, Beta, GA)
     - `Releases` (relation ← bidirectional)
     - `Tasks` (relation → Tasks DB)
     - `Note` (rich text)

3. **Projects Database**
   - Properties:
     - `Name` (title)
     - `Type` (select: App, Engine, Platform)

4. **Tasks Database**
   - Properties:
     - `Feature` (relation → Features DB)
     - `Status` (select: various values including Done, Archived)

## What Changed

### Environment Variables

**Before:**
```env
NOTION_TOKEN=...
NOTION_DATABASE_ID=...  # Single database ID
```

**After:**
```env
NOTION_TOKEN=...
NOTION_RELEASES_DATABASE_ID=5f9550febb5044d19b752dfba180b5d7
NOTION_FEATURES_DATABASE_ID=d007a63f4108487483e20771fa2f593a
```

### API Implementation Changes

#### 1. Releases Fetching (`fetchReleases()`)

**Before:**
```typescript
// Query single DB with Type filter
const data = await notionRequest(`/databases/${databaseId}/query`, {
  body: JSON.stringify({
    filter: {
      property: 'Type',
      select: { equals: 'Release' }
    }
  })
});
```

**After:**
```typescript
// Query Releases DB directly (no filter needed)
const data = await notionRequest(`/databases/${releasesDbId}/query`, {
  body: JSON.stringify({})  // Empty query - all rows are releases
});
```

#### 2. Features Fetching (`fetchFeaturesForRelease()`)

**Before:**
```typescript
// Query single DB with Type + Release filter
filter: {
  and: [
    { property: 'Type', select: { equals: 'Feature' } },
    { property: 'Release', relation: { contains: releaseId } }
  ]
}

// Extract from text properties
project: extractText(properties.Project) || 'Unknown',
open_tasks: extractNumber(properties['Open Tasks']) || 0,
total_tasks: extractNumber(properties['Total Tasks']) || 0,
```

**After:**
```typescript
// Query Features DB with Releases relation filter
filter: {
  property: 'Releases',
  relation: { contains: releaseId }
}

// Resolve Project relation to get name and type
const projectPage = await notionRequest(`/pages/${projectId}`);
projectName = extractText(projectPage.properties.Name);
projectType = extractSelect(projectPage.properties.Type);

// Count Tasks relation dynamically
const tasksRelation = properties.Tasks?.relation || [];
let openTasks = 0;
for (const taskRef of tasksRelation) {
  const taskPage = await notionRequest(`/pages/${taskRef.id}`);
  const status = extractSelect(taskPage.properties.Status);
  if (status && status !== 'Done' && status !== 'Archived') {
    openTasks++;
  }
}
```

### Data Model Changes

**Feature Interface - Before:**
```typescript
interface Feature {
  id: string;
  name: string;
  release_id: string;
  project: string;  // Text from property
  milestone: 'Alpha' | 'Beta' | 'GA' | null;
  open_tasks: number;  // From rollup property
  total_tasks: number;  // From rollup property
  notion_url: string;
}
```

**Feature Interface - After:**
```typescript
interface Feature {
  id: string;
  name: string;
  release_id: string;
  project: string;  // Resolved from Project relation
  project_type: 'App' | 'Engine' | 'Platform' | null;  // NEW
  milestone: 'Alpha' | 'Beta' | 'GA' | null;
  open_tasks: number;  // Counted from Tasks relation
  total_tasks: number;  // Counted from Tasks relation
  notion_url: string;
}
```

### Section Mapping Logic

**Before:**
```typescript
// Hardcoded component name to section mapping
const componentToSection: Record<string, 'Product' | 'Engines' | 'Platform'> = {
  'App': 'Product',
  'Engine': 'Engines',
  'Platform': 'Platform',
};
const section = componentToSection[feature.project] || 'Platform';
```

**After:**
```typescript
// Use project_type for accurate mapping
const typeToSection: Record<string, 'Product' | 'Engines' | 'Platform'> = {
  'App': 'Product',
  'Engine': 'Engines',
  'Platform': 'Platform',
};
const section = feature.project_type 
  ? typeToSection[feature.project_type] || 'Platform'
  : 'Platform';
```

## Benefits

1. **Accurate Data**: Directly queries the actual Workbench structure
2. **Dynamic Counts**: Tasks are counted in real-time based on Status
3. **Proper Relations**: Project Type is resolved from the relation, not guessed from name
4. **Scalable**: Works with any number of projects/features/tasks
5. **No Rollups Required**: Doesn't depend on rollup properties in Notion

## Verification

With the correct environment variables set:

1. `/api/releases` returns all rows from Releases DB
2. `/api/releases/[id]/features` returns features filtered by `Releases` relation
3. Each feature has accurate:
   - Project name (from Project relation)
   - Project type (from Project.Type)
   - Open task count (dynamic: Status ≠ Done/Archived)
   - Total task count (all related tasks)

## Migration Notes

### For Existing Deployments

1. Update environment variables in Vercel:
   ```
   Remove: NOTION_DATABASE_ID
   Add: NOTION_RELEASES_DATABASE_ID=5f9550febb5044d19b752dfba180b5d7
   Add: NOTION_FEATURES_DATABASE_ID=d007a63f4108487483e20771fa2f593a
   ```

2. Ensure Notion integration has access to:
   - Releases database
   - Features database
   - Projects database (for relation resolution)
   - Tasks database (for counting)

3. Redeploy with the updated code

### Testing

```bash
# With env vars set locally
curl http://localhost:3000/api/releases
# Should return releases without error

curl http://localhost:3000/api/releases/{RELEASE_ID}/features
# Should return features with project_type field
```

## Limitations

- **Performance**: Each feature requires 1 API call per project + N calls for N tasks
  - For 10 features with 5 tasks each: ~60 API calls
  - Notion API rate limit: 3 requests/second
  - Consider caching or batch operations for large datasets

- **Pagination**: Current implementation doesn't handle paginated responses
  - Fine for <100 features per release
  - Add pagination handling if needed for larger datasets

## Future Improvements

1. **Batch Resolution**: Use Notion's batch APIs where available
2. **Caching**: Cache project lookups (same project repeated across features)
3. **Pagination**: Handle `has_more` and `next_cursor` for large datasets
4. **Error Recovery**: Better handling of partial failures (some projects/tasks fail to load)
