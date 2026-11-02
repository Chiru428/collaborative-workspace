import express from 'express';
import { getComments, createComment } from '../controllers/commentController';
import { protect } from '../middleware/authMiddleware';

// mergeParams exposes :id (the document id) from the parent mount path.
// Resolving a comment lives in commentActionRoutes (PATCH /api/comments/:id/resolve).
const router = express.Router({ mergeParams: true });

router.route('/').get(protect, getComments).post(protect, createComment);

export default router;
