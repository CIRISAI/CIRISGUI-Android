// Adapter configuration data
export const ADAPTERS = {
  core: [
    {
      id: "api",
      name: "API Adapter",
      description:
        "RESTful API server with OAuth2 authentication, role-based access control, and WebSocket support. Includes 150+ REST endpoints with full OpenAPI documentation.",
      tools: 3,
      required: true,
      configFields: [
        {
          name: "port",
          label: "API Port",
          type: "number",
          default: "8080",
          envVar: "CIRIS_API_PORT",
          description: "Port to bind the API server (default: 8080)",
          required: false,
        },
      ],
    },
    {
      id: "cli",
      name: "CLI Adapter",
      description:
        "Interactive command-line interface for development and testing. Includes mock LLM integration for offline operation and debugging tools.",
      tools: 2,
      required: false,
      configFields: [],
    },
    {
      id: "discord",
      name: "Discord Adapter",
      description:
        "Discord bot for community moderation. Multi-channel support, Wise Authority deferral, real-time monitoring, content filtering, and role management. Includes 11 tools for message sending, moderation, role management, and user/channel information retrieval.",
      tools: 11,
      required: false,
      configFields: [
        {
          name: "bot_token",
          label: "Bot Token",
          type: "password",
          envVar: "DISCORD_BOT_TOKEN",
          description: "Discord bot token from https://discord.com/developers/applications",
          required: true,
        },
        {
          name: "channel_id",
          label: "Home Channel ID",
          type: "text",
          envVar: "DISCORD_HOME_CHANNEL_ID",
          description:
            "Primary Discord channel ID to monitor (optional, discovers first available if not set)",
          required: false,
        },
      ],
    },
    {
      id: "reddit",
      name: "Reddit Adapter",
      description:
        "Reddit integration for subreddit moderation. Post, reply, moderate with AI transparency disclosure and deletion compliance. Includes 8 tools covering user context, posting, commenting, content removal, observation, deletion, and identity disclosure.",
      tools: 8,
      required: false,
      configFields: [
        {
          name: "client_id",
          label: "Client ID",
          type: "text",
          envVar: "CIRIS_REDDIT_CLIENT_ID",
          description: "Reddit app client ID from https://www.reddit.com/prefs/apps",
          required: true,
        },
        {
          name: "client_secret",
          label: "Client Secret",
          type: "password",
          envVar: "CIRIS_REDDIT_CLIENT_SECRET",
          description: "Reddit app client secret",
          required: true,
        },
        {
          name: "username",
          label: "Username",
          type: "text",
          envVar: "CIRIS_REDDIT_USERNAME",
          description: "Reddit account username",
          required: true,
        },
        {
          name: "password",
          label: "Password",
          type: "password",
          envVar: "CIRIS_REDDIT_PASSWORD",
          description: "Reddit account password",
          required: true,
        },
      ],
    },
  ],
  modular: [
    {
      id: "external_data_sql",
      name: "SQL Database Connector",
      description:
        "SQL database access for DSAR automation and external data queries. Supports SQLite, MySQL, and PostgreSQL with dialect-aware operations. Includes 9 tools for user data discovery, export, deletion, anonymization, and verification.",
      tools: 9,
      configFields: [
        {
          name: "connection_string",
          label: "Connection String",
          type: "text",
          envVar: "CIRIS_SQL_CONNECTION_STRING",
          description:
            "Database connection string (e.g., sqlite:////path/to/db.db or postgresql://user:pass@host:port/db)",
          required: true,
        },
        {
          name: "dialect",
          label: "SQL Dialect",
          type: "select",
          options: ["sqlite", "mysql", "postgresql"],
          default: "sqlite",
          envVar: "CIRIS_SQL_DIALECT",
          description: "Database dialect/type",
          required: true,
        },
        {
          name: "privacy_schema_path",
          label: "Privacy Schema Path",
          type: "text",
          envVar: "CIRIS_SQL_PRIVACY_SCHEMA_PATH",
          description:
            "Path to YAML privacy schema configuration (optional, required for DSAR operations)",
          required: false,
        },
      ],
    },
    {
      id: "geo_wisdom",
      name: "Geographic Navigation",
      description:
        "Location-based queries and navigation assistance via OpenStreetMap integration. Provides safe geographic information with 2 tools for route guidance and location queries.",
      tools: 2,
      configFields: [],
    },
    {
      id: "weather_wisdom",
      name: "Weather Advisories",
      description:
        "Real-time weather information and advisories via NOAA API integration. Provides weather forecasts and alerts with 2 tools for weather guidance.",
      tools: 2,
      configFields: [
        {
          name: "openweathermap_api_key",
          label: "OpenWeatherMap API Key",
          type: "password",
          envVar: "CIRIS_OPENWEATHERMAP_API_KEY",
          description: "Optional API key for OpenWeatherMap fallback (free tier available)",
          required: false,
        },
      ],
    },
    {
      id: "sensor_wisdom",
      name: "IoT Sensor Integration",
      description:
        "Home Assistant integration for IoT sensor interpretation. Filters medical sensors for safety compliance. Includes 3 tools for sensor guidance and automation triggering.",
      tools: 3,
      configFields: [
        {
          name: "homeassistant_url",
          label: "Home Assistant URL",
          type: "text",
          default: "http://homeassistant.local:8123",
          envVar: "CIRIS_HOMEASSISTANT_URL",
          description: "Home Assistant instance URL",
          required: false,
        },
        {
          name: "homeassistant_token",
          label: "Home Assistant Token",
          type: "password",
          envVar: "CIRIS_HOMEASSISTANT_TOKEN",
          description: "Home Assistant Long-Lived Access Token (required for operation)",
          required: true,
        },
      ],
    },
  ],
};
