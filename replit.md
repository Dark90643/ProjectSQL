# Overview

AEGIS_NET is a multi-tenant, Discord-integrated secure case management system. It supports both traditional username/password authentication and Discord OAuth2 login. Each Discord server gets its own workspace with independent case management, agent rosters, and data storage. Users authenticate via Discord OAuth and permissions are verified based on Discord server ownership and roles. The application provides role-based access control with three user levels (Agent, Management, Overseer), case tracking with public/private visibility, Discord bot with moderation capabilities, and comprehensive audit logging. The system features a government/intelligence agency aesthetic with a focus on security and controlled information dissemination.

# User Preferences

Preferred communication style: Simple, everyday language.

# Discord OAuth Setup

**Discord Developer Application Configuration**:
1. Create app at https://discord.com/developers/applications
2. Set OAuth2 Redirect URI to: `{API_URL}/api/auth/discord/callback`
3. Copy Client ID and Client Secret to Replit secrets (DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET)
4. Enable "Identify", "Email", and "Guilds" OAuth scopes in Discord settings

**Environment Variables Required**:
- `DISCORD_CLIENT_ID` - Discord application client ID
- `DISCORD_CLIENT_SECRET` - Discord application client secret (should be in secrets)
- `API_URL` - Backend API URL (defaults to http://localhost:5000)
- `FRONTEND_URL` - Frontend URL for OAuth redirects (defaults to http://localhost:5000)

# System Architecture

## Frontend Architecture

**Framework**: React with TypeScript using Vite as the build tool and development server.

**UI Library**: Shadcn UI (New York variant) with Radix UI primitives for accessible components. The design system uses CSS variables for theming with a neutral base color and supports dark mode.

**Styling**: TailwindCSS v4 with custom configuration, using CSS variables for theme customization. Custom animations and utilities are implemented through the tailwindcss-animate plugin.

**State Management**: TanStack Query (React Query) for server state management with credentials included in all requests. Auth state is managed through a React Context provider.

**Routing**: Wouter for lightweight client-side routing with protected routes that redirect unauthenticated users.

**Form Handling**: React Hook Form with Zod validation for type-safe form schemas.

## Backend Architecture

**Runtime**: Node.js with TypeScript using ES modules.

**Framework**: Express.js for HTTP server with custom middleware for request logging and error handling.

**Session Management**: Express-session with connect-pg-simple for PostgreSQL-backed session storage. Sessions persist for 30 days and use httpOnly cookies with lax SameSite policy.

**Authentication**: Passport.js with Local Strategy for username/password authentication. Passwords are hashed using bcryptjs (10 rounds). The system includes an invite code mechanism for user registration.

**API Design**: RESTful endpoints organized by resource type (auth, users, cases, invites, recovery) with role-based authorization middleware.

**Development Server**: Vite middleware integration in development mode for HMR and asset serving. Production mode serves static files from the dist/public directory.

## Data Storage

**Database**: PostgreSQL accessed through Neon serverless driver with WebSocket support for serverless environments.

**ORM**: Drizzle ORM for type-safe database queries and schema management. Schema is defined in TypeScript with automatic type inference.

**Schema Structure**:
- **users**: Authentication and role management (Agent/Management/Overseer levels)
- **cases**: Case records with public/private visibility, priority levels, status tracking, and optional Google Doc integration
- **logs**: Audit trail for all system actions with user and target tracking
- **inviteCodes**: Registration control through one-time use codes
- **modWarnings**: User moderation tracking with server-scoped warnings
- **modMutes**: User mute records with duration and unmute tracking
- **modBans**: User ban records with per-server tracking
- **modIps**: IP address bans with per-server tracking
- **modLogs**: Comprehensive moderation audit trail for all actions
- **serverPermissions**: Per-server Discord bot command permission configuration

**Migrations**: Drizzle Kit for schema migrations with PostgreSQL dialect, storing migration files in the `/migrations` directory.

## Authentication & Authorization

**Strategy**: Session-based authentication with role-based access control (RBAC).

**User Roles**: Three-tier hierarchy with different permission levels:
- Agent: Basic access to cases
- Management: Administrative functions including user management
- Overseer: Full system access

**Security Features**:
- Invite-code based registration to control user onboarding
- Account suspension capability
- IP tracking for user sessions
- Optional invite verification requirement per user
- Online status tracking

## Multi-Tenant Architecture

**Server Workspaces**: Each Discord server gets an isolated workspace with:
- Server-specific case management and audit logs
- Server members with role-based permissions
- Independent data storage and access control
- Server-specific Agent Roster (see Agent Roster section below)

**Discord OAuth2 Authentication**:
- `/api/auth/discord/login` - Returns Discord OAuth authorization URL
- `/api/auth/discord/callback` - Discord OAuth callback endpoint that exchanges code for token, fetches user guilds, and redirects to frontend
- `/api/auth/discord/servers` - Returns list of user's Discord servers
- `/api/auth/discord/select-server` - Creates workspace context and logs user in
- `/api/auth/discord/check-bot` - Verifies if bot is in the selected server
- `/api/auth/discord/mock-callback` - Legacy endpoint for mock testing
- `/api/auth/check-support-team` - Checks if user is admin/owner of official bot server
- Frontend routes: `/discord-auth` for handling Discord OAuth callback
- Frontend routes: `/server-selector` for server selection after Discord login
- Frontend routes: `/bot-invite` for adding bot to servers that don't have it
- Supports real Discord OAuth2 flow with automatic guild synchronization
- Also supports traditional username/password login

**Server Member Roles**:
- Owner → Overseer role (full system access)
- Admin → Management role (administrative functions)
- Member → Agent role (basic case access)

**Bot Verification**: When selecting a server, the system checks if the AEGIS bot is already in that server. If not, users are directed to an invitation page to add the bot before proceeding to the dashboard.

## Account Management & Support Team

**Account Creation Access**: 
- Account creation (registration via "REGISTER" tab) is restricted to administrators and owners of the official AEGIS bot server (Discord server ID: `1441447050024714252`)
- The REGISTER tab is only visible to users who are admins or owners in that server
- All other users can only log in with existing credentials (username/password)
- This ensures account creation is controlled by the support team

**Support Team Role**:
- Administrators and owners of the official bot server ID `1441447050024714252` are designated as the support team
- Support team members get access to the Support Panel page (`/support-panel`)
- Only support team can access the account creation/registration features

## Agent Roster

**Per-Server Agent Rosters**: In the multi-server architecture, each Discord server maintains its own Agent Roster containing:
- All users with access to that specific server's workspace
- User roles (Agent, Management, Overseer) scoped to that server
- User online status tracking
- Account suspension status per user

**Access**: Agent Roster is accessible through the Admin Panel (`/admin`) when logged into a specific server workspace. Shows only agents/staff members of that particular server.

**Support Panel for Cross-Server Management**: Support team members can access `/support-panel` to:
- View all cases across all servers
- Filter cases by server
- Access server statistics (total cases, active cases, closed cases)
- Search for specific cases across all servers
- Monitor overall platform health and case distribution
- This is separate from per-server Admin Panel access

## External Dependencies

**Discord Integration**: 
- Discord.js v14 for bot functionality with comprehensive slash commands
- **Server-Scoped Case Search**: `/search`, `/case`, `/cases` commands only show cases from the current Discord server with pagination (Previous/Next buttons)
- **Moderation Commands**: `/warn`, `/kick`, `/ban`, `/mute`, `/unmute`, `/modlog`
- **IP Ban Command**: `/ipban` for banning IP addresses from servers
- **User Tracking Commands**: `/userhistory`, `/userwarnings`, `/userbans`, `/usermutes` for viewing individual moderation records
- **Intel Research Command**: `/user-lookup` for searching Discord users and Roblox accounts
  - Can search by Discord user mention/ID
  - Can search by Roblox username or user ID
  - Returns account creation dates, profile URLs, and status information
  - Uses public Roblox API (no authentication required)
- **Lockdown Features**:
  - `/lockdown` - Lock/unlock individual channels to prevent message sending
  - `/server-lockdown` - Lock/unlock entire server (all text channels)
  - Useful for emergency situations, data breaches, or planned maintenance
- **Malicious Link & DoXX Prevention**:
  - Automatic detection and deletion of messages containing:
    - IP addresses (prevents IP doxxing)
    - SSN patterns
    - Credit card patterns
    - API keys and tokens
    - Password patterns
  - Users receive DM notification when message is deleted
  - Admin logging of suspicious content removal
- **Raid Protection Features**: `/enable-raid-protection`, `/disable-raid-protection`, `/raid-status`
- **Security Configuration**: `/security-config` for account age and join rate limits
- **Per-Server Permission System**:
  - `/set-command-permissions` allows admins to configure who can use bot commands
  - Each server can have specific roles with command access
  - Administrator permission can be enabled/disabled per server
  - Permissions are stored in-memory per server (not persisted to database currently)
- Webhook integration for case notifications with rich embeds
- Account age verification and join rate limiting for raid detection
- Comprehensive moderation logging and audit trails

**Database Service**: Neon PostgreSQL serverless with connection pooling through @neondatabase/serverless.

**Third-party Services**:
- Google Docs integration (optional URL field on cases)
- Discord webhooks for audit trail and case publication notifications
- Custom Discord bot with client ID for server management

**Development Tools**:
- Replit-specific plugins for error overlays, cartographer, and dev banner
- Runtime error modal for development debugging
- Hot Module Replacement through Vite