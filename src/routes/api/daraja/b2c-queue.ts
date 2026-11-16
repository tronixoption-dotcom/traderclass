import { createFileRoute } from '@tanstack/react-router';
import { b2cQueueCallback } from '@/lib/mpesa.server';

export const Route = createFileRoute('/api/daraja/b2c-queue')({
  server: { handlers: { POST: ({ request }) => b2cQueueCallback(request) } },
});
