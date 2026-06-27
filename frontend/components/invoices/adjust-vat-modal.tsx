"use client";

import { useState, useEffect } from "react";
import { X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { vatInvoiceService } from "@/services/homex.service";
import { getApiErrorMessage } from "@/lib/api";
import { useLanguage } from "@/contexts/language-context";
import { useToast } from "@/contexts/toast-context";
import type { VatInvoiceRequest } from "@/types/domain";

type AdjustVatModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  item: VatInvoiceRequest | null;
};

export function AdjustVatModal({ isOpen, onClose, onSuccess, item }: AdjustVatModalProps) {
  const [taxCode, setTaxCode] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [note, setNote] = useState("");
  const [redInvoiceCode, setRedInvoiceCode] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [status, setStatus] = useState<"PENDING" | "APPROVED" | "REJECTED">("PENDING");

  const { t } = useLanguage();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && item) {
      setTaxCode(item.taxCode || "");
      setCompanyName(item.companyName || "");
      setCompanyAddress(item.companyAddress || "");
      setBuyerEmail(item.buyerEmail || "");
      setNote(item.note || "");
      setRedInvoiceCode(item.redInvoiceCode || "");
      setAdminNote(item.adminNote || "");
      setStatus(item.status);
    }
  }, [isOpen, item]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;

    if (!companyName.trim()) {
      toast.error(t("vat.companyNameRequired") || "Tên công ty không được để trống");
      return;
    }
    if (!taxCode.trim()) {
      toast.error(t("vat.taxCodeRequired") || "Mã số thuế không được để trống");
      return;
    }

    setIsSubmitting(true);
    try {
      await vatInvoiceService.adjust(item.id, {
        companyName: companyName.trim(),
        taxCode: taxCode.trim(),
        companyAddress: companyAddress.trim(),
        buyerEmail: buyerEmail.trim() || null,
        note: note.trim() || null,
        redInvoiceCode: redInvoiceCode.trim() || null,
        adminNote: adminNote.trim() || null,
        status,
      });

      toast.success(t("common.saveSuccess") || "Lưu cài đặt thành công");
      onSuccess();
      onClose();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg rounded-2xl p-6">
        <DialogHeader className="relative pb-4 border-b">
          <DialogTitle className="text-lg font-bold text-slate-800">
            Điều chỉnh yêu cầu VAT #{item?.id}
          </DialogTitle>
          <button
            onClick={onClose}
            className="absolute right-0 top-0 rounded-full p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Mã số thuế</Label>
              <Input
                className="h-10 border-slate-200 text-sm text-slate-800"
                value={taxCode}
                onChange={(e) => setTaxCode(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Trạng thái</Label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="flex h-10 w-full rounded-md border border-slate-200 bg-background px-3 py-2 text-sm text-slate-800 outline-none focus:ring-1 focus:ring-teal-500"
              >
                <option value="PENDING">Chờ duyệt</option>
                <option value="APPROVED">Đã duyệt</option>
                <option value="REJECTED">Bị từ chối</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Tên công ty</Label>
            <Input
              className="h-10 border-slate-200 text-sm text-slate-800"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Địa chỉ công ty</Label>
            <Input
              className="h-10 border-slate-200 text-sm text-slate-800"
              value={companyAddress}
              onChange={(e) => setCompanyAddress(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Email nhận hóa đơn</Label>
              <Input
                type="email"
                className="h-10 border-slate-200 text-sm text-slate-800"
                value={buyerEmail}
                onChange={(e) => setBuyerEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Mã hóa đơn đỏ</Label>
              <Input
                className="h-10 border-slate-200 text-sm text-slate-800"
                value={redInvoiceCode}
                onChange={(e) => setRedInvoiceCode(e.target.value)}
                placeholder="Nhập mã hóa đơn đỏ..."
                disabled={status !== "APPROVED"}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Ghi chú của khách</Label>
              <Textarea
                className="min-h-[60px] border-slate-200 text-sm text-slate-800 resize-none"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Ghi chú của admin</Label>
              <Textarea
                className="min-h-[60px] border-slate-200 text-sm text-slate-800 resize-none"
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="h-10 px-4 text-sm font-medium"
            >
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="h-10 px-5 text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Đang lưu...
                </>
              ) : (
                "Lưu thay đổi"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
