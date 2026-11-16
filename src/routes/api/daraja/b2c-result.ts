import { createFileRoute } from '@tanstack/react-router';
import { b2cResultCallback } from '@/lib/mpesa.server';

export const Route = createFileRoute('/api/daraja/b2c-result')({
  server: { handlers: { POST: ({ request }) => b2cResultCallback(request) } },
});
