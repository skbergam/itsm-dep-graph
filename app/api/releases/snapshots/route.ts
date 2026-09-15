import { NextRequest, NextResponse } from 'next/server';
import { getDbClient, isDatabaseAvailable, ReleaseMetricSnapshot } from '@/lib/db';

// GET /api/releases/snapshots?date=YYYY-MM-DD&release_id=xxx
export async function GET(request: NextRequest) {
  if (!isDatabaseAvailable()) {
    return NextResponse.json(
      { error: 'Database not configured' },
      { status: 503 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const date = searchParams.get('date');
  const releaseId = searchParams.get('release_id');

  if (!date || !releaseId) {
    return NextResponse.json(
      { error: 'date and release_id are required' },
      { status: 400 }
    );
  }

  try {
    const sql = getDbClient();
    if (!sql) {
      return NextResponse.json(
        { error: 'Database connection failed' },
        { status: 500 }
      );
    }

    const snapshots = await sql`
      SELECT * FROM release_metric_snapshots
      WHERE snapshot_date = ${date}
        AND release_notion_id = ${releaseId}
      ORDER BY scope DESC, section, component_name
    `;

    return NextResponse.json({ snapshots });
  } catch (error) {
    console.error('Error fetching snapshots:', error);
    return NextResponse.json(
      { error: 'Failed to fetch snapshots' },
      { status: 500 }
    );
  }
}

// POST /api/releases/snapshots
// Body: { date: 'YYYY-MM-DD', release_id: string, snapshots: ReleaseMetricSnapshot[] }
export async function POST(request: NextRequest) {
  if (!isDatabaseAvailable()) {
    return NextResponse.json(
      { error: 'Database not configured' },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { date, release_id, snapshots } = body;

    if (!date || !release_id || !Array.isArray(snapshots)) {
      return NextResponse.json(
        { error: 'date, release_id, and snapshots array are required' },
        { status: 400 }
      );
    }

    const sql = getDbClient();
    if (!sql) {
      return NextResponse.json(
        { error: 'Database connection failed' },
        { status: 500 }
      );
    }

    // Delete existing snapshots for this date and release
    await sql`
      DELETE FROM release_metric_snapshots
      WHERE snapshot_date = ${date}
        AND release_notion_id = ${release_id}
    `;

    // Insert new snapshots
    if (snapshots.length > 0) {
      const values = snapshots.map((s: any) => ({
        snapshot_date: date,
        release_notion_id: release_id,
        release_name: s.release_name,
        scope: s.scope,
        component_name: s.component_name || null,
        section: s.section || null,
        alpha_n: s.alpha_n,
        alpha_d: s.alpha_d,
        beta_n: s.beta_n,
        beta_d: s.beta_d,
        ga_n: s.ga_n,
        ga_d: s.ga_d,
      }));

      for (const val of values) {
        await sql`
          INSERT INTO release_metric_snapshots (
            snapshot_date, release_notion_id, release_name, scope,
            component_name, section, alpha_n, alpha_d, beta_n, beta_d, ga_n, ga_d
          ) VALUES (
            ${val.snapshot_date}, ${val.release_notion_id}, ${val.release_name}, ${val.scope},
            ${val.component_name}, ${val.section}, ${val.alpha_n}, ${val.alpha_d},
            ${val.beta_n}, ${val.beta_d}, ${val.ga_n}, ${val.ga_d}
          )
        `;
      }
    }

    return NextResponse.json({ success: true, count: snapshots.length });
  } catch (error) {
    console.error('Error saving snapshots:', error);
    return NextResponse.json(
      { error: 'Failed to save snapshots' },
      { status: 500 }
    );
  }
}
