import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/transfer')({
  beforeLoad: () => { throw redirect({ to: '/account' }); },
  component: () => null,
});
