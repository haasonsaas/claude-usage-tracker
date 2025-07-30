#!/usr/bin/env node

import { program } from 'commander';
import chalk from 'chalk';
import { loadUsageData } from './data-loader.js';
import { aggregateDailyUsage, getCurrentWeekUsage, getRateLimitInfo } from './analyzer.js';
import { formatDailyTable, formatWeeklySummary, formatRateLimitStatus, formatHeader } from './formatters.js';
import type { PlanType } from './config.js';

program
  .name('claude-usage')
  .description('Track and analyze Claude Code usage with rate limit awareness')
  .version('1.0.0');

program
  .command('status')
  .description('Show current week usage and rate limit status')
  .option('-p, --plan <plan>', 'Your Claude plan (Pro, $100 Max, $200 Max)', 'Pro')
  .action(async (options) => {
    try {
      const plan = options.plan as PlanType;
      if (!['Pro', '$100 Max', '$200 Max'].includes(plan)) {
        console.error(chalk.red('Invalid plan. Must be one of: Pro, $100 Max, $200 Max'));
        process.exit(1);
      }
      
      console.log(chalk.blue('Loading usage data...'));
      const entries = await loadUsageData();
      
      if (entries.length === 0) {
        console.log(chalk.yellow('No usage data found. Make sure Claude Code has been used and data is available.'));
        return;
      }
      
      const weeklyUsage = getCurrentWeekUsage(entries);
      const rateLimitInfo = getRateLimitInfo(weeklyUsage, plan);
      
      console.log(formatHeader(`Claude Code Usage Status (${plan} Plan)`));
      console.log(formatWeeklySummary(weeklyUsage));
      console.log(formatHeader('Rate Limit Status'));
      console.log(formatRateLimitStatus(rateLimitInfo));
      
      // Warnings
      if (rateLimitInfo.percentUsed.sonnet4.max > 80 || rateLimitInfo.percentUsed.opus4.max > 80) {
        console.log(chalk.red.bold('\\n⚠️  WARNING: You are approaching your weekly rate limits!'));
      } else if (rateLimitInfo.percentUsed.sonnet4.max > 50 || rateLimitInfo.percentUsed.opus4.max > 50) {
        console.log(chalk.yellow.bold('\\n⚡ NOTICE: You have used over 50% of your weekly limits.'));
      }
      
    } catch (error) {
      console.error(chalk.red('Error loading usage data:'), error);
      process.exit(1);
    }
  });

program
  .command('daily')
  .description('Show daily usage breakdown')
  .option('-d, --days <days>', 'Number of days to show', '7')
  .action(async (options) => {
    try {
      console.log(chalk.blue('Loading usage data...'));
      const entries = await loadUsageData();
      
      if (entries.length === 0) {
        console.log(chalk.yellow('No usage data found.'));
        return;
      }
      
      const dailyUsage = aggregateDailyUsage(entries);
      const days = parseInt(options.days);
      
      // Limit to requested number of days
      const recentDays = Array.from(dailyUsage.keys())
        .sort()
        .reverse()
        .slice(0, days);
      
      const filteredUsage = new Map();
      for (const day of recentDays) {
        filteredUsage.set(day, dailyUsage.get(day)!);
      }
      
      console.log(formatHeader(`Daily Usage (Last ${days} days)`));
      console.log(formatDailyTable(filteredUsage));
      
    } catch (error) {
      console.error(chalk.red('Error loading usage data:'), error);
      process.exit(1);
    }
  });

program
  .command('week')
  .description('Show current week summary')
  .action(async () => {
    try {
      console.log(chalk.blue('Loading usage data...'));
      const entries = await loadUsageData();
      
      if (entries.length === 0) {
        console.log(chalk.yellow('No usage data found.'));
        return;
      }
      
      const weeklyUsage = getCurrentWeekUsage(entries);
      
      console.log(formatHeader('Current Week Summary'));
      console.log(formatWeeklySummary(weeklyUsage));
      
    } catch (error) {
      console.error(chalk.red('Error loading usage data:'), error);
      process.exit(1);
    }
  });

program
  .command('check-limits')
  .description('Check rate limit status for all plans')
  .action(async () => {
    try {
      console.log(chalk.blue('Loading usage data...'));
      const entries = await loadUsageData();
      
      if (entries.length === 0) {
        console.log(chalk.yellow('No usage data found.'));
        return;
      }
      
      const weeklyUsage = getCurrentWeekUsage(entries);
      
      const plans: PlanType[] = ['Pro', '$100 Max', '$200 Max'];
      
      for (const plan of plans) {
        const rateLimitInfo = getRateLimitInfo(weeklyUsage, plan);
        console.log(formatHeader(`Rate Limits - ${plan} Plan`));
        console.log(formatRateLimitStatus(rateLimitInfo));
      }
      
    } catch (error) {
      console.error(chalk.red('Error loading usage data:'), error);
      process.exit(1);
    }
  });

// Default command
if (process.argv.length === 2) {
  program.parse(['node', 'cli.js', 'status']);
} else {
  program.parse(process.argv);
}