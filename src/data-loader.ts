import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { glob } from 'glob';
import { CLAUDE_DATA_PATHS } from './config.js';
import { UsageEntry, usageEntrySchema } from './types.js';

export async function loadUsageData(): Promise<UsageEntry[]> {
  const entries: UsageEntry[] = [];
  
  for (const basePath of CLAUDE_DATA_PATHS) {
    if (!existsSync(basePath)) {
      continue;
    }
    
    const pattern = join(basePath, '**', '*.jsonl');
    const files = await glob(pattern);
    
    for (const file of files) {
      try {
        const content = readFileSync(file, 'utf-8');
        const lines = content.trim().split('\n').filter(line => line);
        
        for (const line of lines) {
          try {
            const json = JSON.parse(line);
            const parsed = usageEntrySchema.safeParse(json);
            
            if (parsed.success) {
              entries.push(parsed.data);
            }
          } catch {
            // Skip malformed lines
          }
        }
      } catch (error) {
        console.error(`Error reading file ${file}:`, error);
      }
    }
  }
  
  return entries.sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}