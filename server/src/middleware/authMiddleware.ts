import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import { env } from '../config/env';

export interface AuthRequest extends Request {
  user?: any;
}

export const protect = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Not authorized, no token' });
    return;
  }
  try {
    const decoded = jwt.verify(header.split(' ')[1], env.jwtSecret) as { id: string };
    req.user = await User.findById(decoded.id).select('-passwordHash');
    if (!req.user) {
      res.status(401).json({ message: 'Not authorized, user not found' });
      return;
    }
    next();
  } catch {
    res.status(401).json({ message: 'Not authorized, token failed' });
  }
};
