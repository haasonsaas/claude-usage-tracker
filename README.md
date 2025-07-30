# Claude Usage Tracker

🔍 Track and analyze your Claude Code usage with rate limit awareness. Parse JSONL logs, calculate costs, and get warnings before hitting rate limits.

## ✨ Features

- 📊 **Weekly Rate Limit Tracking** - Monitor your usage against Claude Code's weekly rate limits
- 📈 **Usage Analytics** - Daily, weekly, and session-based usage analysis from real JSONL logs
- 🚨 **Proactive Warnings** - Get alerts when approaching rate limits (e.g., "Opus 4: 196.7%-786.7% used!")
- 💰 **Cost Tracking** - Monitor token usage and calculated costs ($2,196 weekly spend example)
- 🎯 **Plan Optimization** - Compare usage across Pro, $100 Max, and $200 Max plans
- 📱 **Beautiful CLI Output** - Clean, colorful tables and status displays

## 🚀 Installation

### From Source (Current)

```bash
git clone https://github.com/haasonsaas/claude-usage-tracker.git
cd claude-usage-tracker
npm install
npm run build
```

### Quick Commands

```bash
# Check current status
node dist/cli.js status

# View daily breakdown
node dist/cli.js daily --days 7

# Compare all plans
node dist/cli.js check-limits
```

## Usage

### Check Current Status
```bash
claude-usage status --plan "Pro"
```

Shows your current week usage and rate limit status for your plan.

### View Daily Usage
```bash
claude-usage daily --days 7
```

View daily breakdown of your Claude Code usage.

### Compare Plans
```bash
claude-usage check-limits
```

See how your current usage compares across all Claude Code plans.

## Commands

| Command | Description | Options |
|---------|-------------|---------|
| `status` | Show current week usage and rate limit status | `-p, --plan <plan>` - Your Claude plan (Pro, $100 Max, $200 Max) |
| `daily` | Show daily usage breakdown | `-d, --days <days>` - Number of days to show (default: 7) |
| `week` | Show current week summary | None |
| `check-limits` | Check rate limit status for all plans | None |

## Rate Limits (Effective August 28, 2025)

| Plan | Price | Sonnet 4 Weekly Limit | Opus 4 Weekly Limit |
|------|-------|----------------------|---------------------|
| Pro | $20/month | 40-80 hours | 4-8 hours |
| $100 Max | $100/month | 140-280 hours | 15-35 hours |
| $200 Max | $200/month | 240-480 hours | 24-40 hours |

## 📂 Data Sources

This tool reads Claude Code usage data from JSONL conversation logs:
- `~/.claude/projects/` - Claude Code project logs (primary)
- `~/.config/claude/projects/` - Alternative location

The tool automatically parses JSONL files to extract:
- Token usage (input, output, cache tokens)
- Model information (Sonnet 4, Opus 4, etc.)  
- Timestamps and conversation IDs
- Cost calculations based on current pricing

## 📊 Example Output

```
╔═══════════════════════════════════════╗
║ Claude Code Usage Status (Pro Plan) ║
╚═══════════════════════════════════════╝

┌───────────────────┬─────────────────┐
│ Week              │ 2025-07-28 to 2025-08-03 │
├───────────────────┼─────────────────┤
│ Total Tokens      │ 2.18M           │
├───────────────────┼─────────────────┤
│ Total Cost        │ $2196.16        │
├───────────────────┼─────────────────┤
│ Conversations     │ 24              │
└───────────────────┴─────────────────┘

┌──────────┬─────────────────┬──────────────┬───────────────┬──────────┐
│ Model    │ Estimated Usage │ Weekly Limit │ % Used        │ Status   │
├──────────┼─────────────────┼──────────────┼───────────────┼──────────┤
│ Sonnet 4 │ 9.2-18.4 hrs    │ 40-80 hrs    │ 11.5%-46.0%   │ ✅ Low   │
├──────────┼─────────────────┼──────────────┼───────────────┼──────────┤
│ Opus 4   │ 15.7-31.5 hrs   │ 4-8 hrs      │ 196.7%-786.7% │ ⚠️  High │
└──────────┴─────────────────┴──────────────┴───────────────┴──────────┘

⚠️  WARNING: You are approaching your weekly rate limits!
```

## Inspired By

This project builds on the excellent work of [ccusage](https://github.com/ryoppippi/ccusage) by [@ryoppippi](https://github.com/ryoppippi), adding specific focus on the new weekly rate limits introduced in July 2025.

## Contributing

Contributions welcome! Please feel free to submit a Pull Request.

## License

MIT © Jonathan Haas