import { NextResponse } from 'next/server';
import { fetchReleases, fetchFeaturesForRelease, isNotionConfigured } from '@/lib/notion';

// GET /api/releases - List all releases
export async function GET() {
  if (!isNotionConfigured()) {
    return NextResponse.json(
      { 
        error: 'Notion not configured',
        message: 'Set NOTION_TOKEN and NOTION_DATABASE_ID environment variables'
      },
      { status: 503 }
    );
  }

  try {
    const releases = await fetchReleases();
    return NextResponse.json({ releases });
  } catch (error) {
    console.error('Error fetching releases:', error);
    return NextResponse.json(
      { error: 'Failed to fetch releases' },
      { status: 500 }
    );
  }
}
