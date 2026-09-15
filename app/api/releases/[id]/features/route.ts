import { NextRequest, NextResponse } from 'next/server';
import { fetchFeaturesForRelease, isNotionConfigured } from '@/lib/notion';

// GET /api/releases/[id]/features - Get features for a release
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  
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
    const features = await fetchFeaturesForRelease(params.id);
    return NextResponse.json({ features });
  } catch (error) {
    console.error('Error fetching features:', error);
    return NextResponse.json(
      { error: 'Failed to fetch features' },
      { status: 500 }
    );
  }
}
