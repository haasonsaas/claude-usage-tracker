import { ConversationLengthAnalyzer } from './dist/conversation-length-analytics.js';

// Simulate the test data for optimal range calculation
function createSuccessfulConversation(conversationId, messageCount, project, successful, dayOffset = 0) {
  const entries = [];
  const baseTime = new Date('2024-01-01T10:00:00Z');
  baseTime.setDate(baseTime.getDate() + dayOffset); // Spread conversations across different days
  
  for (let i = 0; i < messageCount; i++) {
    const timestamp = new Date(baseTime.getTime() + i * 60000);
    entries.push({
      timestamp: timestamp.toISOString(),
      conversationId: conversationId,
      instanceId: project,
      model: 'claude-3-sonnet',
      requestId: `req_${conversationId}_${i + 1}`,
      prompt_tokens: 100,
      completion_tokens: 50,
      cost: 1.0
    });
  }
  
  // If unsuccessful, create a quick follow-up (simulates needing to continue)
  if (!successful) {
    const followUpTime = new Date(baseTime.getTime() + messageCount * 60000 + 30 * 60000); // 30 min later
    entries.push({
      timestamp: followUpTime.toISOString(),
      conversationId: conversationId + '_followup',
      instanceId: project,
      model: 'claude-3-sonnet',
      requestId: `req_${conversationId}_followup_1`,
      prompt_tokens: 50,
      completion_tokens: 25,
      cost: 0.5
    });
  }
  
  return entries;
}

const analyzer = new ConversationLengthAnalyzer();

// Test data matching the failing test
const entries = [
  ...createSuccessfulConversation('quick1', 3, 'test', false, 0), // Quick but unsuccessful - day 1
  ...createSuccessfulConversation('medium1', 15, 'test', true, 1), // Medium and successful - day 2
  ...createSuccessfulConversation('medium2', 18, 'test', true, 2), // Medium and successful - day 3
  ...createSuccessfulConversation('deep1', 80, 'test', false, 3)   // Deep but unsuccessful - day 4
];

analyzer.loadConversations(entries);

// Debug: examine conversations and their success indicators
console.log('Debug conversation analysis:');
for (const [convId, convEntries] of analyzer.conversations) {
  const messageCount = convEntries.length;
  const category = messageCount <= 5 ? 'quick' : messageCount <= 20 ? 'medium' : messageCount <= 100 ? 'deep' : 'marathon';
  console.log(`Conversation ${convId}: ${convEntries.length} messages (${category}), project: ${convEntries[0].instanceId}`);
  
  // Check if it has follow-up
  const hasFollowUp = [...analyzer.conversations.keys()].some(otherId => 
    otherId !== convId && otherId.startsWith(convId + '_')
  );
  console.log(`  Has follow-up: ${hasFollowUp}`);
}

const analysis = analyzer.analyzeConversationLengths();

console.log('\nAnalysis results:');
console.log('Total conversations:', analysis.totalConversations);
console.log('Optimal range:', analysis.overallOptimalRange);
console.log('Length distribution:', analysis.lengthDistribution);
console.log('Project profiles:', analysis.projectProfiles.length);
if (analysis.projectProfiles.length > 0) {
  console.log('First project efficiency by length:', analysis.projectProfiles[0].efficiencyByLength);
}
console.log('Recommendations:', analysis.recommendations);
