export interface Contact {
  id: string;
  name: string;
  phoneNumber: string;
  email: string | null;
  tags: string[];
  createdAt: string;
}

export interface ContactGroup {
  id: string;
  name: string;
  description: string | null;
  contactCount: number;
  createdAt: string;
}

export interface ContactCreateRequest {
  name: string;
  phoneNumber: string;
  email?: string;
  tags?: string[];
  groupId?: string;
}
