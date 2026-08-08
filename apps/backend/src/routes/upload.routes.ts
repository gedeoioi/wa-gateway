import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { uploadFile } from '../controllers/upload.controller';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

const storage = multer.diskStorage({
  destination: (_req: any, _file: any, cb: any) => {
    cb(null, path.join(__dirname, '../../uploads'));
  },
  filename: (_req: any, file: any, cb: any) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const fileFilter = (_req: any, file: any, cb: any) => {
  const allowed = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/quicktime', 'video/avi',
    'audio/mpeg', 'audio/ogg', 'audio/wav',
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip', 'text/plain',
  ];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('File type not allowed'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 16 * 1024 * 1024 },
});

router.post('/', authenticate, authorize('admin', 'operator'), upload.single('file') as any, uploadFile);

export { router as uploadRoutes };
