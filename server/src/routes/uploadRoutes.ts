import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { protect } from '../middleware/authMiddleware';
import { env } from '../config/env';

const router = express.Router();

// Override with UPLOAD_DIR (e.g. a mounted volume, or a temp dir in tests).
export const uploadDir = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Only raster images; the extension is derived from the verified MIME type, never from the
// client-supplied filename (prevents serving .html/.svg from our origin).
const ALLOWED: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ALLOWED[file.mimetype]}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED[file.mimetype]) cb(null, true);
    else cb(new Error('Only JPEG, PNG, GIF and WebP images are allowed'));
  },
});

// Note: local disk storage should be migrated to S3/Cloudinary for production deployments.
router.post('/', protect, (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      res.status(400).json({ message: err.message });
      return;
    }
    if (!req.file) {
      res.status(400).json({ message: 'No file uploaded' });
      return;
    }
    const base = env.publicUrl || `${req.protocol}://${req.get('host')}`;
    res.json({ url: `${base}/uploads/${req.file.filename}` });
  });
});

export default router;
