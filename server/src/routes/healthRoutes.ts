import express from 'express';
import mongoose from 'mongoose';
import redisClient from '../config/redis';

const router = express.Router();

// Redis is an optional cache, so it is reported but does not affect overall status.
router.get('/', (_req, res) => {
  const isMongoConnected = mongoose.connection.readyState === 1;

  res.status(isMongoConnected ? 200 : 503).json({
    status: isMongoConnected ? 'ok' : 'error',
    timestamp: new Date().toISOString(),
    services: {
      mongodb: isMongoConnected ? 'connected' : 'disconnected',
      redis: redisClient.isOpen ? 'connected' : 'disabled',
    },
  });
});

export default router;
