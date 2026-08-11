import { PackageSearch, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MoneyText } from "@/components/shared/money-text";
import { useLanguage } from "@/contexts/language-context";
import type { Product } from "@/types/domain";

interface ProductPreviewCardProps {
  product?: Product;
}

export function ProductPreviewCard({ product }: ProductPreviewCardProps) {
  const { t } = useLanguage();

  if (!product) {
    return (
      <Card className="h-full border-dashed bg-slate-50/50">
        <CardContent className="flex h-full flex-col items-center justify-center py-12 text-center text-slate-500">
          <PackageSearch className="mb-4 h-12 w-12 text-slate-300" />
          <p className="text-sm">{t("inventory.selectProductToPreview")}</p>
        </CardContent>
      </Card>
    );
  }

  const isOutOfStock = product.stockQuantity <= 0;
  const isLowStock = product.stockQuantity > 0 && product.stockQuantity <= product.minStock;

  return (
    <Card className="h-full shadow-sm border-slate-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">{t("inventory.selectedProductInfo")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-100 object-cover overflow-hidden">
            {product.imageUrl ? (
              <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
            ) : (
              <PackageSearch className="h-8 w-8 text-slate-400" />
            )}
          </div>
          <div className="flex-1 space-y-1">
            <h4 className="font-semibold leading-none line-clamp-2" title={product.name}>
              {product.name}
            </h4>
            <div className="text-sm text-slate-500">{product.sku}</div>
            <div className="flex items-center gap-2 pt-1">
              {isOutOfStock ? (
                <Badge variant="destructive">{t("inventory.outOfStock")}</Badge>
              ) : isLowStock ? (
                <Badge variant="outline" className="border-amber-500 text-amber-600">
                  {t("inventory.lowStock")}
                </Badge>
              ) : (
                <Badge variant="outline" className="border-emerald-500 text-emerald-600">
                  {t("inventory.inStock")}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4">
          <div className="space-y-1">
            <div className="text-xs text-slate-500">{t("inventory.currentStock")}</div>
            <div className={`text-lg font-bold ${isOutOfStock ? "text-red-600" : isLowStock ? "text-amber-600" : "text-emerald-600"}`}>
              {product.stockQuantity}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-slate-500">{t("inventory.minStock")}</div>
            <div className="text-lg font-bold text-slate-700">{product.minStock}</div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-slate-500">{t("products.category")}</div>
            <div className="text-sm font-medium text-slate-700 truncate" title={product.category?.name || String(product.categoryId)}>
              {product.category?.name || product.categoryId}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-slate-500">{t("products.supplier")}</div>
            <div className="text-sm font-medium text-slate-700 truncate" title={product.supplier?.name || String(product.supplierId)}>
              {product.supplier?.name || product.supplierId}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-sm text-slate-500">{t("inventory.lastCostPrice")}</span>
            <MoneyText value={product.costPrice} />
          </div>
          <div className="flex items-center justify-between pb-2">
            <span className="text-sm text-slate-500">{t("inventory.warehouseLocation")}</span>
            <span className="flex items-center text-sm font-medium text-slate-700">
              <MapPin className="mr-1 h-3.5 w-3.5 text-slate-400" />
              {t("inventory.notConfigured")}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
