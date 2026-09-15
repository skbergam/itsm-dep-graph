import { NextResponse } from 'next/server';
import { fetchProjects, isNotionConfigured } from '@/lib/notion';

// GET /api/projects - Get all projects
export async function GET() {
  if (!isNotionConfigured()) {
    return NextResponse.json(
      { 
        projects: [],
        message: 'Notion not configured'
      },
      { status: 200 }
    );
  }

  try {
    const projects = await fetchProjects();
    return NextResponse.json({ projects });
  } catch (error) {
    console.error('Error fetching projects:', error);
    return NextResponse.json(
      { error: 'Failed to fetch projects', projects: [] },
      { status: 500 }
    );
  }
}
