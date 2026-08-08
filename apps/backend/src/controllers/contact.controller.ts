import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AppError } from '../middleware/error-handler';
import { AuthRequest } from '../middleware/auth';
import { formatPhoneNumber } from '../utils/phone';

export async function getContacts(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (req.query.search) {
      where.OR = [
        { name: { contains: req.query.search as string } },
        { phoneNumber: { contains: req.query.search as string } },
      ];
    }
    if (req.query.groupId) {
      where.groups = { some: { groupId: req.query.groupId as string } };
    }

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { groups: { include: { group: true } } },
      }),
      prisma.contact.count({ where }),
    ]);

    res.json({
      success: true,
      data: contacts,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
}

export async function createContact(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, phoneNumber, email, tags, groupId } = req.body;
    const formattedPhone = formatPhoneNumber(phoneNumber);

    const existing = await prisma.contact.findUnique({
      where: { phoneNumber: formattedPhone },
    });
    if (existing) {
      throw new AppError('Phone number already exists', 409);
    }

    const contact = await prisma.contact.create({
      data: {
        name,
        phoneNumber: formattedPhone,
        email,
        tags: tags ? JSON.stringify(tags) : null,
        ...(groupId ? { groups: { create: { groupId } } } : {}),
      },
      include: { groups: { include: { group: true } } },
    });

    res.status(201).json({ success: true, data: contact });
  } catch (error) {
    next(error);
  }
}

export async function updateContact(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, email, tags } = req.body;
    const updateData: Record<string, unknown> = {};
    if (name) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (tags) updateData.tags = JSON.stringify(tags);

    const contact = await prisma.contact.update({
      where: { id: req.params.id },
      data: updateData,
    });
    res.json({ success: true, data: contact });
  } catch (error) {
    next(error);
  }
}

export async function deleteContact(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await prisma.contact.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Contact deleted' });
  } catch (error) {
    next(error);
  }
}

export async function getGroups(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const groups = await prisma.contactGroup.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { members: true } } },
    });
    res.json({ success: true, data: groups });
  } catch (error) {
    next(error);
  }
}

export async function createGroup(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, description } = req.body;
    const group = await prisma.contactGroup.create({
      data: { name, description },
    });
    res.status(201).json({ success: true, data: group });
  } catch (error) {
    next(error);
  }
}

export async function deleteGroup(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await prisma.contactGroupMember.deleteMany({ where: { groupId: req.params.id } });
    await prisma.contactGroup.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Group deleted' });
  } catch (error) {
    next(error);
  }
}

export async function addContactToGroup(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { contactId, groupId } = req.body;

    const existing = await prisma.contactGroupMember.findUnique({
      where: { contactId_groupId: { contactId, groupId } },
    });
    if (existing) {
      throw new AppError('Contact already in group', 409);
    }

    const member = await prisma.contactGroupMember.create({
      data: { contactId, groupId },
    });
    res.status(201).json({ success: true, data: member });
  } catch (error) {
    next(error);
  }
}

export async function removeContactFromGroup(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { contactId, groupId } = req.params;
    await prisma.contactGroupMember.delete({
      where: { contactId_groupId: { contactId, groupId } },
    });
    res.json({ success: true, message: 'Contact removed from group' });
  } catch (error) {
    next(error);
  }
}
