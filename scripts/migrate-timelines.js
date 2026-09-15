#!/usr/bin/env node

/**
 * Migration script to load timeline JSON files from public/timelines into Neon Postgres
 * 
 * Usage:
 *   DATABASE_URL=<your-neon-url> node scripts/migrate-timelines.js
 * 
 * This script:
 * - Reads all timeline JSON files from public/timelines/
 * - Inserts them into the timelines table (current versions)
 * - Inserts archived versions into timeline_versions table
 * - Uses idempotent upserts by task_notion_id
 */

const { neon } = require('@neondatabase/serverless');
const fs = require('fs');
const path = require('path');

async function migrateTimelines() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }
  
  console.log('🔌 Connecting to Neon database...');
  const sql = neon(databaseUrl);
  
  const timelinesDir = path.join(__dirname, '..', 'public', 'timelines');
  
  if (!fs.existsSync(timelinesDir)) {
    console.error(`❌ Timelines directory not found: ${timelinesDir}`);
    process.exit(1);
  }
  
  console.log(`📂 Reading timelines from ${timelinesDir}...`);
  
  let migratedCount = 0;
  let versionCount = 0;
  
  // Read all timeline files
  const files = fs.readdirSync(timelinesDir);
  
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    
    const filePath = path.join(timelinesDir, file);
    const stat = fs.statSync(filePath);
    
    if (!stat.isFile()) continue;
    
    const taskNotionId = file.replace('.json', '');
    
    try {
      console.log(`\n📄 Processing ${file}...`);
      
      const content = fs.readFileSync(filePath, 'utf-8');
      const timeline = JSON.parse(content);
      
      const taskName = timeline.task?.title || 'Unknown';
      
      // Insert or update current version in timelines table
      await sql`
        INSERT INTO timelines (task_notion_id, task_name, version, payload, created_at, updated_at)
        VALUES (${taskNotionId}, ${taskName}, 1, ${JSON.stringify(timeline)}, NOW(), NOW())
        ON CONFLICT (task_notion_id)
        DO UPDATE SET
          task_name = EXCLUDED.task_name,
          version = timelines.version + 1,
          payload = EXCLUDED.payload,
          updated_at = NOW()
      `;
      
      migratedCount++;
      console.log(`  ✅ Migrated current version for ${taskName}`);
      
      // Check for archived versions
      const archiveDir = path.join(timelinesDir, taskNotionId, 'archive');
      
      if (fs.existsSync(archiveDir)) {
        const archiveFiles = fs.readdirSync(archiveDir);
        
        for (const archiveFile of archiveFiles) {
          if (!archiveFile.endsWith('.json') || archiveFile === 'manifest.json') continue;
          
          const archivePath = path.join(archiveDir, archiveFile);
          const archiveContent = fs.readFileSync(archivePath, 'utf-8');
          const archivedTimeline = JSON.parse(archiveContent);
          
          const timestamp = archiveFile.replace('.json', '');
          const createdAt = new Date(timestamp);
          
          // Insert archived version (idempotent by task_notion_id + created_at)
          await sql`
            INSERT INTO timeline_versions (task_notion_id, version, payload, created_at)
            VALUES (${taskNotionId}, 1, ${JSON.stringify(archivedTimeline)}, ${createdAt.toISOString()})
            ON CONFLICT (task_notion_id, created_at)
            DO NOTHING
          `;
          
          versionCount++;
          console.log(`    📦 Archived version: ${timestamp}`);
        }
      }
    } catch (error) {
      console.error(`  ❌ Error migrating ${file}:`, error.message);
    }
  }
  
  console.log(`\n✅ Migration complete!`);
  console.log(`   - ${migratedCount} current timelines migrated`);
  console.log(`   - ${versionCount} archived versions migrated`);
}

migrateTimelines()
  .then(() => {
    console.log('\n🎉 All done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
