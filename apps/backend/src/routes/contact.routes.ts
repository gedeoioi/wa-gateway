import { Router } from 'express';
import {
  getContacts,
  createContact,
  updateContact,
  deleteContact,
  getGroups,
  createGroup,
  deleteGroup,
  addContactToGroup,
  removeContactFromGroup,
} from '../controllers/contact.controller';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

const createContactSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(255),
    phoneNumber: z.string().min(8).max(20),
    email: z.string().email().optional().or(z.literal('')),
    tags: z.array(z.string()).optional(),
    groupId: z.string().uuid().optional(),
  }),
});

const createGroupSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(255),
    description: z.string().max(500).optional(),
  }),
});

/**
 * @swagger
 * /api/v1/contacts:
 *   get:
 *     summary: Get all contacts
 *     tags: [Contacts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of contacts
 */
router.get('/', authenticate, getContacts);
router.post('/', authenticate, authorize('admin', 'operator'), validate(createContactSchema), createContact);
router.put('/:id', authenticate, authorize('admin', 'operator'), updateContact);
router.delete('/:id', authenticate, authorize('admin', 'operator'), deleteContact);

router.get('/groups', authenticate, getGroups);
router.post('/groups', authenticate, authorize('admin', 'operator'), validate(createGroupSchema), createGroup);
router.delete('/groups/:id', authenticate, authorize('admin', 'operator'), deleteGroup);
router.post('/groups/members', authenticate, authorize('admin', 'operator'), addContactToGroup);
router.delete('/groups/:groupId/members/:contactId', authenticate, authorize('admin', 'operator'), removeContactFromGroup);

export { router as contactRoutes };
