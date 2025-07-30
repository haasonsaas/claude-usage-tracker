# Claude Usage Tracker

Track and analyze your Claude Code usage with rate limit awareness to help optimize your weekly quota usage.

## Features

- 📊 **Weekly Rate Limit Tracking** - Monitor your usage against Claude Code's new weekly rate limits
- 📈 **Usage Analytics** - Daily, weekly, and session-based usage analysis  
- 🚨 **Proactive Warnings** - Get alerts when approaching rate limits
- 💰 **Cost Tracking** - Monitor token usage and estimated costs
- 🎯 **Plan Optimization** - Compare usage across Pro, $100 Max, and $200 Max plans
- 📱 **Beautiful CLI Output** - Clean, colorful tables and status displays

## Installation

### Quick Start (No Installation)

```bash
# Using npx (recommended)
npx claude-usage-tracker status

# Check daily usage
npx claude-usage-tracker daily

# Compare rate limits across plans
npx claude-usage-tracker check-limits
```

### Global Installation

```bash
npm install -g claude-usage-tracker
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

## Data Sources

This tool reads Claude Code usage data from:
- `~/.config/claude/projects/` (new default location)
- `~/.claude/projects/` (legacy location)

Set `CLAUDE_CONFIG_DIR` environment variable to specify custom paths.

## Inspired By

This project builds on the excellent work of [ccusage](https://github.com/ryoppippi/ccusage) by [@ryoppippi](https://github.com/ryoppippi), adding specific focus on the new weekly rate limits introduced in July 2025.

## Contributing

Contributions welcome! Please feel free to submit a Pull Request.

## License

MIT © Jonathan Haas