import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export type MultiSelectOption = {
  value: string;
  label: string;
};

type Props = {
  placeholder?: string;
  options: MultiSelectOption[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
};

export function ParticipantsMultiSelect({
  placeholder = "Selecione participantes",
  options,
  value,
  onChange,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => {
    const set = new Set(value);
    return options.filter((o) => set.has(o.value));
  }, [options, value]);

  const toggle = (v: string) => {
    const set = new Set(value);
    if (set.has(v)) set.delete(v);
    else set.add(v);
    onChange(Array.from(set));
  };

  const remove = (v: string) => {
    onChange(value.filter((x) => x !== v));
  };

  const clear = () => onChange([]);

  return (
    <div className="grid gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              "h-11 justify-between rounded-2xl border-slate-200 bg-white px-3 text-left font-normal",
              value.length === 0 && "text-slate-500"
            )}
          >
            <span className="truncate">
              {value.length === 0 ? placeholder : `${value.length} selecionado(s)`}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
          <Command>
            <CommandInput placeholder="Buscar participante..." />
            <CommandList>
              <CommandEmpty>Nenhum participante encontrado.</CommandEmpty>
              <CommandGroup>
                {options.map((o) => {
                  const isSelected = value.includes(o.value);
                  return (
                    <CommandItem
                      key={o.value}
                      value={o.label}
                      onSelect={() => toggle(o.value)}
                      className="flex items-center gap-2"
                    >
                      <span
                        className={cn(
                          "flex h-4 w-4 items-center justify-center rounded-sm border",
                          isSelected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300"
                        )}
                      >
                        {isSelected && <Check className="h-3 w-3" />}
                      </span>
                      <span className="truncate">{o.label}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>

            <div className="flex items-center justify-between gap-2 border-t p-2">
              <div className="text-xs text-slate-500">{value.length} selecionado(s)</div>
              <Button type="button" variant="secondary" size="sm" onClick={clear} disabled={value.length === 0}>
                Limpar
              </Button>
            </div>
          </Command>
        </PopoverContent>
      </Popover>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.slice(0, 12).map((s) => (
            <Badge key={s.value} variant="secondary" className="gap-1 rounded-full">
              <span className="max-w-[220px] truncate">{s.label}</span>
              <button
                type="button"
                className="ml-1 rounded-full p-0.5 hover:bg-slate-200"
                onClick={() => remove(s.value)}
                aria-label={`Remover ${s.label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {selected.length > 12 && (
            <Badge variant="outline" className="rounded-full">
              +{selected.length - 12}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
