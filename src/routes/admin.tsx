import { createFileRoute } from '@tanstack/react-router';
import { AdminPanel } from '@/components/admin/AdminPanel';
import { pageHead } from '@/components/app/meta';
export const Route=createFileRoute('/admin')({head:()=>({...pageHead('Administration','Authorized staff workspace for Goldmarket practice accounts and site settings.'),meta:[...pageHead('Administration','Authorized staff workspace for Goldmarket practice accounts and site settings.').meta,{name:'robots',content:'noindex, nofollow'}]}),component:AdminPanel});
