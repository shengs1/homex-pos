"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Eye } from "lucide-react";
import { RoleGuard } from "@/components/auth/role-guard";
import { ActionMenu } from "@/components/shared/action-menu";
import { DataTable, Td, Th } from "@/components/shared/data-table";
import { DateFilterInput } from "@/components/shared/date-filter-input";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/shared/message-state";
import { PageHeader } from "@/components/shared/page-header";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/contexts/language-context";
import { getApiErrorMessage } from "@/lib/api";
import { formatDateTimePartsVN } from "@/lib/date-format";
import { auditLogService } from "@/services/homex.service";
import type { Pagination } from "@/types/api";
import type { AuditLog } from "@/types/domain";

const PAGE_SIZE = 10;

function DateTimeCell({ value }: { value: string | Date | null | undefined }) {
  const parts = formatDateTimePartsVN(value);

  return (
    <div className="leading-6">
      <div>{parts.time}</div>
      <div>{parts.date}</div>
    </div>
  );
}

export default function AuditLogsPage() {
  const { t } = useLanguage();
  const detailRef = useRef<HTMLDivElement | null>(null);

  const [items, setItems] = useState<AuditLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [userId, setUserId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  function scrollToDetail() {
    window.setTimeout(() => {
      detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  async function loadData(currentPage = page) {
    try {
      setIsLoading(true);
      setErrorMessage("");

      const data = await auditLogService.list({
        page: currentPage,
        limit: PAGE_SIZE,
        search,
        action,
        entityType,
        userId,
        fromDate,
        toDate,
      });

      setItems(data.items);
      setPagination(data.pagination);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function loadDetail(id: number) {
    try {
      setErrorMessage("");
      const data = await auditLogService.detail(id);
      setSelectedLog(data);
      scrollToDetail();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  }

  useEffect(() => {
    loadData(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    loadData(1);
  }

  return (
    <RoleGuard allowedRoles={["ADMIN"]}>
      <div className="space-y-6">
        <PageHeader
          title={t("audit.title")}
          description={t("audit.description")}
        />

        <ErrorState message={errorMessage} />

        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSearchSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12">
                <Input
                  placeholder={t("audit.searchPlaceholder")}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-12 xl:col-span-4"
                />

                <Input
                  placeholder={t("audit.action")}
                  value={action}
                  onChange={(event) => setAction(event.target.value)}
                  className="h-12 xl:col-span-2"
                />

                <Input
                  placeholder={t("audit.entityType")}
                  value={entityType}
                  onChange={(event) => setEntityType(event.target.value)}
                  className="h-12 xl:col-span-2"
                />

                <Input
                  type="number"
                  placeholder={t("audit.userIdFilter")}
                  value={userId}
                  onChange={(event) => setUserId(event.target.value)}
                  className="h-12 xl:col-span-2"
                />
              </div>

              <div className="flex flex-wrap items-end gap-4">
                <DateFilterInput
                  label={t("reports.fromDate")}
                  value={fromDate}
                  onChange={setFromDate}
                  className="w-full md:w-[220px]"
                  inputClassName="h-12"
                />

                <DateFilterInput
                  label={t("reports.toDate")}
                  value={toDate}
                  onChange={setToDate}
                  className="w-full md:w-[220px]"
                  inputClassName="h-12"
                />

                <Button type="submit" className="h-12 w-full md:w-[220px]">
                  {t("common.filter")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {isLoading ? <LoadingState /> : null}
        {!isLoading && items.length === 0 ? <EmptyState /> : null}

        {!isLoading && items.length > 0 ? (
          <DataTable>
            <thead>
              <tr>
                <Th className="w-[90px] whitespace-nowrap">{t("common.no")}</Th>
                <Th>{t("audit.user")}</Th>
                <Th>{t("audit.action")}</Th>
                <Th>{t("audit.entityType")}</Th>
                <Th>{t("audit.entityId")}</Th>
                <Th>{t("audit.descriptionField")}</Th>
                <Th>{t("common.createdAt")}</Th>
                <Th className="w-[96px] whitespace-nowrap text-right">{t("common.actions")}</Th>
              </tr>
            </thead>

            <tbody>
              {items.map((item, index) => (
                <tr key={item.id}>
                  <Td className="font-medium">{(page - 1) * PAGE_SIZE + index + 1}</Td>
                  <Td>{item.user?.fullName || item.userId}</Td>
                  <Td className="font-medium">{item.action}</Td>
                  <Td>{item.entityType}</Td>
                  <Td>{item.entityId}</Td>
                  <Td>{item.description || "-"}</Td>
                  <Td><DateTimeCell value={item.createdAt} /></Td>
                  <Td className="text-right">
                    <ActionMenu
                      label={t("common.actions")}
                      items={[
                        {
                          label: t("common.detail"),
                          icon: <Eye className="h-4 w-4" />,
                          onClick: () => loadDetail(item.id),
                        },
                      ]}
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : null}

        <PaginationControls pagination={pagination} onPageChange={setPage} />

        <div ref={detailRef}>
          {selectedLog ? (
            <Card>
              <CardHeader>
                <CardTitle>
                  {t("audit.detailTitle", { id: selectedLog.id })}
                </CardTitle>
              </CardHeader>

              <CardContent className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm font-semibold">{t("audit.user")}</p>
                  <p>{selectedLog.user?.fullName || selectedLog.userId}</p>
                </div>

                <div>
                  <p className="text-sm font-semibold">{t("audit.action")}</p>
                  <p>{selectedLog.action}</p>
                </div>

                <div>
                  <p className="text-sm font-semibold">{t("audit.entityType")}</p>
                  <p>{selectedLog.entityType}</p>
                </div>

                <div>
                  <p className="text-sm font-semibold">{t("audit.entityId")}</p>
                  <p>{selectedLog.entityId}</p>
                </div>

                <div className="md:col-span-2">
                  <p className="text-sm font-semibold">
                    {t("audit.descriptionField")}
                  </p>
                  <p>{selectedLog.description || "-"}</p>
                </div>

                <div>
                  <p className="text-sm font-semibold">{t("common.createdAt")}</p>
                  <DateTimeCell value={selectedLog.createdAt} />
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </RoleGuard>
  );
}
