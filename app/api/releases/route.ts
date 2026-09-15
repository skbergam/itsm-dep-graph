import { NextResponse } from 'next/server';
import { fetchReleases, fetchFeaturesForRelease, isNotionConfigured } from '@/lib/notion';

// GET /api/releases - List all trains
export async function GET() {
  if (!isNotionConfigured()) {
    return NextResponse.json(
      { 
        error: 'Notion not configured',
        message: 'Set NOTION_TOKEN, NOTION_RELEASES_DATABASE_ID, and NOTION_FEATURES_DATABASE_ID environment variables'
      },
      { status: 503 }
    );
  }

  try {
    const releases = await fetchReleases();
    return NextResponse.json({ releases });
  } catch (error) {
    console.error('Error fetching trains:', error);
    return NextResponse.json(
      { error: 'Failed to fetch trains' },
      { status: 500 }
    );
  }
}
