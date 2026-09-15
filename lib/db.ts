import { neon, neonConfig } from '@neondatabase/serverless';

// Connection pool for Neon Postgres
// Uses DATABASE_URL from environment variables
export function getDbClient() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    return null;
  }
  
  return neon(databaseUrl);
}

export function isDatabaseAvailable(): boolean {
  return !!process.env.DATABASE_URL;
}

// Types for database tables
export interface ReleaseMetricSnapshot {
  snapshot_date: Date;
  release_notion_id: string;
  release_name: string;
  scope: 'component' | 'section' | 'release';
  component_name?: string;
  section?: 'Product' | 'Engines' | 'Platform';
  alpha_n: number;
  alpha_d: number;
  beta_n: number;
  beta_d: number;
  ga_n: number;
  ga_d: number;
}

export interface Timeline {
  task_notion_id: string;
  task_name: string;
  version: number;
  payload: any; // JSON payload
  created_at: Date;
  updated_at: Date;
}

export interface TimelineVersion {
  id?: number;
  task_notion_id: string;
  version: number;
  payload: any; // JSON payload
  created_at: Date;
}

export interface DailyTaskReport {
  report_date: Date;
  window_start: Date;
  window_end: Date;
  html: string;
  payload: any; // JSON payload
  created_at: Date;
}
