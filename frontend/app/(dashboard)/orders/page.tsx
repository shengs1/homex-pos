"use client";

import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { RoleGuard } from "@/components/auth/role-guard";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/contexts/language-context";

import { InvoiceListTab } from "@/components/invoices/invoice-list-tab";
import { PaymentHistoryTab } from "@/components/invoices/payment-history-tab";
import { ReturnHistoryTab } from "@/components/invoices/return-history-tab";

export default function InvoicesPage() {
  const router = useRouter();
  const { t } = useLanguage();

  return (
    <RoleGuard allowedRoles={["ADMIN", "CASHIER"]}>
      <div className="min-w-0 space-y-5">
        <div className="print:hidden no-print space-y-5">
          <PageHeader
            title={t("invoices.title")}
            description={t("invoices.description")}
          >
            <Button type="button" onClick={() => router.push("/pos")}>
              <Plus className="mr-2 h-4 w-4" />
              {t("invoices.createAtPos")}
            </Button>
          </PageHeader>
        </div>

        <Tabs defaultValue="all" className="w-full">
          <div className="print:hidden no-print">
            <TabsList className="mb-4">
              <TabsTrigger value="all">{t("common.all")}</TabsTrigger>
              <TabsTrigger value="draft">{t("status.DRAFT")}</TabsTrigger>
              <TabsTrigger value="payments">{t("nav.payments")}</TabsTrigger>
              <TabsTrigger value="returns">{t("returnOrders.title")}</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="all" className="mt-0">
            <InvoiceListTab />
          </TabsContent>

          <TabsContent value="draft" className="mt-0">
            <InvoiceListTab forceStatus="DRAFT" />
          </TabsContent>

          <TabsContent value="payments" className="print:hidden mt-0">
            <PaymentHistoryTab />
          </TabsContent>

          <TabsContent value="returns" className="print:hidden mt-0">
            <ReturnHistoryTab />
          </TabsContent>
        </Tabs>
      </div>
    </RoleGuard>
  );
}
