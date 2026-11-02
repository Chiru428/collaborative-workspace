import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import { env } from '../config/env';
import { emailQuery, isString, normalizeEmail } from '../utils/validate';
import { sendServerError } from '../utils/asyncHandler';

const generateToken = (id: string) =>
  jwt.sign({ id }, env.jwtSecret, { expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'] });

const MIN_PASSWORD = 8;
const MAX_PASSWORD = 72; // bcrypt ignores bytes beyond 72

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;

    if (!email) {
      res.status(400).json({ message: 'A valid email is required' });
      return;
    }
    if (!isString(password) || password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
      res.status(400).json({ message: `Password must be ${MIN_PASSWORD}-${MAX_PASSWORD} characters` });
      return;
    }

    if (await User.findOne(emailQuery(email))) {
      res.status(400).json({ message: 'User already exists' });
      return;
    }

    const user = await User.create({ email, passwordHash: password });
    res.status(201).json({
      _id: user._id,
      email: user.email,
      token: generateToken(user._id.toString()),
    });
  } catch (error) {
    sendServerError(res, error, 'Register failed');
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;

    if (!email || !isString(password)) {
      res.status(401).json({ message: 'Invalid email or password' });
      return;
    }

    const user = await User.findOne(emailQuery(email));
    if (user && (await user.comparePassword(password))) {
      res.json({
        _id: user._id,
        email: user.email,
        token: generateToken(user._id.toString()),
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    sendServerError(res, error, 'Login failed');
  }
};
