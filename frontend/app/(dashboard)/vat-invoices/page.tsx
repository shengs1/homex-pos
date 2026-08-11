"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Inbox, XCircle, Download, Send, RefreshCcw, Mail, Plus, Sparkles, Edit, Trash2, MoreHorizontal } from "lucide-react";
import { RoleGuard } from "@/components/auth/role-guard";
import { useCurrentUser } from "@/hooks/use-current-user";
import { DataTable, Td, Th } from "@/components/shared/data-table";
import { ErrorState, LoadingState } from "@/components/shared/message-state";
import { PageHeader } from "@/components/shared/page-header";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/contexts/language-context";
import { useToast } from "@/contexts/toast-context";
import { getApiErrorMessage } from "@/lib/api";
import { confirmAction } from "@/lib/confirm-action";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { vatInvoiceService } from "@/services/homex.service";
import { CreateVatModal } from "@/components/invoices/create-vat-modal";
import { AdjustVatModal } from "@/components/invoices/adjust-vat-modal";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import type { Pagination } from "@/types/api";
import type { VatInvoiceRequest } from "@/types/domain";

const PAGE_SIZE = 10;

export default function VatInvoicesPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const user = useCurrentUser();
  const [items, setItems] = useState<VatInvoiceRequest[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("PENDING");
  const [redInvoiceCodes, setRedInvoiceCodes] = useState<Record<number, string>>({});
  const [adminNotes, setAdminNotes] = useState<Record<number, string>>({});
  
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const { toast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<VatInvoiceRequest | null>(null);

  async function loadData(currentPage = page, currentStatus = status) {
    try {
      setIsLoading(true);
      setErrorMessage("");
      const data = await vatInvoiceService.list({ page: currentPage, limit: PAGE_SIZE, search, status: currentStatus });
      setItems(data.items);
      setPagination(data.pagination);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData(page, status);
  }, [page, status]);

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    loadData(1, status);
  }

  function handleTabChange(newStatus: string) {
    setStatus(newStatus);
    setPage(1);
    setSearch("");
  }

  function generateMockRedInvoiceCode() {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `HDDT-${today}-${randomStr}`;
  }

  function handleGenerateCode(id: number) {
    const code = generateMockRedInvoiceCode();
    setRedInvoiceCodes(prev => ({ ...prev, [id]: code }));
    toast.success(t("vat.mockCodeGenerated"));
  }

  async function approve(item: VatInvoiceRequest) {
    try {
      const finalCode = redInvoiceCodes[item.id] || generateMockRedInvoiceCode();
      await vatInvoiceService.approve(item.id, {
        redInvoiceCode: finalCode,
        adminNote: adminNotes[item.id] || "",
      });
      toast.success(t("vat.approved"));
      await loadData(page, status);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  async function reject(item: VatInvoiceRequest) {
    try {
      await vatInvoiceService.reject(item.id, { adminNote: adminNotes[item.id] || "" });
      toast.success(t("vat.rejected"));
      await loadData(page, status);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  function handleOpenAdjust(item: VatInvoiceRequest) {
    setSelectedItem(item);
    setIsAdjustModalOpen(true);
  }

  async function handleDelete(id: number) {
    if (await confirmAction({ description: t("vat.deleteConfirm"), confirmLabel: t("common.confirm"), cancelLabel: t("common.cancel"), destructive: true })) {
      try {
        await vatInvoiceService.delete(id);
        toast.success(t("vat.deleteSuccess"));
        await loadData(page, status);
      } catch (error) {
        toast.error(getApiErrorMessage(error));
      }
    }
  }

  async function resendEmail(item: VatInvoiceRequest) {
    try {
      await vatInvoiceService.resendEmail(item.id);
      toast.success(t("vat.emailResent"));
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  function handleExportCsv() {
    if (items.length === 0) return;
    
    const headers = [
      t("vat.requestId"),
      t("orders.orderCode"),
      t("vat.companyName"),
      t("vat.taxCode"),
      t("vat.email"),
      t("orders.total"),
      t("common.status"),
      t("common.createdAt"),
      t("vat.redInvoiceCode"),
    ];
    const rows = items.map(item => [
      item.id,
      item.order?.orderCode || item.orderId,
      `"${(item.companyName || "").replace(/"/g, '""')}"`,
      `'${item.taxCode}`, // Prevent excel scientific notation
      item.buyerEmail || "",
      item.order ? item.order.totalAmount : "",
      item.status,
      new Date(item.requestedAt).toLocaleString("vi-VN"),
      item.redInvoiceCode || ""
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `vat_invoices_${status}_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <RoleGuard allowedRoles={["ADMIN", "CASHIER"]}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <PageHeader title={t("vat.title")} description={t("vat.description")} />
          <Button onClick={() => setIsModalOpen(true)} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" /> {t("vat.requestVat")}
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 border-b">
          <button 
            onClick={() => handleTabChange("PENDING")} 
            className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${status === "PENDING" ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >
            {t("status.PENDING")}
          </button>
          <button 
            onClick={() => handleTabChange("APPROVED")} 
            className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${status === "APPROVED" ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >
            {t("status.APPROVED")}
          </button>
          <button 
            onClick={() => handleTabChange("REJECTED")} 
            className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${status === "REJECTED" ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >
            {t("vat.rejectedOrFailed")}
          </button>
        </div>

        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSearchSubmit} className="grid gap-4 md:grid-cols-[1fr_auto]">
              <Input placeholder={t("vat.searchPlaceholder")} value={search} onChange={(event) => setSearch(event.target.value)} />
              <div className="flex flex-wrap gap-2 justify-end">
                <Button type="submit">{t("common.search")}</Button>
                {user?.role === "ADMIN" && (
                  <>
                    <Button type="button" variant="outline" onClick={handleExportCsv} disabled={items.length === 0}>
                      <Download className="mr-2 h-4 w-4" /> {t("vat.exportForAccounting")}
                    </Button>
                    {status === "PENDING" && (
                      <Button type="button" variant="outline" onClick={() => { toast.error(t("vat.eInvoiceNotConfigured")); }}>
                        <Send className="mr-2 h-4 w-4" /> {t("vat.bulkIssue")}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        <ErrorState message={errorMessage} />
        {isLoading ? <LoadingState /> : null}

        {!isLoading && items.length === 0 ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed bg-card p-8 text-center shadow-sm">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Inbox className="h-8 w-8" />
            </div>
            <h3 className="mb-2 text-lg font-bold">{t("message.empty")}</h3>
            <p className="max-w-md text-sm text-muted-foreground mb-6">
              {t("vat.emptyList")}
            </p>
            <Button type="button" onClick={() => setIsModalOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> {t("vat.requestVat")}
            </Button>
          </div>
        ) : null}

        {!isLoading && items.length > 0 ? (
          <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-sm">
            <CardContent className="p-0 overflow-x-auto">
              <DataTable className="rounded-none border-0 shadow-none min-w-[1000px]">
                <thead>
                  <tr>
                    <Th>{t("vat.requestId")}</Th>
                    <Th>{t("orders.orderCode")}</Th>
                    <Th>{t("vat.companyName")}</Th>
                    <Th>{t("vat.taxCode")}</Th>
                    <Th>{t("vat.email")}</Th>
                    <Th>{t("orders.total")}</Th>
                    <Th>{t("vat.redInvoiceCode")}</Th>
                    <Th>{t("common.createdAt")}</Th>
                    <Th className="text-right">{t("common.actions")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <Td className="font-semibold text-muted-foreground">#{item.id}</Td>
                      <Td className="font-medium">{item.order?.orderCode || item.orderId}</Td>
                      <Td>
                        <div className="font-medium break-words whitespace-normal line-clamp-2">{item.companyName}</div>
                        <div className="text-xs text-muted-foreground break-words whitespace-normal line-clamp-1">{item.companyAddress}</div>
                      </Td>
                      <Td>{item.taxCode}</Td>
                      <Td>{item.buyerEmail || "-"}</Td>
                      <Td className="font-medium">{item.order ? formatCurrency(item.order.totalAmount) : "-"}</Td>
                      <Td>
                        {item.redInvoiceCode ? (
                          <span className="font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg text-xs">
                            {item.redInvoiceCode}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </Td>
                      <Td>{formatDateTime(item.requestedAt)}</Td>
                      <Td className="text-right">
                        {item.status === "PENDING" && user?.role === "ADMIN" ? (
                          <div className="flex min-w-[240px] flex-col items-end gap-2">
                            <div className="flex w-full items-center gap-2">
                              <Input className="h-9 text-xs flex-1" placeholder={t("vat.redInvoiceCodePlaceholder")} value={redInvoiceCodes[item.id] || ""} onChange={(event) => setRedInvoiceCodes((current) => ({ ...current, [item.id]: event.target.value }))} />
                              <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" title={t("vat.generateCodeTooltip")} onClick={() => handleGenerateCode(item.id)}>
                                <Sparkles className="h-4 w-4" />
                              </Button>
                            </div>
                            <Input className="h-9 text-xs" placeholder={t("vat.adminNote")} value={adminNotes[item.id] || ""} onChange={(event) => setAdminNotes((current) => ({ ...current, [item.id]: event.target.value }))} />
                            <div className="flex w-full gap-2">
                              <Button type="button" size="sm" className="flex-1" onClick={() => approve(item)}><CheckCircle className="h-3 w-3 mr-1" />{t("vat.approve")}</Button>
                              <Button type="button" size="sm" className="flex-1" variant="outline" onClick={() => reject(item)}><XCircle className="h-3 w-3 mr-1" />{t("vat.reject")}</Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2 text-sm min-w-[120px]">
                            {item.adminNote && (
                              <div className="text-xs text-muted-foreground break-words max-w-[150px] text-right mr-1" title={item.adminNote}>
                                {item.adminNote}
                              </div>
                            )}
                            
                            <DropdownMenu>
                              <DropdownMenuTrigger className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors">
                                <MoreHorizontal className="h-4 w-4" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent className="w-36">
                                {item.status === "APPROVED" && (
                                  <DropdownMenuItem onClick={() => resendEmail(item)}>
                                    <Mail className="h-4 w-4 text-slate-500 mr-2" />
                                    {t("vat.resendEmail")}
                                  </DropdownMenuItem>
                                )}
                                {user?.role === "ADMIN" && (
                                  <>
                                    <DropdownMenuItem onClick={() => handleOpenAdjust(item)}>
                                      <Edit className="h-4 w-4 text-slate-500 mr-2" />
                                      {t("common.update")}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem 
                                      onClick={() => handleDelete(item.id)}
                                      className="text-red-600 hover:text-red-700 hover:bg-red-50/50"
                                    >
                                      <Trash2 className="h-4 w-4 text-red-500 mr-2" />
                                      {t("common.delete")}
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </CardContent>
          </Card>
        ) : null}
        
        <PaginationControls pagination={pagination} onPageChange={setPage} />
      </div>

      <CreateVatModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={() => loadData(1, status)} 
      />

      <AdjustVatModal
        isOpen={isAdjustModalOpen}
        onClose={() => { setIsAdjustModalOpen(false); setSelectedItem(null); }}
        onSuccess={() => loadData(page, status)}
        item={selectedItem}
      />
    </RoleGuard>
  );
}

