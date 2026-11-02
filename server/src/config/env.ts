import dotenv from 'dotenv';
dotenv.config();

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret === 'change_me_in_production' || jwtSecret.length < 16) {
  throw new Error('JWT_SECRET must be set to a strong value (16+ characters) in server/.env');
}

export const env = {
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/collaborative-workspace',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  publicUrl: process.env.PUBLIC_URL, // optional, e.g. https://api.example.com (used for upload URLs)
};
