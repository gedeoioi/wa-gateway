import { Router } from 'express';
import {
  register,
  login,
  refreshToken,
  getProfile,
  updateProfile,
  changePassword,
  getLoginHistory,
  getActiveSession,
  revokeAllSessions,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
} from '../controllers/auth.controller';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

const registerSchema = z.object({
  body: z.object({
    username: z.string().min(3).max(50),
    email: z.string().email(),
    password: z.string().min(6),
  }),
});

const loginSchema = z.object({
  body: z.object({
    username: z.string().min(3).max(50),
    password: z.string().min(6),
  }),
});

const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1),
  }),
});

const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(6),
  }),
});

const createUserSchema = z.object({
  body: z.object({
    username: z.string().min(3).max(50),
    email: z.string().email(),
    password: z.string().min(6),
    role: z.enum(['admin', 'operator', 'viewer']).optional(),
  }),
});

const updateUserSchema = z.object({
  body: z.object({
    email: z.string().email().optional(),
    role: z.enum(['admin', 'operator', 'viewer']).optional(),
    isActive: z.boolean().optional(),
  }),
});

router.post('/register', validate(registerSchema), register);
router.post('/login', validate(loginSchema), login);
router.post('/refresh', validate(refreshSchema), refreshToken);

router.get('/profile', authenticate, getProfile);
router.put('/profile', authenticate, updateProfile);
router.put('/change-password', authenticate, validate(changePasswordSchema), changePassword);

router.get('/login-history', authenticate, getLoginHistory);
router.get('/session', authenticate, getActiveSession);
router.post('/revoke-sessions', authenticate, revokeAllSessions);

router.get('/users', authenticate, authorize('admin'), listUsers);
router.post('/users', authenticate, authorize('admin'), validate(createUserSchema), createUser);
router.put('/users/:id', authenticate, authorize('admin'), validate(updateUserSchema), updateUser);
router.delete('/users/:id', authenticate, authorize('admin'), deleteUser);

export { router as authRoutes };
