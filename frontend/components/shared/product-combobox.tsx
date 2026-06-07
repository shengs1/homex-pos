"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/contexts/language-context";
import { cn } from "@/lib/utils";
import type { Product } from "@/types/domain";

type ProductComboboxProps = {
  products: Product[];
  value: number;
  onChange: (productId: number) => void;
  placeholder?: string;
};

export function ProductCombobox({ products, value, onChange, placeholder }: ProductComboboxProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedProduct = products.find((product) => product.id === value);
  const filteredProducts = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return products.slice(0, 80);
    return products
      .filter((product) => `${product.sku} ${product.name}`.toLowerCase().includes(text))
      .slice(0, 80);
  }, [products, query]);

  return (
    <div className="relative">
      <Button type="button" variant="outline" className="h-auto min-h-10 w-full justify-between whitespace-normal px-3 py-2 text-left" onClick={() => setOpen((current) => !current)}>
        <span className={cn("line-clamp-2", !selectedProduct && "text-muted-foreground")}>
          {selectedProduct ? `${selectedProduct.sku} - ${selectedProduct.name}` : placeholder || t("inventory.comboboxPlaceholder")}
        </span>
        <ChevronsUpDown className="h-4 w-4 opacity-60" />
      </Button>
      {open ? (
        <div className="absolute z-40 mt-2 w-full rounded-lg border bg-popover p-2 shadow-lg">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder || t("inventory.comboboxPlaceholder")} autoFocus />
          <div className="mt-2 max-h-72 overflow-y-auto">
            {filteredProducts.length === 0 ? <div className="px-3 py-6 text-center text-sm text-muted-foreground">{t("inventory.comboboxEmpty")}</div> : null}
            {filteredProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                className="flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  onChange(product.id);
                  setOpen(false);
                  setQuery("");
                }}
              >
                <Check className={cn("mt-0.5 h-4 w-4", product.id === value ? "opacity-100" : "opacity-0")} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{product.sku}</span>
                  <span className="block truncate text-xs text-muted-foreground">{product.name}</span>
                </span>
                <span className="text-xs text-muted-foreground">{product.stockQuantity}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
