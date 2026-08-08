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
 *     summary: Get all contacts for current user
 *     tags: [Contacts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: groupId
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of contacts with pagination
 *   post:
 *     summary: Create a new contact
 *     tags: [Contacts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, phoneNumber]
 *             properties:
 *               name:
 *                 type: string
 *               phoneNumber:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               groupId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       201:
 *         description: Contact created
 *       409:
 *         description: Phone number already exists
 */
router.get('/', authenticate, getContacts);
router.post('/', authenticate, authorize('admin', 'operator'), validate(createContactSchema), createContact);

/**
 * @swagger
 * /api/v1/contacts/{id}:
 *   put:
 *     summary: Update a contact
 *     tags: [Contacts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Contact updated
 *   delete:
 *     summary: Delete a contact
 *     tags: [Contacts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Contact deleted
 */
router.put('/:id', authenticate, authorize('admin', 'operator'), updateContact);
router.delete('/:id', authenticate, authorize('admin', 'operator'), deleteContact);

/**
 * @swagger
 * /api/v1/contacts/groups:
 *   get:
 *     summary: Get all contact groups
 *     tags: [Contact Groups]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of groups with member count
 *   post:
 *     summary: Create a new contact group
 *     tags: [Contact Groups]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Group created
 */
router.get('/groups', authenticate, getGroups);
router.post('/groups', authenticate, authorize('admin', 'operator'), validate(createGroupSchema), createGroup);

/**
 * @swagger
 * /api/v1/contacts/groups/{id}:
 *   delete:
 *     summary: Delete a contact group
 *     tags: [Contact Groups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Group deleted
 */
router.delete('/groups/:id', authenticate, authorize('admin', 'operator'), deleteGroup);

/**
 * @swagger
 * /api/v1/contacts/groups/members:
 *   post:
 *     summary: Add contact to group
 *     tags: [Contact Groups]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [contactId, groupId]
 *             properties:
 *               contactId:
 *                 type: string
 *                 format: uuid
 *               groupId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       201:
 *         description: Contact added to group
 *       409:
 *         description: Contact already in group
 */
router.post('/groups/members', authenticate, authorize('admin', 'operator'), addContactToGroup);

/**
 * @swagger
 * /api/v1/contacts/groups/{groupId}/members/{contactId}:
 *   delete:
 *     summary: Remove contact from group
 *     tags: [Contact Groups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: contactId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Contact removed from group
 */
router.delete('/groups/:groupId/members/:contactId', authenticate, authorize('admin', 'operator'), removeContactFromGroup);

export { router as contactRoutes };
