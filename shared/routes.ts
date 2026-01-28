import { z } from 'zod';
import { insertTeamSchema, insertNoticeSchema, teams, notices, settings } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  teams: {
    list: {
      method: 'GET' as const,
      path: '/api/teams',
      input: z.object({ year: z.coerce.number().optional() }).optional(),
      responses: {
        200: z.array(z.custom<typeof teams.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/teams',
      input: insertTeamSchema,
      responses: {
        201: z.custom<typeof teams.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/teams/:id',
      input: insertTeamSchema.partial(),
      responses: {
        200: z.custom<typeof teams.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/teams/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
    reset: {
      method: 'POST' as const,
      path: '/api/teams/:id/reset',
      responses: {
        200: z.custom<typeof teams.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    resetAll: {
      method: 'POST' as const,
      path: '/api/teams/reset-all',
      input: z.object({ year: z.number() }),
      responses: {
        200: z.object({ success: z.boolean(), count: z.number() }),
      },
    },
  },
  notices: {
    list: {
      method: 'GET' as const,
      path: '/api/notices',
      input: z.object({ category: z.string().optional() }).optional(),
      responses: {
        200: z.array(z.custom<typeof notices.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/notices',
      input: insertNoticeSchema,
      responses: {
        201: z.custom<typeof notices.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/notices/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  settings: {
    getLock: {
      method: 'GET' as const,
      path: '/api/settings/lock',
      responses: {
        200: z.object({ isLocked: z.boolean() }),
      },
    },
    setLock: {
      method: 'POST' as const,
      path: '/api/settings/lock',
      input: z.object({ isLocked: z.boolean(), pin: z.string().optional() }),
      responses: {
        200: z.object({ success: z.boolean() }),
        401: errorSchemas.internal,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
