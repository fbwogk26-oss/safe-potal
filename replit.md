# SafeBoard - Safety Evaluation Portal

## Overview

SafeBoard is a Korean-language enterprise safety management portal for tracking team safety scores, managing safety notices, rules, education materials, vehicle management, and safety equipment. The application provides a dashboard with real-time safety score visualization, administrative controls with PIN-based locking, and CRUD operations for various safety-related content categories.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight client-side router)
- **State Management**: TanStack React Query for server state
- **Styling**: Tailwind CSS with shadcn/ui component library (New York style)
- **Charts**: Recharts for data visualization (bar charts for safety scores)
- **Animations**: Framer Motion for UI transitions
- **Build Tool**: Vite with custom path aliases (@/, @shared/, @assets/)

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **API Pattern**: REST API with typed route definitions in shared/routes.ts
- **File Uploads**: Multer for image and file handling (stored in /uploads directory)
- **Database Access**: Drizzle ORM with PostgreSQL dialect
- **Build System**: esbuild for server bundling, Vite for client

### Data Storage
- **Database**: PostgreSQL via Drizzle ORM
- **Schema Location**: shared/schema.ts
- **Tables**:
  - `teams`: Safety score data with vehicle counts, accidents, fines, and calculated scores
  - `notices`: Multi-category content (rules, notices, education, equipment, vehicle, access)
  - `settings`: Key-value store for global configuration (lock status, admin PIN)
  - `education_sessions`: Education log entries with title, date, department, participants, instructor
  - `education_signatures`: Digital signatures for education sessions (signer name, department, base64 signature data)

### Key Design Patterns
- **Shared Types**: Schema and route definitions in /shared directory enable type safety across client and server
- **Storage Interface**: IStorage interface in server/storage.ts abstracts database operations
- **Score Calculation**: Server-side calculation of safety scores based on weighted factors (accidents -40, fines -1, suggestions +3, etc.)

### AI Chatbot (server/chatbot.ts)
- **Model**: OpenAI gpt-5-nano via Replit AI Integrations (no additional cost)
- **Capabilities**: Natural language intent parsing for CREATE_EDUCATION, CREATE_INSPECTION, QUERY_EDUCATION, QUERY_INSPECTION, GENERAL_QUERY
- **Security**: Permission checks (registerEducation, editInspections) enforced per action, Zod schema validation on parsed AI data
- **Photo Upload**: Up to 10 images via Multer, stored in /uploads
- **UI**: Floating chat widget (ChatBot.tsx) in bottom-right corner with conversation history (max 6 messages)

### Authentication & Authorization
- Replit Auth login with role-based permissions (admin, manager, user, viewer, custom)
- Role preset system for batch permission assignment
- Permission checks on both regular API routes and chatbot actions
- Global lock toggle prevents edits when system is locked
- Lock status refreshes every 10 seconds on client

### File Structure
```
client/src/
├── components/     # React components including shadcn/ui
├── hooks/          # React Query hooks for API calls
├── pages/          # Page components for each route
├── lib/            # Utilities (queryClient, cn helper)
server/
├── index.ts        # Express server setup
├── routes.ts       # API route handlers
├── storage.ts      # Database access layer
├── db.ts           # Drizzle/PostgreSQL connection
shared/
├── schema.ts       # Drizzle table definitions
├── routes.ts       # API route type definitions
```

## External Dependencies

### Database
- **PostgreSQL**: Primary database (requires DATABASE_URL environment variable)
- **Drizzle ORM**: Database toolkit with `drizzle-kit push` for schema migrations

### Third-Party Libraries
- **ExcelJS**: Server-side Excel file processing for data import/export
- **date-fns**: Date formatting utilities
- **Zod**: Schema validation for API inputs and outputs

### Frontend Dependencies
- **Radix UI**: Headless component primitives (via shadcn/ui)
- **Lucide React**: Icon library
- **React Hook Form**: Form state management with Zod resolver
- **Embla Carousel**: Carousel component

### Development Tools
- **Replit Plugins**: Runtime error overlay, cartographer, dev banner (development only)
- **tsx**: TypeScript execution for development server