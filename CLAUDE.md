# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with the CIRISGUI-Standalone repository.

## Project Context

CIRISGUI-Standalone is the standalone web interface for CIRIS AI agents, providing:
- **Next.js 14 Frontend**: Modern React-based UI with TypeScript and static export
- **Complete SDK**: Full TypeScript SDK for CIRIS API integration
- **Standalone Deployment**: Optimized for localhost and static hosting
- **Simple Authentication**: Username/password for local development
- **Real-time Updates**: WebSocket support for live agent interactions

## Architecture Overview

### Repository Structure
```
CIRISGUI-Standalone/
├── app/               # Next.js 14 App Router pages
├── components/        # React components
├── contexts/          # React context providers
├── lib/
│   └── ciris-sdk/    # Complete TypeScript SDK
├── public/           # Static assets
├── docker/           # Docker configurations
└── out/              # Static export output (generated)
```

### Key Technologies
- **Frontend**: Next.js 14, React 19, TypeScript, Tailwind CSS
- **SDK**: Complete TypeScript client for CIRIS API v1.0
- **Authentication**: JWT-based with simple username/password
- **Deployment**: Static export, Docker, GitHub Actions CI/CD
- **Package Manager**: npm

## Development Guidelines

### Local Development
```bash
# Install dependencies
npm install

# Run development server
npm run dev  # Runs on http://localhost:3000

# Build static export
npm run build  # Generates ./out directory
npm start      # Serves static build locally
```

### Environment Variables
```bash
# Required for API connection
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080  # CIRIS API endpoint

# Default credentials for standalone mode
# Default username: admin
# Default password: ciris (or as configured in CIRIS API)
```

## SDK Usage

The CIRIS SDK is located in `lib/ciris-sdk/` and provides:

### Complete API Coverage
- 78+ methods across 12 resource modules
- Full TypeScript type safety
- Automatic token management
- WebSocket support for real-time updates

### Example Usage
```typescript
import { CIRISClient } from '@/lib/ciris-sdk';

const client = new CIRISClient({ 
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL 
});

// Authentication
await client.auth.login('admin', 'password');

// Agent interaction
const response = await client.agent.interact({
  message: "Hello CIRIS",
  channel_id: "web_ui"
});

// System monitoring
const health = await client.system.getHealth();
const queue = await client.system.getProcessingQueueStatus();
```

## Component Architecture

### Key Components
- **AgentSelector**: Dynamic agent discovery and selection
- **ProtectedRoute**: Authentication-aware route protection
- **SimpleLoginForm**: Username/password authentication

### Context Providers
- **AuthContext**: JWT token management
- **AgentContext**: Active agent state management

### Pages Structure
```
app/
├── login/          # Simple login page
├── interact/       # Main agent interaction interface
├── account/        # User account management
│   ├── privacy/    # Privacy settings
│   ├── consent/    # Consent management
│   └── settings/   # User preferences
├── agents/         # Agent information
├── audit/          # Audit trail viewer
├── config/         # Configuration management
├── memory/         # Memory graph visualization
├── system/         # System monitoring
└── services/       # Service health dashboard
```

## Deployment

### Standalone Static Export
This repository is configured for static export and can be deployed anywhere:
```bash
npm run build  # Creates ./out directory with static files
```

### Docker Deployment
Direct connection to CIRIS API:
```yaml
services:
  ciris-gui:
    image: ghcr.io/cirisai/ciris-gui-standalone:latest
    environment:
      - NEXT_PUBLIC_API_BASE_URL=http://ciris-api:8080
    ports:
      - "3000:3000"
```

### Local Development
```bash
# Run alongside CIRIS API
npm run dev
# Access at http://localhost:3000
# Login with default credentials (admin/ciris)
```

## CI/CD Pipeline

### Build Process
1. **Install**: Install dependencies with npm
2. **Build**: Next.js static export build
3. **Docker**: Build container image (optional)
4. **Push**: Push to GitHub Container Registry

### Deployment
- **Static**: Deploy `./out` directory to any static host
- **Docker**: `ghcr.io/cirisai/ciris-gui-standalone:latest`
- **Automatic**: GitHub Actions on main branch commits

## Testing

### Manual Testing
```bash
npm run dev
# Test locally against running CIRIS API
```

### Build Verification
```bash
npm run build
# Verify ./out directory is created successfully
```

## Security Considerations

### Authentication
- JWT tokens with automatic refresh
- Simple username/password for local development
- Tokens stored in browser localStorage
- Role-based access control (OBSERVER/ADMIN/AUTHORITY/SYSTEM_ADMIN)

### API Security
- All API calls require authentication
- Designed for trusted localhost environments
- CORS configuration for local development
- Default credentials should be changed in production

## Performance Optimization

### Next.js Optimizations
- Image optimization with next/image
- Code splitting and lazy loading
- Static generation where possible
- API route caching

### Bundle Size
- Tree shaking enabled
- Dynamic imports for heavy components
- Minimal dependencies

## Common Issues and Solutions

### CORS Errors
Ensure API allows localhost origin:
```python
# In CIRIS API
CORS(app, origins=["http://localhost:3000"])
```

### WebSocket Connection
Check WebSocket upgrade headers:
```typescript
const ws = new WebSocket(`ws://localhost:8080/v1/ws`);
ws.onopen = () => console.log('Connected');
```

### Login Issues
- Verify CIRIS API is running on port 8080
- Check default credentials match API configuration
- Ensure JWT tokens are being stored in localStorage

## Development Best Practices

### Type Safety
- Always use TypeScript interfaces
- Avoid `any` types
- Define API response types

### Component Guidelines
- Keep components small and focused
- Use composition over inheritance
- Implement proper error boundaries

### State Management
- Use React Query for server state
- Context for global UI state
- Local state for component-specific data

## Monitoring and Debugging

### Development Tools
- React Developer Tools
- Redux DevTools (if using Redux)
- Network tab for API debugging

### Production Monitoring
- Error boundaries with reporting
- Performance monitoring
- User analytics (privacy-respecting)

## Future Enhancements

### Planned Features
- [ ] Enhanced privacy and consent management
- [ ] Advanced user settings and preferences
- [ ] Improved interaction history
- [ ] Mobile-responsive design improvements
- [ ] Progressive Web App (PWA) support

### Technical Debt
- [ ] Add comprehensive component tests
- [ ] Improve error handling and user feedback
- [ ] Optimize bundle size for static export
- [ ] Add comprehensive documentation

## Contributing

### Code Style
- Follow existing patterns
- Use Prettier for formatting
- ESLint for linting
- Conventional commits

### Pull Request Process
1. Create feature branch
2. Write tests
3. Update documentation
4. Submit PR with clear description

## Resources

- **CIRIS API**: See CIRISAgent repository for API documentation
- **Next.js Static Export**: https://nextjs.org/docs/app/building-your-application/deploying/static-exports
- **TypeScript**: https://www.typescriptlang.org/docs
- **Tailwind CSS**: https://tailwindcss.com/docs

## Key Differences from Main CIRISGUI

This standalone version differs from the main CIRISGUI repository:
- **No OAuth**: Simple username/password authentication only
- **No CIRISManager**: Direct API connection, no manager integration
- **Static Export**: Optimized for static hosting and localhost use
- **Simplified Deployment**: Single container or static files
- **Focused Features**: Core agent interaction without enterprise features

Remember: This standalone GUI is designed for simple, local CIRIS agent interactions!