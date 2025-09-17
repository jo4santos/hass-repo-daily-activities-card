# Daily Activities Card

A custom Home Assistant Lovelace card based on the Activity Manager Card, designed to display activities without the header section for a cleaner, more streamlined interface.

## Features

- **📋 Clean Activity Display**: Shows activities without header clutter
- **🎯 Activity Tracking**: Compatible with Activity Manager integration
- **🎨 Visual Status Indicators**: Color-coded due/overdue activities
- **📱 Mobile Optimized**: Responsive design for all devices
- **⚙️ Configurable**: Filter by category, show only due items
- **🔧 Manage Mode**: Optional delete functionality for managing activities

## Installation

### Via HACS (Recommended)

1. Open HACS in Home Assistant
2. Go to Frontend
3. Click the three dots menu → Custom repositories
4. Add this URL: `https://github.com/jo4santos/hass-repo-daily-activities-card`
5. Select category: Lovelace
6. Click Add
7. Install "Daily Activities Card"
8. Add the card resource to your dashboard

### Manual Installation

1. Download `daily-activities-card.js` from the `dist/` folder
2. Copy it to `/config/www/` in your Home Assistant installation
3. Add the resource to your dashboard:
   - Go to Settings → Dashboards → Resources
   - Add `/local/daily-activities-card.js` as a JavaScript Module

## Configuration

### Basic Configuration

```yaml
type: custom:daily-activities-card
category: Home
```

### Full Configuration

```yaml
type: custom:daily-activities-card
category: Home
showHeader: true
mode: manage
showDueOnly: true
soonHours: 24
```

## Configuration Options

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `category` | string | No | - | Filter activities to a specific category |
| `showHeader` | boolean | No | `true` | Show/hide the header with title and action buttons |
| `mode` | string | No | `basic` | Set to "manage" to enable delete buttons |
| `showDueOnly` | boolean | No | `false` | Show only activities that are due |
| `soonHours` | number | No | `24` | Hours threshold for "due soon" styling |

## How It Works

### Display
- Shows a clean list of activities without header section
- Each activity displays name, icon, and time until due
- Color-coded indicators for overdue (red) and due soon activities
- Click any activity to mark it as completed

### Manage Mode
- Enable with `mode: manage` in configuration
- Adds delete buttons to each activity
- Allows removing activities directly from the card

## Compared to Activity Manager Card

**Original Activity Manager Card:**
- Includes header with title and action buttons
- More cluttered interface
- Management controls in header

**Daily Activities Card:**
- No header section for cleaner look
- Streamlined activity-focused display
- Optional manage mode for delete functionality
- Same core functionality with simplified UI

## Requirements

- Home Assistant 2023.1.0 or later
- Activity Manager integration installed and configured

## Customization

Use [Lovelace Card Mod](https://github.com/thomasloven/lovelace-card-mod) for styling customization:

| Class | Description |
|-------|-------------|
| `.am-grid` | Activity grid layout |
| `.am-item` | Individual activity items |
| `.am-item-name` | Activity name styling |
| `.am-due` | Overdue activity styling |
| `.am-due-soon` | Due soon activity styling |
| `.am-action` | Action button container |

## Support

For issues, feature requests, or contributions, visit the [repository](https://github.com/jo4santos/hass-repo).