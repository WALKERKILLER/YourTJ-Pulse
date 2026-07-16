import { z } from 'zod';

export const userRoleSchema = z.enum(['user', 'mapper', 'moderator', 'admin']);

export const authenticatedUserSchema = z.object({
  id: z.string().min(1).max(128),
  displayName: z.string().min(1).max(100),
  avatarUrl: z.url().max(2_048).optional(),
  roles: z.array(userRoleSchema).min(1).max(4),
});

export type UserRole = z.infer<typeof userRoleSchema>;
export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;
