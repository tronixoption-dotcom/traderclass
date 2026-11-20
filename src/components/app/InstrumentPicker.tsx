import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { SymbolIcon } from "@/components/app/icons";
import { SYMBOLS, SYMBOL_CATEGORIES } from "@/lib/symbols";
import { getQuote, hasFreshMarketQuote } from "@/lib/feed";
import { fmtPrice } from "@/lib/format";
import { useTick } from "@/lib/store";
import { cn } from "@/lib/utils";

export function InstrumentPicker({ symbol, onChange, disabled = false, robot = false, compare = false, liveOnly = false }: {
  symbol: string;
  onChange: (symbol: string) => void;
  disabled?: boolean;
  robot?: boolean;
  compare?: boolean;
  liveOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const instruments = SYMBOLS;
  useTick();
  return (
    <Popover open={open} onOpenChange={(value) => { setOpen(value); if (!value) setQuery(""); }}>
      <PopoverTrigger asChild>
        <Button variant={compare ? "ghost" : "outline"} disabled={disabled} aria-label={compare ? "Compare or add symbol" : robot ? "Robot instrument" : "Select instrument"} role="combobox" aria-expanded={open}
          className={cn("shadow-none", robot ? "h-[48px] w-full justify-between rounded-[11px] px-[15px] text-[13px] font-semibold" : "h-[28px] gap-[6px] rounded-full px-[10px] text-[11.5px] font-bold md:h-[44px] md:gap-[10px] md:px-[20px] md:text-[15px]", compare && "h-[33px] w-[35px] rounded-[4px] p-0 md:h-[38px] md:w-[35px]")}>
          {compare ? <span className="text-xl">⊕</span> : <><span>{symbol}</span><ChevronDown className="size-4 text-muted-foreground" /></>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[390px] max-w-[calc(100vw-24px)] overflow-hidden p-0">
        <Command shouldFilter={false}>
          <CommandInput aria-label="Search instruments" placeholder="Search symbols or names…" value={query} onValueChange={setQuery} />
          <div className="flex flex-wrap gap-1 border-b border-border p-2" role="group" aria-label="Instrument categories">
            {["All", ...SYMBOL_CATEGORIES].map((label) => <Button key={label} size="sm" variant={category === label ? "secondary" : "ghost"} className="h-7 px-2 text-xs" aria-pressed={category === label} onClick={() => setCategory(label)}>{label}</Button>)}
          </div>
          <CommandList className="max-h-[min(360px,45vh)]">
            <CommandEmpty>No instruments found.</CommandEmpty>
            {SYMBOL_CATEGORIES.filter((label) => category === "All" || category === label).map((label) => {
              const matches = instruments.filter((s) => s.category === label && `${s.id} ${s.name}`.toLowerCase().includes(query.trim().toLowerCase()));
              return matches.length ? <CommandGroup key={label} heading={`${label} · ${matches.length}`}>
                {matches.map((s) => {
                  const quote = getQuote(s.id);
                  return <CommandItem key={s.id} value={s.id} onSelect={() => { onChange(s.id); setOpen(false); setQuery(""); }} className="gap-2.5 py-2">
                    <SymbolIcon symbol={s.id} className="size-7 text-[10px]" />
                    <div className="min-w-0 flex-1"><div className="text-[13px] font-bold">{s.id}</div><div className="text-[11px] leading-4 text-muted-foreground">{s.name}</div></div>
                    <div className="shrink-0 text-right"><div className="tabular text-xs">{liveOnly && !hasFreshMarketQuote(s.id) ? '—' : fmtPrice(s.id, quote.mid)}</div><div className={cn("tabular text-[11px]", quote.change >= 0 ? "text-success" : "text-destructive")}>{liveOnly && !hasFreshMarketQuote(s.id) ? 'Waiting for price' : `${quote.change >= 0 ? "+" : ""}${quote.changePct.toFixed(2)}%`}</div></div>
                    {symbol === s.id && <Check className="size-4 shrink-0 text-primary" />}
                  </CommandItem>;
                })}
              </CommandGroup> : null;
            })}
          </CommandList>
          <div className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">{instruments.length} markets · Live market prices</div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
