import express from 'express';
import { 
  createDocument, 
  getDocuments, 
  getDocumentById, 
  updateDocument, 
  deleteDocument,
  shareDocument,
  removeCollaborator,
  updateCollaboratorRole,
  getVersions,
  saveSnapshot,
  restoreVersion,
  searchDocuments,
  moveToFolder,
  updateTags
} from '../controllers/documentController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

router.route('/').get(protect, getDocuments).post(protect, createDocument);

router.get('/search', protect, searchDocuments);

router.route('/:id/share')
  .post(protect, shareDocument);

router.route('/:id/share/:userId')
  .put(protect, updateCollaboratorRole)
  .delete(protect, removeCollaborator);

router.put('/:id/move', protect, moveToFolder);
router.put('/:id/tags', protect, updateTags);

router.route('/:id/versions')
  .get(protect, getVersions);

router.route('/:id/versions/snapshot')
  .post(protect, saveSnapshot);

router.route('/:id/versions/:versionId/restore')
  .post(protect, restoreVersion);

router.route('/:id')
  .get(protect, getDocumentById)
  .put(protect, updateDocument)
  .delete(protect, deleteDocument);

export default router;
