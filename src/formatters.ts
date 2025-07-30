import chalk from 'chalk';
import Table from 'cli-table3';
import type { DailyUsage, WeeklyUsage, RateLimitInfo } from './types.js';
import type { EfficiencyInsights, HourlyUsage, ModelEfficiency } from './analyzer.js';

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
  
  // Sonnet 4 (using actual calculated usage)
  const sonnet4Usage = `${formatHours(rateLimitInfo.currentUsage.estimatedHours.sonnet4.min)} hrs`;
  const sonnet4Limit = `${rateLimitInfo.weeklyLimits.sonnet4.min}-${rateLimitInfo.weeklyLimits.sonnet4.max} hrs`;
  const sonnet4Percent = `${formatPercentage(rateLimitInfo.percentUsed.sonnet4.min)}`;
  const sonnet4Status = rateLimitInfo.percentUsed.sonnet4.min > 80 
    ? chalk.red('⚠️  High') 
    : rateLimitInfo.percentUsed.sonnet4.min > 50 
    ? chalk.yellow('⚡ Medium') 
    : chalk.green('✅ Low');
  
  table.push(['Sonnet 4', sonnet4Usage, sonnet4Limit, sonnet4Percent, sonnet4Status]);
  
  // Opus 4 (using actual calculated usage)
  const opus4Usage = `${formatHours(rateLimitInfo.currentUsage.estimatedHours.opus4.min)} hrs`;
  const opus4Limit = `${rateLimitInfo.weeklyLimits.opus4.min}-${rateLimitInfo.weeklyLimits.opus4.max} hrs`;
  const opus4Percent = `${formatPercentage(rateLimitInfo.percentUsed.opus4.min)}`;
  const opus4Status = rateLimitInfo.percentUsed.opus4.min > 80 
    ? chalk.red('⚠️  High') 
    : rateLimitInfo.percentUsed.opus4.min > 50 
    ? chalk.yellow('⚡ Medium') 
    : chalk.green('✅ Low');
  
  table.push(['Opus 4', opus4Usage, opus4Limit, opus4Percent, opus4Status]);
  
  return table.toString();
}

export function formatHeader(title: string): string {
  const line = '═'.repeat(title.length + 4);
  return chalk.bold.blue(`\n╔${line}╗\n║ ${title} ║\n╚${line}╝\n`);
}

export function formatHourlyUsage(hourlyUsage: HourlyUsage[]): string {
  const table = new Table({
    head: ['Hour', 'Tokens', 'Cost', 'Conversations', 'Sonnet %', 'Opus %'],
    style: { head: [], border: [] },
  });

  // Sort by hour and only show hours with usage
  const activeHours = hourlyUsage
    .filter(h => h.totalTokens > 0)
    .sort((a, b) => a.hour - b.hour);

  for (const hour of activeHours) {
    const timeStr = `${hour.hour.toString().padStart(2, '0')}:00`;
    const sonnetPercent = hour.totalTokens > 0 
      ? ((hour.sonnetTokens / hour.totalTokens) * 100).toFixed(0) + '%'
      : '0%';
    const opusPercent = hour.totalTokens > 0 
      ? ((hour.opusTokens / hour.totalTokens) * 100).toFixed(0) + '%'
      : '0%';

    table.push([
      timeStr,
      formatTokenCount(hour.totalTokens),
      formatCost(hour.cost),
      hour.conversationCount.toString(),
      sonnetPercent,
      opusPercent,
    ]);
  }

  return table.toString();
}

export function formatModelEfficiency(modelEfficiency: ModelEfficiency[]): string {
  const table = new Table({
    head: ['Model', 'Conversations', 'Avg Tokens/Conv', 'Avg Cost/Conv', 'Cost/Token'],
    style: { head: [], border: [] },
  });

  // Sort by total cost (highest first)
  const sortedModels = modelEfficiency.sort((a, b) => b.totalCost - a.totalCost);

  for (const model of sortedModels) {
    const modelName = model.model.includes('sonnet') ? 'Sonnet 4' :
                     model.model.includes('opus') ? 'Opus 4' : 
                     model.model;

    table.push([
      modelName,
      model.totalConversations.toString(),
      formatTokenCount(model.avgTokensPerConversation),
      formatCost(model.avgCostPerConversation),
      formatCost(model.costPerToken * 1000) + '/1K',
    ]);
  }

  return table.toString();
}

export function formatEfficiencyInsights(insights: EfficiencyInsights): string {
  let output = '';

  // Peak hours analysis
  output += formatHeader('Peak Usage Hours');
  const peakHoursStr = insights.peakHours
    .map(h => `${h.toString().padStart(2, '0')}:00`)
    .join(', ');
  output += `Your heaviest usage hours: ${chalk.yellow(peakHoursStr)}\n`;
  output += `💡 Consider scheduling intensive work during off-peak hours to avoid rate limits.\n\n`;

  // Model efficiency
  output += formatHeader('Model Efficiency Analysis');
  output += formatModelEfficiency(insights.modelEfficiency);
  output += '\n';

  // Cost savings opportunity
  if (insights.costSavingsOpportunity.potentialSavings > 100) {
    output += formatHeader('💰 Cost Optimization Opportunity');
    output += chalk.green(`Potential monthly savings: $${insights.costSavingsOpportunity.potentialSavings.toFixed(0)}\n`);
    output += `${insights.costSavingsOpportunity.recommendation}\n\n`;
  }

  // Hourly breakdown
  output += formatHeader('Hourly Usage Pattern');
  output += formatHourlyUsage(insights.hourlyUsage);

  return output;
}