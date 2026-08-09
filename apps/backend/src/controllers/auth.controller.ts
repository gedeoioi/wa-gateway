import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import prisma from '../lib/prisma';
import { AppError } from '../middleware/error-handler';
import { AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';

const ACCESS_TOKEN_OPTIONS: SignOptions = { expiresIn: (process.env.JWT_EXPIRES_IN || '15m') as SignOptions['expiresIn'] };
const REFRESH_TOKEN_OPTIONS: SignOptions = { expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as SignOptions['expiresIn'] };

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

function getClientIp(req: Request): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
}

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { username, email, password } = req.body;

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ username }, { email }],
      },
    });

    if (existingUser) {
      throw new AppError('Username or email already exists', 409);
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        role: 'operator',
        lastPasswordChange: new Date(),
      },
      select: { id: true, username: true, email: true, role: true },
    });

    const accessToken = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET || 'secret',
      ACCESS_TOKEN_OPTIONS,
    );

    const refreshToken = jwt.sign(
      { id: user.id },
      process.env.JWT_REFRESH_SECRET || 'refresh-secret',
      REFRESH_TOKEN_OPTIONS,
    );

    logger.info(`User ${username} registered`);

    res.status(201).json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { username, password } = req.body;
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'] || 'unknown';

    const user = await prisma.user.findUnique({ where: { username } });

    if (!user) {
      await prisma.loginHistory.create({
        data: { userId: '00000000-0000-0000-0000-000000000000', ip, userAgent, success: false, reason: 'User not found' },
      }).catch(() => {});
      throw new AppError('Invalid credentials', 401);
    }

    if (!user.isActive) {
      await prisma.loginHistory.create({
        data: { userId: user.id, ip, userAgent, success: false, reason: 'Account disabled' },
      });
      throw new AppError('Account is disabled', 403);
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      await prisma.loginHistory.create({
        data: { userId: user.id, ip, userAgent, success: false, reason: 'Account locked' },
      });
      throw new AppError(`Account is locked. Try again in ${minutesLeft} minutes.`, 423);
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      const newAttempts = user.failedLoginAttempts + 1;
      const updateData: Record<string, unknown> = { failedLoginAttempts: newAttempts };

      if (newAttempts >= MAX_FAILED_ATTEMPTS) {
        updateData.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
        updateData.failedLoginAttempts = 0;
        logger.warn(`Account ${username} locked after ${MAX_FAILED_ATTEMPTS} failed attempts`);
      }

      await prisma.user.update({ where: { id: user.id }, data: updateData });
      await prisma.loginHistory.create({
        data: { userId: user.id, ip, userAgent, success: false, reason: `Invalid password (attempt ${newAttempts})` },
      });

      throw new AppError('Invalid credentials', 401);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), failedLoginAttempts: 0, lockedUntil: null },
    });

    await prisma.loginHistory.create({
      data: { userId: user.id, ip, userAgent, success: true },
    });

    const accessToken = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET || 'secret',
      ACCESS_TOKEN_OPTIONS,
    );

    const refreshToken = jwt.sign(
      { id: user.id },
      process.env.JWT_REFRESH_SECRET || 'refresh-secret',
      REFRESH_TOKEN_OPTIONS,
    );

    logger.info(`User ${username} logged in from ${ip}`);

    res.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      throw new AppError('Refresh token required', 400);
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || 'refresh-secret') as {
      id: string;
      iat: number;
    };

    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user || !user.isActive) {
      throw new AppError('Invalid refresh token', 401);
    }

    if (user.lastPasswordChange) {
      const revokedAt = Math.floor(user.lastPasswordChange.getTime() / 1000);
      if (decoded.iat < revokedAt) {
        throw new AppError('Refresh token revoked', 401);
      }
    }

    const accessToken = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET || 'secret',
      ACCESS_TOKEN_OPTIONS,
    );

    res.json({ success: true, data: { accessToken } });
  } catch (error) {
    next(error);
  }
}

export async function getProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, username: true, email: true, role: true, createdAt: true, lastLoginAt: true },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
}

