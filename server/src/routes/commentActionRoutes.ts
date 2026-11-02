import express from 'express';
import { resolveComment } from '../controllers/commentController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

router.route('/:id/resolve')
  .patch(protect, resolveComment);

export default router;
