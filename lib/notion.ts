// Notion API helpers for fetching releases (now called "Trains" in product language) and features
// Requires NOTION_TOKEN, NOTION_RELEASES_DATABASE_ID (Notion entity is now Train), and NOTION_FEATURES_DATABASE_ID environment variables

// Projects to exclude from the releases UI
const EXCLUDED_PROJECT_IDS = new Set([
  '3dc5dbdd-f0ea-8135-a250-f2d4ce1aebf0', // Resolv prototype
]);

const EXCLUDED_PROJECT_NAMES = new Set([
  'resolv prototype', // Case-insensitive match
]);

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
  alpha_target_date?: string | null;
  beta_target_date?: string | null;
  ga_target_date?: string | null;
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
  tasks: Task[]; // Array of linked tasks
}

export interface Task {
  id: string;
  name: string;
  status: string;
  notion_url: string;
  pr_url?: string;
}

export interface Project {
  id: string;
  name: string;
  type: 'App' | 'Engine' | 'Platform' | null;
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
      alpha_target_date: extractDate(page.properties.AlphaTargetDate),
      beta_target_date: extractDate(page.properties.BetaTargetDate),
      ga_target_date: extractDate(page.properties.GATargetDate),
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
    
    // Query Features DB filtered by Trains relation (renamed from Releases)
    const data = await notionRequest(`/databases/${featuresDatabaseId}/query`, {
      method: 'POST',
      body: JSON.stringify({
        filter: {
          property: 'Trains',
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
        
        // Skip features belonging to excluded projects
        const normalizedProjectId = projectId.replace(/-/g, '');
        const normalizedExcludedIds = Array.from(EXCLUDED_PROJECT_IDS).map(id => id.replace(/-/g, ''));
        if (normalizedExcludedIds.includes(normalizedProjectId)) {
          continue;
        }
        
        try {
          const projectPage = await notionRequest(`/pages/${projectId}`, {
            method: 'GET',
          });
          // Projects DB uses "Project name" as the title property
          projectName = extractText(projectPage.properties['Project name'] || projectPage.properties.Name || projectPage.properties.Title);
          projectType = extractSelect(projectPage.properties.Type) as 'App' | 'Engine' | 'Platform' | null;
          
          // Also check name-based exclusion
          if (EXCLUDED_PROJECT_NAMES.has(projectName.toLowerCase())) {
            continue;
          }
        } catch (error) {
          console.error(`Error fetching project ${projectId}:`, error);
        }
      }
      
      // Get tasks relation to count open/total and build tasks array
      const tasksRelation = properties.Tasks?.relation || [];
      let openTasks = 0;
      let totalTasks = tasksRelation.length;
      const tasks: Task[] = [];
      
      // Query tasks to count open vs total and collect task data
      if (tasksRelation.length > 0) {
        for (const taskRef of tasksRelation) {
          try {
            const taskPage = await notionRequest(`/pages/${taskRef.id}`, {
              method: 'GET',
            });
            const status = extractSelect(taskPage.properties.Status) || 'Unknown';
            const taskName = extractText(taskPage.properties.Name || taskPage.properties.Title);
            const prUrl = extractUrl(taskPage.properties['PR URL'] || taskPage.properties.PR);
            
            tasks.push({
              id: taskRef.id,
              name: taskName,
              status: status,
              notion_url: taskPage.url || `https://notion.so/${taskRef.id.replace(/-/g, '')}`,
              pr_url: prUrl || undefined,
            });
            
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
        tasks: tasks,
      });
    }

    return features;
  } catch (error) {
    console.error('Error fetching features from Notion:', error);
    return [];
  }
}

export async function fetchProjects(): Promise<Project[]> {
  if (!isNotionConfigured()) {
    return [];
  }

  try {
    // Use the Projects database ID if provided, or discover it from a feature's Project relation
    const projectsDatabaseId = process.env.NOTION_PROJECTS_DATABASE_ID;
    
    if (!projectsDatabaseId) {
      // If no Projects DB ID is configured, we can't fetch the projects list
      // Return empty array - the UI will fall back to showing only projects with features
      return [];
    }
    
    const data = await notionRequest(`/databases/${projectsDatabaseId}/query`, {
      method: 'POST',
      body: JSON.stringify({}),
    }) as NotionDatabaseQuery;

    const allProjects = data.results.map((page) => ({
      id: page.id,
      name: extractText(page.properties['Project name'] || page.properties.Name || page.properties.Title),
      type: extractSelect(page.properties.Type) as 'App' | 'Engine' | 'Platform' | null,
    }));

    // Filter out excluded projects by ID and name (case-insensitive)
    return allProjects.filter((project) => {
      // Normalize the project ID (remove hyphens for comparison)
      const normalizedId = project.id.replace(/-/g, '');
      const normalizedExcludedIds = Array.from(EXCLUDED_PROJECT_IDS).map(id => id.replace(/-/g, ''));
      
      if (normalizedExcludedIds.includes(normalizedId)) {
        return false;
      }
      
      // Check name match (case-insensitive)
      const normalizedName = project.name.toLowerCase();
      if (EXCLUDED_PROJECT_NAMES.has(normalizedName)) {
        return false;
      }
      
      return true;
    });
  } catch (error) {
    console.error('Error fetching projects from Notion:', error);
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

function extractUrl(property: any): string | null {
  if (!property) return null;
  
  // URL property type
  if (property.url && typeof property.url === 'string') {
    return property.url;
  }
  
  // Rich text with link
  if (property.rich_text && Array.isArray(property.rich_text)) {
    for (const text of property.rich_text) {
      if (text.href) return text.href;
    }
  }
  
  return null;
}

function extractDate(property: any): string | null {
  if (!property || !property.date) return null;
  // Notion date property has a "start" field (and optionally "end")
  // Return the start date in ISO format (YYYY-MM-DD)
  return property.date.start || null;
}
