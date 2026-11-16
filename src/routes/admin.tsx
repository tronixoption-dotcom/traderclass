import { createFileRoute } from '@tanstack/react-router';
import { AdminPanel } from '@/components/admin/AdminPanel';
import { pageHead } from '@/components/app/meta';
export const Route=createFileRoute('/admin')({head:()=>({...pageHead('Administration','Authorized staff workspace for Tradeclass client accounts, trading and funding.'),meta:[...pageHead('Administration','Authorized staff workspace for Tradeclass client accounts, trading and funding.').meta,{name:'robots',content:'noindex, nofollow'}]}),component:AdminPanel});
