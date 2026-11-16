import { useStore } from '@/lib/store';
export function SiteAnnouncement(){const {siteSettings}=useStore();return siteSettings.announcement?<div role="status" className="fixed bottom-20 left-1/2 z-40 w-[min(90%,640px)] -translate-x-1/2 rounded-md border border-border bg-popover px-4 py-3 text-center text-sm text-popover-foreground shadow-lg lg:bottom-4">{siteSettings.announcement}</div>:null;}
