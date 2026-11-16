import { createFileRoute } from '@tanstack/react-router';
import { mpesaStkCallback } from '@/lib/mpesa.server';

export const Route = createFileRoute('/api/public/mpesa/callback')({
  server: { handlers: { POST: ({ request }) => mpesaStkCallback(request) } },
});
