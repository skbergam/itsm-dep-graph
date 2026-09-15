import { NextRequest, NextResponse } from 'next/server';
import { getDbClient, isDatabaseAvailable } from '@/lib/db';
import fs from 'fs';
import path from 'path';

// GET /api/timelines/[id]/archive/[timestamp] - Fetch archived timeline
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; timestamp: string }> }
) {
  const params = await context.params;
  const { id, timestamp } = params;
  
  // Try Neon first if available
  if (isDatabaseAvailable()) {
    try {
      const sql = getDbClient();
      if (sql) {
        // Parse timestamp to get version or created_at
        const result = await sql`
          SELECT * FROM timeline_versions
          WHERE task_notion_id = ${id}
            AND created_at::text LIKE ${timestamp + '%'}
          LIMIT 1
        `;
        
        if (result.length > 0) {
          return NextResponse.json(result[0].payload);
        }
      }
    } catch (error) {
      console.error('Error fetching archived timeline from Neon, falling back to file:', error);
    }
  }
  
  // Fallback to file
  try {
    const filePath = path.join(
      process.cwd(),
      'public',
      'timelines',
      id,
      'archive',
      `${timestamp}.json`
    );
    
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: 'Archived timeline not found' },
        { status: 404 }
      );
    }
    
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const timeline = JSON.parse(fileContent);
    
    return NextResponse.json(timeline);
  } catch (error) {
    console.error('Error reading archived timeline file:', error);
    return NextResponse.json(
      { error: 'Failed to load archived timeline' },
      { status: 500 }
    );
  }
}
