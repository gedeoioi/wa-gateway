export type MessageType = 'text' | 'image' | 'video' | 'document' | 'audio';
export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
export type MessageDirection = 'inbound' | 'outbound';

export interface Message {
  id: string;
  deviceId: string;
  recipient: string;
  content: string;
  type: MessageType;
  status: MessageStatus;
  direction: MessageDirection;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface SendMessageRequest {
  deviceId: string;
  recipient: string;
  content: string;
  type?: MessageType;
  mediaUrl?: string;
}

export interface BroadcastRequest {
  deviceId: string;
  name: string;
  message: string;
  type?: MessageType;
  mediaUrl?: string;
  recipients: string[];
  scheduledAt?: string;
  delayBetweenMessages?: number;
}

export interface Broadcast {
  id: string;
  name: string;
  deviceId: string;
  message: string;
  type: MessageType;
  status: 'draft' | 'scheduled' | 'sending' | 'completed' | 'failed' | 'cancelled';
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}
