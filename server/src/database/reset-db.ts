import fs from 'fs';
import path from 'path';
import { DatabaseBetter as Database } from './database-better';

async function resetDatabase() {
  const dbPath = path.join(process.cwd(), 'data', 'chat-context.db');

  console.log('🔄 Resetting Chat Context Database...');

  // Remove existing database files
  [dbPath, dbPath + '-wal', dbPath + '-shm'].forEach(file => {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      console.log(`✅ Removed: ${path.basename(file)}`);
    }
  });

  // Create new database
  console.log('🏗️ Creating new database...');
  const db = new Database();

  try {
    await db.initialize();
    console.log('✅ Database initialized successfully!');

    // Test with simple session - NO PROCESSING
    console.log('🧪 Testing with simple session...');

    const testSessionId = await db.createSession({
      title: 'Test Chat Session',
      agent_id: 'test-agent-001',
      agent_type: 'other',
      project_context: 'test-project',
      original_content: `# Test Chat Session

User: Xin chào, tôi cần giúp đỡ về JavaScript.

Agent: Chào bạn! Tôi có thể giúp bạn về JavaScript. Bạn đang gặp phải vấn đề gì?

User: Tôi muốn học về async/await trong JavaScript.

Agent: Async/await rất hữu ích! Đây là cách sử dụng:

\`\`\`javascript
async function fetchData() {
  try {
    const response = await fetch('https://api.example.com/data');
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error:', error);
  }
}
\`\`\`

Bạn có câu hỏi cụ thể nào về async/await không?`,
      tags: JSON.stringify(['javascript', 'async-await', 'tutorial'])
    });

    console.log(`✅ Test session created: ${testSessionId}`);

    // Test retrieval
    const retrievedSession = await db.getSession(testSessionId);
    console.log(`✅ Session retrieved successfully`);
    console.log(`   Title: ${retrievedSession?.title}`);
    console.log(`   Content length: ${retrievedSession?.original_content.length} characters`);

    // Test search functionality
    const searchResults = await db.searchSessions({
      query: 'javascript',
      limit: 5
    });

    console.log(`✅ Search test completed: ${searchResults.length} results`);

    // Test stats
    const stats = await db.getSessionStats();
    console.log(`✅ Stats test completed: ${stats.total_sessions} total sessions`);

    console.log('🎉 Database reset and testing completed successfully!');

  } catch (error) {
    console.error('❌ Database reset failed:', error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

// Migration function for existing databases (if needed)
async function migrateDatabase() {
  const dbPath = path.join(process.cwd(), 'data', 'chat-context.db');
  
  if (!fs.existsSync(dbPath)) {
    console.log('📋 No existing database found. Use resetDatabase() instead.');
    return;
  }

  console.log('🔄 For clean architecture, recommend using resetDatabase() instead of migration.');
  console.log('💡 Current schema is simplified and optimized for raw content storage.');
}

// Run if called directly
if (require.main === module) {
  resetDatabase().catch(console.error);
}

export { resetDatabase, migrateDatabase }; 