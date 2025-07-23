import fs from 'fs';
import path from 'path';
import { DatabaseBetter as Database } from './database-better';

async function resetDatabase() {
  const dbPath = path.join(process.cwd(), 'data', 'chat-context.db');
  
  console.log('🔄 Resetting Chat Context Database...');
  
  // Remove existing database
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    console.log('✅ Removed existing database');
  }
  
  // Remove WAL files
  const walPath = dbPath + '-wal';
  const shmPath = dbPath + '-shm';
  
  if (fs.existsSync(walPath)) {
    fs.unlinkSync(walPath);
    console.log('✅ Removed WAL file');
  }
  
  if (fs.existsSync(shmPath)) {
    fs.unlinkSync(shmPath);
    console.log('✅ Removed SHM file');
  }
  
  // Create new database
  console.log('🏗️ Creating new database...');
  const db = new Database();
  
  try {
    await db.initialize();
    console.log('✅ Database initialized successfully!');
    
    // Test FTS5 functionality
    console.log('🧪 Testing FTS5 functionality...');
    
    // Create a test session
    const testSessionId = await db.createSession({
      title: 'Test Session',
      agent_id: 'test-agent',
      agent_type: 'other',
      participants: JSON.stringify(['test-agent', 'user']),
      project_context: 'test-project',
      context_summary: 'This is a test session with JavaScript and React development topics.',
      key_topics: JSON.stringify(['javascript', 'react', 'testing']),
      decisions_made: JSON.stringify(['Use React for frontend', 'Implement testing']),
      code_snippets: JSON.stringify([{
        language: 'javascript',
        content: 'const test = () => console.log("Hello World");'
      }]),
      tags: JSON.stringify(['test', 'javascript']),
      session_hash: 'test-hash-123'
    });
    
    console.log(`✅ Test session created: ${testSessionId}`);
    
    // Test search functionality
    const searchResults = await db.searchSessions({
      query: 'javascript',
      limit: 5
    });
    
    console.log(`✅ Search test completed: ${searchResults.length} results`);
    
    // Get stats
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

// Run if called directly
if (require.main === module) {
  resetDatabase().catch(console.error);
}

export { resetDatabase }; 