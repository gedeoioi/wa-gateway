interface StatusBadgeProps {
  status: string;
}

const statusStyles: Record<string, string> = {
  connected: 'bg-green-100 text-green-800',
  disconnected: 'bg-red-100 text-red-800',
  connecting: 'bg-yellow-100 text-yellow-800',
  qr_pending: 'bg-blue-100 text-blue-800',
  pending: 'bg-gray-100 text-gray-800',
  sent: 'bg-blue-100 text-blue-800',
  delivered: 'bg-green-100 text-green-800',
  read: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  draft: 'bg-gray-100 text-gray-800',
  scheduled: 'bg-purple-100 text-purple-800',
  sending: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const style = statusStyles[status] || 'bg-gray-100 text-gray-800';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${style}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