export async function updateProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = req.body;
    const updateData: Record<string, unknown> = {};

    if (email) updateData.email = email;
    if (password) {
      updateData.password = await bcrypt.hash(password, 12);
      updateData.lastPasswordChange = new Date();
    }

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: updateData,
      select: { id: true, username: true, email: true, role: true },
    });

    res.json({ success: true, data: user, message: 'Profile updated' });
  } catch (error) {
    next(error);
  }
}

export async function changePassword(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      throw new AppError('Current password is incorrect', 400);
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { password: hashedPassword, lastPasswordChange: new Date() },
    });

    await prisma.loginHistory.create({
      data: {
        userId: req.user!.id,
        ip: getClientIp(req),
        userAgent: req.headers['user-agent'] || 'unknown',
        success: true,
        reason: 'Password changed',
      },
    });

    logger.info(`User ${req.user!.username} changed password`);

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    next(error);
  }
}

export async function getLoginHistory(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const limit = parseInt(req.query.limit as string) || 20;

    const history = await prisma.loginHistory.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        ip: true,
        userAgent: true,
        success: true,
        reason: true,
        createdAt: true,
      },
    });

    res.json({ success: true, data: history });
  } catch (error) {
    next(error);
  }
}

export async function getActiveSession(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        username: true,
        lastLoginAt: true,
        lastPasswordChange: true,
        failedLoginAttempts: true,
        lockedUntil: true,
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    res.json({
      success: true,
      data: {
        currentSession: {
          ip: getClientIp(req),
          userAgent: req.headers['user-agent'] || 'unknown',
          loginAt: user.lastLoginAt,
        },
        security: {
          lastPasswordChange: user.lastPasswordChange,
          failedLoginAttempts: user.failedLoginAttempts,
          isLocked: user.lockedUntil ? user.lockedUntil > new Date() : false,
          lockedUntil: user.lockedUntil,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function revokeAllSessions(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const now = new Date(Date.now() + 1000);

    await prisma.user.update({
      where: { id: req.user!.id },
      data: { lastPasswordChange: now },
    });

    await prisma.loginHistory.create({
      data: {
        userId: req.user!.id,
        ip: getClientIp(req),
        userAgent: req.headers['user-agent'] || 'unknown',
        success: true,
        reason: 'All sessions revoked',
      },
    });

    const accessToken = jwt.sign(
      { id: req.user!.id, username: req.user!.username, role: req.user!.role },
      process.env.JWT_SECRET || 'secret',
      ACCESS_TOKEN_OPTIONS,
    );

    const refreshToken = jwt.sign(
      { id: req.user!.id },
      process.env.JWT_REFRESH_SECRET || 'refresh-secret',
      REFRESH_TOKEN_OPTIONS,
    );

    logger.info(`User ${req.user!.username} revoked all sessions`);

    res.json({
      success: true,
      message: 'All other sessions have been revoked',
      data: { accessToken, refreshToken },
    });
  } catch (error) {
    next(error);
  }
}

export async function listUsers(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: users });
  } catch (error) {
    next(error);
  }
}

export async function createUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { username, email, password, role } = req.body;

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ username }, { email }],
      },
    });

    if (existingUser) {
      throw new AppError('Username or email already exists', 409);
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        role: role || 'operator',
        lastPasswordChange: new Date(),
      },
      select: { id: true, username: true, email: true, role: true, isActive: true, createdAt: true },
    });

    logger.info(`Admin ${req.user!.username} created user ${username}`);

    res.status(201).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
}

export async function updateUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { email, role, isActive } = req.body;

    const updateData: Record<string, unknown> = {};
    if (email !== undefined) updateData.email = email;
    if (role !== undefined) updateData.role = role;
    if (isActive !== undefined) updateData.isActive = isActive;

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, username: true, email: true, role: true, isActive: true },
    });

    logger.info(`Admin ${req.user!.username} updated user ${user.username}`);

    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
}

export async function deleteUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;

    if (id === req.user!.id) {
      throw new AppError('Cannot delete your own account', 400);
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new AppError('User not found', 404);
    }

    await prisma.user.delete({ where: { id } });

    logger.info(`Admin ${req.user!.username} deleted user ${user.username}`);

    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    next(error);
  }
}
