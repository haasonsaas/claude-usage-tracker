# Claude Usage Tracker

🔍 Track and analyze your Claude Code usage with rate limit awareness. Parse JSONL logs, calculate costs, and get warnings before hitting rate limits.

## ✨ Features

- 📊 **Personalized Rate Limit Tracking** - Calculates accurate usage estimates from YOUR conversation patterns
- 📈 **Real Data Analysis** - Analyzes session durations and token patterns from JSONL logs
- 🚨 **Precise Warnings** - Shows exact usage like "Sonnet 4: 89.5 hrs (111.9% of limit)" instead of vague ranges
- 💰 **Accurate Cost Tracking** - Monitor real token usage and costs ($2,200 weekly spend)
- 🎯 **Smart Plan Recommendations** - Compare your actual usage across Pro, $100 Max, and $200 Max plans
- 🤖 **AI Model Advisor** - Get real-time recommendations on whether to use Sonnet vs Opus for maximum savings
- 🔴 **Live Monitoring** - Real-time dashboard with burn rate analysis and efficiency alerts
- 📱 **Beautiful CLI Output** - Clean, colorful tables with actionable insights

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

# Get efficiency insights
node dist/cli.js insights

# Get model recommendation
node dist/cli.js recommend "Write a REST API"

# Live monitoring (press Ctrl+C to stop)
node dist/cli.js watch
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

### Get Model Recommendations
```bash
claude-usage recommend "Write a function to sort arrays"
# or interactive mode
claude-usage recommend
```

Get AI-powered recommendations on whether to use Sonnet 4 or Opus 4 for your specific task, with cost savings calculations.

### Live Usage Monitoring
```bash
claude-usage watch
```

Real-time monitoring dashboard showing:
- **Live cost tracking** with today's spend and burn rate analysis
- **Conversation efficiency** ratings (⭐⭐⭐ for high efficiency)
- **Weekly progress** toward rate limits
- **Real-time alerts** for high burn rates or inefficient conversations

## Commands

| Command | Description | Options |
|---------|-------------|---------|
| `status` | Show current week usage and rate limit status | `-p, --plan <plan>` - Your Claude plan (Pro, $100 Max, $200 Max) |
| `daily` | Show daily usage breakdown | `-d, --days <days>` - Number of days to show (default: 7) |
| `week` | Show current week summary | None |
| `check-limits` | Check rate limit status for all plans | None |
| `insights` | Show detailed efficiency insights and optimization recommendations | `-d, --days <days>` - Number of days to analyze (default: 30) |
| `recommend` | Get AI-powered model recommendation for your task | `[prompt]` - Task description (optional, will prompt interactively) |
| `watch` | Live monitoring with real-time cost tracking and burn rate analysis | None - Press Ctrl+C to stop |

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

The tool automatically parses JSONL files to extract and analyze:
- **Token usage** (input, output, cache tokens) per conversation
- **Session durations** calculated from message timestamps
- **Personal usage patterns** to estimate accurate hours-per-model
- **Model information** (Sonnet 4, Opus 4, etc.) with precise rate calculations
- **Cost calculations** based on current Anthropic pricing

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

┌──────────┬─────────────────┬──────────────┬─────────┬──────────┐
│ Model    │ Estimated Usage │ Weekly Limit │ % Used  │ Status   │
├──────────┼─────────────────┼──────────────┼─────────┼──────────┤
│ Sonnet 4 │ 89.5 hrs        │ 40-80 hrs    │ 111.9%  │ ⚠️  High │
├──────────┼─────────────────┼──────────────┼─────────┼──────────┤
│ Opus 4   │ 99.2 hrs        │ 4-8 hrs      │ 1240.1% │ ⚠️  High │
└──────────┴─────────────────┴──────────────┴─────────┴──────────┘

⚠️  WARNING: You are approaching your weekly rate limits!
```

## 🎯 **Why This Is Better**

**Before**: Vague ranges like "9.2-18.4 hrs" based on arbitrary estimates  
**Now**: Precise estimates like "89.5 hrs" calculated from YOUR actual coding sessions

The tool analyzes your conversation patterns over the last 2 weeks to calculate personalized tokens-per-hour rates, giving you actionable insights for plan optimization.

## Inspired By

This project builds on the excellent work of [ccusage](https://github.com/ryoppippi/ccusage) by [@ryoppippi](https://github.com/ryoppippi), adding specific focus on the new weekly rate limits introduced in July 2025.

## Contributing

Contributions welcome! Please feel free to submit a Pull Request.

## License

MIT © Jonathan Haas