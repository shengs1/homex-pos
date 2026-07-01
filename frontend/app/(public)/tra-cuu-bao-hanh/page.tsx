"use client";
 
import { useState, useEffect, Suspense, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Search, Smartphone, Shield, ShieldCheck, ShieldAlert, Loader2, Sparkles, ReceiptText } from "lucide-react";
import { cn } from "@/lib/utils";
import { warrantyService } from "@/services/homex.service";
import { formatDateVN } from "@/lib/date-format";
import { useLanguage } from "@/contexts/language-context";
import type { Warranty } from "@/types/domain";
 
function maskCustomerName(fullName: string) {
  if (!fullName) return "";
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return "";
  if (parts.length === 1) {
    const name = parts[0];
    return name.length > 1 ? name[0] + "***" : name;
  }
  const lastName = parts[parts.length - 1];
  if (lastName.length > 1) {
    parts[parts.length - 1] = lastName[0] + "***";
  } else {
    parts[parts.length - 1] = lastName + "***";
  }
  return parts.join(" ");
}
 
function SearchContent() {
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<"phone" | "code">("phone");
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [results, setResults] = useState<Warranty[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const resultRef = useRef<HTMLDivElement>(null);
 
  // Handle auto-load if code is passed in URL
  useEffect(() => {
    const codeParam = searchParams.get("code");
    if (codeParam) {
      setActiveTab("code");
      setInputValue(codeParam);
      void triggerSearch("code", codeParam);
    }
  }, [searchParams]);
 
  const triggerSearch = async (type: "phone" | "code", value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
 
    setIsLoading(true);
    setErrorMsg("");
    setResults([]);
    setSearched(false);
 
    try {
      const params = type === "phone" ? { phone: trimmed } : { code: trimmed };
      const data = await warrantyService.publicLookup(params);
      
      setResults(data);
      setSearched(true);
 
      // Smooth scroll to results after a short timeout to let render finish
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } catch (error: any) {
      setResults([]);
      setSearched(true);
      setErrorMsg(t("warrantyLookup.notFound"));
    } finally {
      setIsLoading(false);
    }
  };
 
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) {
      setErrorMsg(activeTab === "phone" ? t("warrantyLookup.phoneRequired") : t("warrantyLookup.codeRequired"));
      return;
    }
    void triggerSearch(activeTab, inputValue);
  };
 
  return (
    <div className="w-full max-w-xl mx-auto space-y-6">
      {/* Search form card */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-xl overflow-hidden">
        <div className="bg-teal-800 p-6 text-white text-center space-y-1">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-teal-700/60 border border-teal-500/30 mb-2">
            <Shield className="h-6 w-6 text-teal-300" />
          </div>
          <h2 className="text-lg font-black tracking-tight uppercase">{t("warrantyLookup.title")}</h2>
          <p className="text-xs text-teal-200/90 font-medium">{t("warrantyLookup.subtitle")}</p>
        </div>
 
        <div className="p-6 space-y-6">
          {/* Tabs */}
          <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setActiveTab("phone");
                setInputValue("");
                setSearched(false);
                setErrorMsg("");
              }}
              className={cn(
                "py-2.5 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer",
                activeTab === "phone" ? "bg-white text-teal-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
              )}
            >
              <Smartphone className="h-4 w-4" /> {t("warrantyLookup.byPhone")}
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("code");
                setInputValue("");
                setSearched(false);
                setErrorMsg("");
              }}
              className={cn(
                "py-2.5 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer",
                activeTab === "code" ? "bg-white text-teal-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
              )}
            >
              <ReceiptText className="h-4 w-4" /> {t("warrantyLookup.byCode")}
            </button>
          </div>
 
          {/* Input & Action */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="lookup-input" className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                {activeTab === "phone" ? t("warrantyLookup.phoneLabel") : t("warrantyLookup.codeLabel")}
              </label>
              <div className="relative">
                <input
                  id="lookup-input"
                  type={activeTab === "phone" ? "tel" : "text"}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={activeTab === "phone" ? t("warrantyLookup.phonePlaceholder") : t("warrantyLookup.codePlaceholder")}
                  className="w-full h-14 pl-4 pr-12 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-700 font-medium text-slate-800 placeholder:text-slate-400"
                  disabled={isLoading}
                />
                <button
                  type="submit"
                  disabled={isLoading}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 h-9 w-9 flex items-center justify-center rounded-lg bg-teal-800 hover:bg-teal-900 text-white transition cursor-pointer"
                  title={t("common.search")}
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </button>
              </div>
            </div>
 
            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 flex items-center justify-center gap-2 bg-teal-700 hover:bg-teal-800 text-white font-bold rounded-xl shadow-md transition cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> {t("warrantyLookup.searching")}
                </>
              ) : (
                <>
                  {t("warrantyLookup.search")}
                </>
              )}
            </button>
          </form>
 
          {errorMsg ? (
            <div className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-xs font-semibold text-rose-700 text-center leading-normal">
              {errorMsg}
            </div>
          ) : null}
        </div>
      </div>
 
      {/* Results Section */}
      {searched && results.length > 0 ? (
        <div ref={resultRef} className="space-y-4">
          <p className="text-xs font-black uppercase text-slate-400 tracking-wider pl-1 flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-amber-500" /> {t("warrantyLookup.results", { count: results.length })}
          </p>
          
          <div className="space-y-4">
            {results.map((w) => (
              <div
                key={w.id}
                className="relative bg-white rounded-3xl border border-slate-100 shadow-lg overflow-hidden border-t-4 border-t-teal-600 transition-all hover:shadow-xl"
              >
                <div className="p-6 space-y-4">
                  {/* Title & Status Badge */}
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t("warrantyLookup.warrantyCode")}</span>
                      <h4 className="text-base font-black text-slate-800">{w.warrantyCode}</h4>
                    </div>
                    {w.status === "ACTIVE" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-100 px-3.5 py-1 text-xs font-black text-emerald-700 uppercase tracking-wider shadow-sm">
                        <ShieldCheck className="h-3.5 w-3.5" /> {t("warrantyLookup.active")}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 border border-slate-200 px-3.5 py-1 text-xs font-black text-slate-500 uppercase tracking-wider shadow-sm">
                        <ShieldAlert className="h-3.5 w-3.5" /> {t("warrantyLookup.expired")}
                      </span>
                    )}
                  </div>
 
                  {/* Core details */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{t("warrantyLookup.product")}</p>
                      <p className="font-bold text-slate-800 leading-snug">{w.orderDetail?.product?.name || "-"}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{t("warrantyLookup.customerName")}</p>
                      <p className="font-semibold text-slate-700">{maskCustomerName(w.customer?.fullName || "")}</p>
                    </div>
                    <div className="space-y-1 border-t border-slate-50 pt-2 sm:border-0 sm:pt-0">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{t("warrantyLookup.purchaseDate")}</p>
                      <p className="font-medium text-slate-600">{formatDateVN(w.startDate)}</p>
                    </div>
                    <div className="space-y-1 border-t border-slate-50 pt-2 sm:border-0 sm:pt-0">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{t("warrantyLookup.endDate")}</p>
                      <p className="font-black text-slate-800">{formatDateVN(w.endDate)}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
 
export default function WarrantyLookupPage() {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col justify-between">
      {/* Header bar */}
      <header className="bg-white border-b border-slate-100 shadow-sm py-4">
        <div className="container max-w-6xl mx-auto px-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-800 text-white font-black text-sm">
              H
            </div>
            <span className="font-black text-slate-800 tracking-wider text-base">HOMEX POS</span>
          </div>
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest hidden sm:inline-block">{t("warrantyLookup.portal")}</span>
        </div>
      </header>
 
      {/* Main Form container */}
      <main className="flex-1 container max-w-6xl mx-auto px-4 py-12 flex items-center justify-center">
        <Suspense fallback={
          <div className="flex flex-col items-center justify-center space-y-2">
            <Loader2 className="h-8 w-8 animate-spin text-teal-800" />
            <p className="text-xs text-slate-500 font-bold">{t("common.loading")}</p>
          </div>
        }>
          <SearchContent />
        </Suspense>
      </main>
 
      {/* Footer copyright */}
      <footer className="bg-white border-t border-slate-100 py-6 text-center text-xs text-slate-400 font-medium">
        <div className="container max-w-6xl mx-auto px-4">
          <p>© {new Date().getFullYear()} Homex POS. {t("common.allRightsReserved")}</p>
          <p className="mt-1 text-[10px] opacity-75">{t("warrantyLookup.footerNote")}</p>
        </div>
      </footer>
    </div>
  );
}



