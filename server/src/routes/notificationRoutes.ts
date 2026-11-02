import express from 'express';
import { 
  getNotifications, 
  markAsRead, 
  markAllAsRead 
} from '../controllers/notificationController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

router.route('/')
  .get(protect, getNotifications);

router.route('/read-all')
  .patch(protect, markAllAsRead);

router.route('/:id/read')
  .patch(protect, markAsRead);

export default router;
