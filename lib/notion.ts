// Notion API helpers for fetching releases and features
// Requires NOTION_TOKEN, NOTION_RELEASES_DATABASE_ID, and NOTION_FEATURES_DATABASE_ID environment variables

interface NotionPage {
  id: string;
  properties: Record<string, any>;
  [key: string]: any;
}

interface NotionDatabaseQuery {
  results: NotionPage[];
  has_more: boolean;
  next_cursor: string | null;
}

export interface Release {
  id: string;
  name: string;
  notion_url: string;
}

export interface Feature {
  id: string;
  name: string;
  release_id: string;
  project: string; // component name
  project_type: 'App' | 'Engine' | 'Platform' | null;
  milestone: 'Alpha' | 'Beta' | 'GA' | null;
  open_tasks: number;
  total_tasks: number;
  notion_url: string;
}

export function isNotionConfigured(): boolean {
  return !!(
    process.env.NOTION_TOKEN &&
    process.env.NOTION_RELEASES_DATABASE_ID &&
    process.env.NOTION_FEATURES_DATABASE_ID
  );
}

async function notionRequest(endpoint: string, options: RequestInit = {}) {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    throw new Error('NOTION_TOKEN not configured');
  }

  const response = await fetch(`https://api.notion.com/v1${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Notion API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

export async function fetchReleases(): Promise<Release[]> {
  if (!isNotionConfigured()) {
    return [];
  }

  try {
    // Default to the known Releases DB if not set
    const databaseId = process.env.NOTION_RELEASES_DATABASE_ID || '5f9550febb5044d19b752dfba180b5d7';
    
    const data = await notionRequest(`/databases/${databaseId}/query`, {
      method: 'POST',
      body: JSON.stringify({}), // No filter needed - this is the Releases DB
    }) as NotionDatabaseQuery;

    return data.results.map((page) => ({
      id: page.id,
      name: extractText(page.properties.Name || page.properties.Title),
      notion_url: page.url || `https://notion.so/${page.id.replace(/-/g, '')}`,
    }));
  } catch (error) {
    console.error('Error fetching releases from Notion:', error);
    return [];
  }
}

export async function fetchFeaturesForRelease(releaseId: string): Promise<Feature[]> {
  if (!isNotionConfigured()) {
    return [];
  }

  try {
    // Default to the known Features DB if not set
    const featuresDatabaseId = process.env.NOTION_FEATURES_DATABASE_ID || 'd007a63f4108487483e20771fa2f593a';
    
    // Query Features DB filtered by Releases relation
    const data = await notionRequest(`/databases/${featuresDatabaseId}/query`, {
      method: 'POST',
      body: JSON.stringify({
        filter: {
          property: 'Releases',
          relation: {
            contains: releaseId,
          },
        },
      }),
    }) as NotionDatabaseQuery;

    // Fetch full feature data including project info and tasks
    const features: Feature[] = [];
    
    for (const page of data.results) {
      const properties = page.properties;
      
      // Get project relation to resolve project name and type
      const projectRelation = properties.Project?.relation || [];
      let projectName = 'Unknown';
      let projectType: 'App' | 'Engine' | 'Platform' | null = null;
      
      if (projectRelation.length > 0) {
        const projectId = projectRelation[0].id;
        try {
          const projectPage = await notionRequest(`/pages/${projectId}`, {
            method: 'GET',
          });
          projectName = extractText(projectPage.properties.Name || projectPage.properties.Title);
          projectType = extractSelect(projectPage.properties.Type) as 'App' | 'Engine' | 'Platform' | null;
        } catch (error) {
          console.error(`Error fetching project ${projectId}:`, error);
        }
      }
      
      // Get tasks relation to count open/total
      const tasksRelation = properties.Tasks?.relation || [];
      let openTasks = 0;
      let totalTasks = tasksRelation.length;
      
      // Query tasks to count open vs total
      if (tasksRelation.length > 0) {
        for (const taskRef of tasksRelation) {
          try {
            const taskPage = await notionRequest(`/pages/${taskRef.id}`, {
              method: 'GET',
            });
            const status = extractSelect(taskPage.properties.Status);
            if (status && status !== 'Done' && status !== 'Archived') {
              openTasks++;
            }
          } catch (error) {
            console.error(`Error fetching task ${taskRef.id}:`, error);
          }
        }
      }
      
      features.push({
        id: page.id,
        name: extractText(properties.Name || properties.Title),
        release_id: releaseId,
        project: projectName,
        project_type: projectType,
        milestone: extractSelect(properties.Milestone) as 'Alpha' | 'Beta' | 'GA' | null,
        open_tasks: openTasks,
        total_tasks: totalTasks,
        notion_url: page.url || `https://notion.so/${page.id.replace(/-/g, '')}`,
      });
    }

    return features;
  } catch (error) {
    console.error('Error fetching features from Notion:', error);
    return [];
  }
}

// Helper functions to extract values from Notion property types
function extractText(property: any): string {
  if (!property) return '';
  
  if (property.title && Array.isArray(property.title)) {
    return property.title.map((t: any) => t.plain_text || '').join('');
  }
  
  if (property.rich_text && Array.isArray(property.rich_text)) {
    return property.rich_text.map((t: any) => t.plain_text || '').join('');
  }
  
  return '';
}

function extractSelect(property: any): string | null {
  if (!property || !property.select) return null;
  return property.select.name || null;
}

function extractNumber(property: any): number | null {
  if (!property || typeof property.number !== 'number') return null;
  return property.number;
}

function extractRelation(property: any): string[] {
  if (!property || !Array.isArray(property.relation)) return [];
  return property.relation.map((r: any) => r.id);
}
