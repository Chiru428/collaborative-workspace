import express from 'express';
import { protect } from '../middleware/authMiddleware';
import { getFolders, createFolder, renameFolder, deleteFolder } from '../controllers/folderController';

const router = express.Router();

router.route('/')
  .get(protect, getFolders)
  .post(protect, createFolder);

router.route('/:id')
  .put(protect, renameFolder)
  .delete(protect, deleteFolder);

export default router;
