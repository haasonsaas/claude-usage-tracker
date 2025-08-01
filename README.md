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
- 📏 **Conversation Length Analytics** - Analyze conversation patterns and get optimization recommendations
- 📱 **Beautiful CLI Output** - Clean, colorful tables with actionable insights

## 🚀 Installation

### NPX (Recommended)

```bash
# Run directly without installation
npx claude-usage-tracker status

# Or use the shorter alias
npx claude-usage-tracker help
```

### Global Installation

```bash
npm install -g claude-usage-tracker
claude-usage status
```

### From Source

```bash
git clone https://github.com/haasonsaas/claude-usage-tracker.git
cd claude-usage-tracker
npm install
npm run build
```

## 📱 Quick Commands

```bash
# Check current status
npx claude-usage-tracker status

# View daily breakdown
npx claude-usage-tracker daily --days 7

# Compare all plans
npx claude-usage-tracker check-limits

# Get efficiency insights
npx claude-usage-tracker insights

# Get model recommendation
npx claude-usage-tracker recommend "Write a REST API"

# Live monitoring (press Ctrl+C to stop)
npx claude-usage-tracker watch

# Analyze conversation length patterns with cost insights
npx claude-usage-tracker length --days 30
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

### Conversation Length Analytics
```bash
claude-usage length
```

Analyze your conversation patterns and get insights on optimal conversation lengths:
- **Length distribution** across quick, medium, deep, and marathon conversations
- **Success rate analysis** by conversation length category
- **Project-specific patterns** with tailored recommendations
- **Efficiency metrics** to optimize your Claude usage
- **Actionable recommendations** for breaking down complex tasks

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
| `length` | Analyze conversation length patterns and get optimization recommendations | `-d, --days <days>` - Number of days to analyze (default: all data) |

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

### Conversation Length Analytics Output

```
╔═══════════════════════════════════╗
║ 📏 Conversation Length Analysis ║
╚═══════════════════════════════════╝

📊 Overview
Total conversations: 229
Optimal range: 21-100 messages
Deep exploration is most effective for complex problems

📈 Length Distribution
Quick (1-5 msgs): 3.5% (8 conversations)
Medium (6-20 msgs): 5.2% (12 conversations)  
Deep (21-100 msgs): 19.2% (44 conversations)
Marathon (100+ msgs): 72.1% (165 conversations)

🏗️ Project Profiles

evalops-platform:
  Conversations: 156
  Avg length: 892.3 messages
  Optimal range: 21-100 messages
  Deep exploration conversations are most effective
  💡 Recommendations:
    • Break down complex tasks into smaller conversations
    • Consider focusing on specific problems to improve efficiency

🔍 Key Insights
• Your average conversation length is 821 messages
• Your most successful conversations average 102 messages - shorter than average
• Deep conversations (21-100 msgs) show highest success rates

💡 Recommendations
• Consider breaking down complex problems into multiple focused conversations
• Marathon conversations show lower success rates - try shorter, targeted sessions
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