import chalk from 'chalk';
import Table from 'cli-table3';
import type { DailyUsage, WeeklyUsage, RateLimitInfo } from './types.js';

export function formatTokenCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(2)}M`;
  } else if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }
  return count.toString();
}

export function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

export function formatHours(hours: number): string {
  return hours.toFixed(1);
}

export function formatPercentage(percent: number): string {
  return `${percent.toFixed(1)}%`;
}

export function formatDailyTable(dailyUsage: Map<string, DailyUsage>): string {
  const table = new Table({
    head: [
      chalk.cyan('Date'),
      chalk.cyan('Total Tokens'),
      chalk.cyan('Cost'),
      chalk.cyan('Conversations'),
      chalk.cyan('Models'),
    ],
    style: { head: [], border: [] },
  });
  
  const sortedDays = Array.from(dailyUsage.keys()).sort().reverse();
  
  for (const date of sortedDays) {
    const usage = dailyUsage.get(date)!;
    table.push([
      date,
      formatTokenCount(usage.totalTokens),
      chalk.green(formatCost(usage.cost)),
      usage.conversationCount.toString(),
      Array.from(usage.models).join(', '),
    ]);
  }
  
  return table.toString();
}

export function formatWeeklySummary(weeklyUsage: WeeklyUsage): string {
  const table = new Table({
    style: { head: [], border: [] },
  });
  
  table.push(
    [chalk.cyan('Week'), `${weeklyUsage.startDate} to ${weeklyUsage.endDate}`],
    [chalk.cyan('Total Tokens'), formatTokenCount(weeklyUsage.totalTokens)],
    [chalk.cyan('Prompt Tokens'), formatTokenCount(weeklyUsage.promptTokens)],
    [chalk.cyan('Completion Tokens'), formatTokenCount(weeklyUsage.completionTokens)],
    [chalk.cyan('Cache Tokens'), `${formatTokenCount(weeklyUsage.cacheCreationTokens + weeklyUsage.cacheReadTokens)}`],
    [chalk.cyan('Total Cost'), chalk.green(formatCost(weeklyUsage.cost))],
    [chalk.cyan('Conversations'), weeklyUsage.conversationCount.toString()],
    [chalk.cyan('Models Used'), Array.from(weeklyUsage.models).join(', ')],
  );
  
  return table.toString();
}

export function formatRateLimitStatus(rateLimitInfo: RateLimitInfo): string {
  const table = new Table({
    head: [
      chalk.cyan('Model'),
      chalk.cyan('Estimated Usage'),
      chalk.cyan('Weekly Limit'),
      chalk.cyan('% Used'),
      chalk.cyan('Status'),
    ],
    style: { head: [], border: [] },
  });
  
  // Sonnet 4
  const sonnet4Usage = `${formatHours(rateLimitInfo.currentUsage.estimatedHours.sonnet4.min)}-${formatHours(rateLimitInfo.currentUsage.estimatedHours.sonnet4.max)} hrs`;
  const sonnet4Limit = `${rateLimitInfo.weeklyLimits.sonnet4.min}-${rateLimitInfo.weeklyLimits.sonnet4.max} hrs`;
  const sonnet4Percent = `${formatPercentage(rateLimitInfo.percentUsed.sonnet4.min)}-${formatPercentage(rateLimitInfo.percentUsed.sonnet4.max)}`;
  const sonnet4Status = rateLimitInfo.percentUsed.sonnet4.max > 80 
    ? chalk.red('⚠️  High') 
    : rateLimitInfo.percentUsed.sonnet4.max > 50 
    ? chalk.yellow('⚡ Medium') 
    : chalk.green('✅ Low');
  
  table.push(['Sonnet 4', sonnet4Usage, sonnet4Limit, sonnet4Percent, sonnet4Status]);
  
  // Opus 4
  const opus4Usage = `${formatHours(rateLimitInfo.currentUsage.estimatedHours.opus4.min)}-${formatHours(rateLimitInfo.currentUsage.estimatedHours.opus4.max)} hrs`;
  const opus4Limit = `${rateLimitInfo.weeklyLimits.opus4.min}-${rateLimitInfo.weeklyLimits.opus4.max} hrs`;
  const opus4Percent = `${formatPercentage(rateLimitInfo.percentUsed.opus4.min)}-${formatPercentage(rateLimitInfo.percentUsed.opus4.max)}`;
  const opus4Status = rateLimitInfo.percentUsed.opus4.max > 80 
    ? chalk.red('⚠️  High') 
    : rateLimitInfo.percentUsed.opus4.max > 50 
    ? chalk.yellow('⚡ Medium') 
    : chalk.green('✅ Low');
  
  table.push(['Opus 4', opus4Usage, opus4Limit, opus4Percent, opus4Status]);
  
  return table.toString();
}

export function formatHeader(title: string): string {
  const line = '═'.repeat(title.length + 4);
  return chalk.bold.blue(`\n╔${line}╗\n║ ${title} ║\n╚${line}╝\n`);
}