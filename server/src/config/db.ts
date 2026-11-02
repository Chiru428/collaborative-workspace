import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';

export const connectDB = async () => {
  const conn = await mongoose.connect(env.mongoUri);
  logger.info(`MongoDB Connected: ${conn.connection.host}`);
};
