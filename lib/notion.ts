// Notion API helpers for fetching releases and features
// Requires NOTION_TOKEN and NOTION_DATABASE_ID environment variables

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
  milestone: 'Alpha' | 'Beta' | 'GA' | null;
  open_tasks: number;
  total_tasks: number;
  notion_url: string;
}

export function isNotionConfigured(): boolean {
  return !!(process.env.NOTION_TOKEN && process.env.NOTION_DATABASE_ID);
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
    throw new Error(`Notion API error: ${response.statusText}`);
  }

  return response.json();
}

export async function fetchReleases(): Promise<Release[]> {
  if (!isNotionConfigured()) {
    return [];
  }

  try {
    const databaseId = process.env.NOTION_DATABASE_ID;
    const data = await notionRequest(`/databases/${databaseId}/query`, {
      method: 'POST',
      body: JSON.stringify({
        filter: {
          property: 'Type',
          select: {
            equals: 'Release',
          },
        },
      }),
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
    const databaseId = process.env.NOTION_DATABASE_ID;
    const data = await notionRequest(`/databases/${databaseId}/query`, {
      method: 'POST',
      body: JSON.stringify({
        filter: {
          and: [
            {
              property: 'Type',
              select: {
                equals: 'Feature',
              },
            },
            {
              property: 'Release',
              relation: {
                contains: releaseId,
              },
            },
          ],
        },
      }),
    }) as NotionDatabaseQuery;

    return data.results.map((page) => {
      const properties = page.properties;
      
      return {
        id: page.id,
        name: extractText(properties.Name || properties.Title),
        release_id: releaseId,
        project: extractText(properties.Project) || 'Unknown',
        milestone: extractSelect(properties.Milestone) as 'Alpha' | 'Beta' | 'GA' | null,
        open_tasks: extractNumber(properties['Open Tasks']) || 0,
        total_tasks: extractNumber(properties['Total Tasks']) || 0,
        notion_url: page.url || `https://notion.so/${page.id.replace(/-/g, '')}`,
      };
    });
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
