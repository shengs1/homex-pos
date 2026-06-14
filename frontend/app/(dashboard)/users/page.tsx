"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Edit, Eye, EyeOff, KeyRound, Lock, Plus, RotateCcw } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { RoleGuard } from "@/components/auth/role-guard";
import { ActionMenu } from "@/components/shared/action-menu";
import { DataTable, Td, Th } from "@/components/shared/data-table";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/message-state";
import { PageHeader } from "@/components/shared/page-header";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useLanguage } from "@/contexts/language-context";
import { getApiErrorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { userService } from "@/services/homex.service";
import type { Pagination } from "@/types/api";
import type { UserAccount } from "@/types/domain";

const createSchema = z.object({
  fullName: z.string().trim().min(1, "Họ tên không được để trống"),
  email: z.string().trim().email("Email không hợp lệ"),
  password: z.string().min(6, "Mật khẩu tối thiểu 6 ký tự"),
  role: z.enum(["ADMIN", "CASHIER"]),
});

const updateSchema = z.object({
  fullName: z.string().trim().min(1, "Họ tên không được để trống"),
  email: z.string().trim().email("Email không hợp lệ"),
  role: z.enum(["ADMIN", "CASHIER"]),
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

const passwordSchema = z.object({ newPassword: z.string().min(6, "Mật khẩu tối thiểu 6 ký tự") });

type CreateValues = z.infer<typeof createSchema>;
type UpdateValues = z.infer<typeof updateSchema>;
type PasswordValues = z.infer<typeof passwordSchema>;

const PAGE_SIZE = 10;

export default function UsersPage() {
  const { t } = useLanguage();
  const [items, setItems] = useState<UserAccount[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<UserAccount | null>(null);
  const [passwordItem, setPasswordItem] = useState<UserAccount | null>(null);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const createForm = useForm<CreateValues>({ resolver: zodResolver(createSchema), defaultValues: { fullName: "", email: "", password: "123456", role: "CASHIER" } });
  const updateForm = useForm<UpdateValues>({ resolver: zodResolver(updateSchema), defaultValues: { fullName: "", email: "", role: "CASHIER", status: "ACTIVE" } });
  const passwordForm = useForm<PasswordValues>({ resolver: zodResolver(passwordSchema), defaultValues: { newPassword: "123456" } });

  async function loadData(currentPage = page) {
    try {
      setIsLoading(true);
      setErrorMessage("");
      const data = await userService.list({ page: currentPage, limit: PAGE_SIZE, search, role, status });
      setItems(data.items);
      setPagination(data.pagination);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData(page);
  }, [page, role, status]);

  function openEdit(item: UserAccount) {
    setEditingItem(item);
    setPasswordItem(null);
    updateForm.reset({ fullName: item.fullName, email: item.email, role: item.role.name, status: item.status });
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 50);
  }

  function openPassword(item: UserAccount) {
    setPasswordItem(item);
    setEditingItem(null);
    setShowChangePassword(true);
    passwordForm.reset({ newPassword: "123456" });
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 50);
  }

  async function submitCreate(values: CreateValues) {
    try {
      setErrorMessage("");
      setSuccessMessage("");
      await userService.create(values);
      setSuccessMessage(t("users.createSuccess"));
      setIsCreateOpen(false);
      setShowCreatePassword(false);
      createForm.reset({ fullName: "", email: "", password: "123456", role: "CASHIER" });
      await loadData(page);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  }

  async function submitUpdate(values: UpdateValues) {
    if (!editingItem) return;
    try {
      setErrorMessage("");
      setSuccessMessage("");
      await userService.update(editingItem.id, values);
      setSuccessMessage(t("users.updateSuccess"));
      setEditingItem(null);
      await loadData(page);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  }

  async function submitPassword(values: PasswordValues) {
    if (!passwordItem) return;
    try {
      setErrorMessage("");
      setSuccessMessage("");
      await userService.changePassword(passwordItem.id, values);
      setSuccessMessage(t("users.passwordSuccess", { password: values.newPassword }));
      setPasswordItem(null);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  }

  async function handleLock(item: UserAccount) {
    if (!window.confirm(t("users.lockConfirm", { email: item.email }))) return;
    try {
      await userService.lock(item.id);
      await loadData(page);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  }

  async function handleRestore(item: UserAccount) {
    if (!window.confirm(t("users.restoreConfirm", { email: item.email }))) return;
    try {
      await userService.restore(item.id);
      await loadData(page);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  }

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    loadData(1);
  }

  return (
    <RoleGuard allowedRoles={["ADMIN"]}>
      <div className="space-y-6">
        <PageHeader title={t("users.title")} description={t("users.description")}>
          <Button onClick={() => setIsCreateOpen((value) => !value)}><Plus className="h-4 w-4" />{t("users.add")}</Button>
        </PageHeader>
        <ErrorState message={errorMessage} />
        {successMessage ? <div className="rounded-lg border bg-card p-3 text-sm text-green-700">{successMessage}</div> : null}

        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSearchSubmit} className="grid gap-4 md:grid-cols-[1fr_180px_180px_auto]">
              <Input placeholder={t("users.searchPlaceholder")} value={search} onChange={(event) => setSearch(event.target.value)} />
              <Select value={role} onChange={(event) => { setRole(event.target.value); setPage(1); }}>
                <option value="">{t("common.allRoles")}</option>
                <option value="ADMIN">ADMIN</option>
                <option value="CASHIER">CASHIER</option>
              </Select>
              <Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
                <option value="">{t("common.allStatus")}</option>
                <option value="ACTIVE">{t("status.ACTIVE")}</option>
                <option value="INACTIVE">{t("status.INACTIVE")}</option>
              </Select>
              <Button type="submit">{t("common.search")}</Button>
            </form>
          </CardContent>
        </Card>

        {isCreateOpen ? (
          <Card>
            <CardHeader><CardTitle>{t("users.createTitle")}</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={createForm.handleSubmit(submitCreate)} className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2"><Label>{t("users.fullName")}</Label><Input {...createForm.register("fullName")} />{createForm.formState.errors.fullName ? <p className="text-sm text-destructive">{createForm.formState.errors.fullName.message}</p> : null}</div>
                <div className="space-y-2"><Label>{t("common.email")}</Label><Input {...createForm.register("email")} />{createForm.formState.errors.email ? <p className="text-sm text-destructive">{createForm.formState.errors.email.message}</p> : null}</div>
                <div className="space-y-2">
                  <Label>{t("users.password")}</Label>
                  <div className="flex gap-2">
                    <Input type={showCreatePassword ? "text" : "password"} {...createForm.register("password")} />
                    <Button type="button" variant="outline" size="icon" onClick={() => setShowCreatePassword((value) => !value)} title={showCreatePassword ? t("common.hide") : t("common.show")}>
                      {showCreatePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  {createForm.formState.errors.password ? <p className="text-sm text-destructive">{createForm.formState.errors.password.message}</p> : null}
                </div>
                <div className="space-y-2"><Label>{t("common.role")}</Label><Select {...createForm.register("role")}><option value="ADMIN">ADMIN</option><option value="CASHIER">CASHIER</option></Select></div>
                <div className="flex gap-2 md:col-span-2"><Button type="submit">{t("common.create")}</Button><Button variant="outline" onClick={() => setIsCreateOpen(false)}>{t("common.cancel")}</Button></div>
              </form>
            </CardContent>
          </Card>
        ) : null}

        {editingItem ? (
          <Card>
            <CardHeader><CardTitle>{t("users.updateTitle", { email: editingItem.email })}</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={updateForm.handleSubmit(submitUpdate)} className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2"><Label>{t("users.fullName")}</Label><Input {...updateForm.register("fullName")} />{updateForm.formState.errors.fullName ? <p className="text-sm text-destructive">{updateForm.formState.errors.fullName.message}</p> : null}</div>
                <div className="space-y-2"><Label>{t("common.email")}</Label><Input {...updateForm.register("email")} />{updateForm.formState.errors.email ? <p className="text-sm text-destructive">{updateForm.formState.errors.email.message}</p> : null}</div>
                <div className="space-y-2"><Label>{t("common.role")}</Label><Select {...updateForm.register("role")}><option value="ADMIN">ADMIN</option><option value="CASHIER">CASHIER</option></Select></div>
                <div className="space-y-2"><Label>{t("common.status")}</Label><Select {...updateForm.register("status")}><option value="ACTIVE">{t("status.ACTIVE")}</option><option value="INACTIVE">{t("status.INACTIVE")}</option></Select></div>
                <div className="flex gap-2 md:col-span-2"><Button type="submit">{t("common.save")}</Button><Button variant="outline" onClick={() => setEditingItem(null)}>{t("common.cancel")}</Button></div>
              </form>
            </CardContent>
          </Card>
        ) : null}

        {passwordItem ? (
          <Card>
            <CardHeader><CardTitle>{t("users.changePasswordTitle", { email: passwordItem.email })}</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={passwordForm.handleSubmit(submitPassword)} className="grid gap-4 md:grid-cols-[1fr_auto_auto_auto]">
                <div className="space-y-2">
                  <Label>{t("users.newPassword")}</Label>
                  <Input type={showChangePassword ? "text" : "password"} {...passwordForm.register("newPassword")} />
                  {passwordForm.formState.errors.newPassword ? <p className="text-sm text-destructive">{passwordForm.formState.errors.newPassword.message}</p> : null}
                </div>
                <div className="flex items-end"><Button type="button" variant="outline" onClick={() => setShowChangePassword((value) => !value)}>{showChangePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{showChangePassword ? t("common.hide") : t("common.show")}</Button></div>
                <div className="flex items-end"><Button type="submit">{t("users.changePassword")}</Button></div>
                <div className="flex items-end"><Button variant="outline" onClick={() => setPasswordItem(null)}>{t("common.cancel")}</Button></div>
              </form>
            </CardContent>
          </Card>
        ) : null}

        {isLoading ? <LoadingState /> : null}
        {!isLoading && items.length === 0 ? <EmptyState /> : null}
        {!isLoading && items.length > 0 ? (
          <DataTable>
            <thead><tr><Th className="w-[90px] whitespace-nowrap">{t("common.no")}</Th><Th>{t("users.fullName")}</Th><Th>{t("common.email")}</Th><Th>{t("common.role")}</Th><Th>{t("common.status")}</Th><Th>{t("common.createdAt")}</Th><Th className="w-[96px] whitespace-nowrap text-right">{t("common.actions")}</Th></tr></thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={item.id}>
                  <Td className="font-medium">{(page - 1) * PAGE_SIZE + index + 1}</Td>
                  <Td className="font-medium">{item.fullName}</Td>
                  <Td>{item.email}</Td>
                  <Td>{item.role.name}</Td>
                  <Td><StatusBadge status={item.status} /></Td>
                  <Td>{formatDateTime(item.createdAt)}</Td>
                  <Td className="text-right">
                    <ActionMenu
                      label={t("common.actions")}
                      items={[
                        { label: t("common.update"), icon: <Edit className="h-4 w-4" />, onClick: () => openEdit(item) },
                        { label: t("users.changePassword"), icon: <KeyRound className="h-4 w-4" />, onClick: () => openPassword(item) },
                        item.status === "ACTIVE"
                          ? { label: t("users.lock"), icon: <Lock className="h-4 w-4" />, onClick: () => handleLock(item), variant: "destructive" }
                          : { label: t("users.unlock"), icon: <RotateCcw className="h-4 w-4" />, onClick: () => handleRestore(item) },
                      ]}
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : null}
        <PaginationControls pagination={pagination} onPageChange={setPage} />
      </div>
    </RoleGuard>
  );
}
