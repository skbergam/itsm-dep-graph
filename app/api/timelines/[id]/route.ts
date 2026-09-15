import { NextRequest, NextResponse } from 'next/server';
import { getDbClient, isDatabaseAvailable } from '@/lib/db';
import fs from 'fs';
import path from 'path';

// GET /api/timelines/[id] - Fetch timeline from Neon or file fallback
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const timelineId = params.id;
  
  // Try Neon first if available
  if (isDatabaseAvailable()) {
    try {
      const sql = getDbClient();
      if (sql) {
        const result = await sql`
          SELECT * FROM timelines
          WHERE task_notion_id = ${timelineId}
          ORDER BY version DESC
          LIMIT 1
        `;
        
        if (result.length > 0) {
          return NextResponse.json(result[0].payload);
        }
      }
    } catch (error) {
      console.error('Error fetching from Neon, falling back to file:', error);
    }
  }
  
  // Fallback to file
  try {
    const filePath = path.join(process.cwd(), 'public', 'timelines', `${timelineId}.json`);
    
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: 'Timeline not found' },
        { status: 404 }
      );
    }
    
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const timeline = JSON.parse(fileContent);
    
    return NextResponse.json(timeline);
  } catch (error) {
    console.error('Error reading timeline file:', error);
    return NextResponse.json(
      { error: 'Failed to load timeline' },
      { status: 500 }
    );
  }
}
