"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Edit, Eye, EyeOff, KeyRound, Lock, Plus, RotateCcw, MoreHorizontal, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { RoleGuard } from "@/components/auth/role-guard";
import { ActionMenu } from "@/components/shared/action-menu";
import { DataTable, Td, Th } from "@/components/shared/data-table";
import { EmptyState, LoadingState } from "@/components/shared/message-state";
import { PageHeader } from "@/components/shared/page-header";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/language-context";
import { useToast } from "@/contexts/toast-context";
import { getApiErrorMessage } from "@/lib/api";
import { confirmAction } from "@/lib/confirm-action";
import { formatDateTime } from "@/lib/format";
import { userService } from "@/services/homex.service";
import type { Pagination } from "@/types/api";
import type { UserAccount } from "@/types/domain";

const optionalEmailSchema = z.union([z.string().trim().email(), z.literal("")]).optional();

const createSchema = z.object({
  employeeCode: z.string().trim().max(20).optional(),
  fullName: z.string().trim().min(1),
  email: optionalEmailSchema,
  phone: z.string().trim().min(10).max(20),
  password: z.string().min(6),
  role: z.enum(["ADMIN", "CASHIER"]),
});

const updateSchema = z.object({
  employeeCode: z.string().trim().max(20).optional(),
  fullName: z.string().trim().min(1),
  email: optionalEmailSchema,
  phone: z.string().trim().min(10).max(20),
  role: z.enum(["ADMIN", "CASHIER"]),
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

const passwordSchema = z.object({ newPassword: z.string().min(6) });

type CreateValues = z.infer<typeof createSchema>;
type UpdateValues = z.infer<typeof updateSchema>;
type PasswordValues = z.infer<typeof passwordSchema>;

const PAGE_SIZE = 10;

function isInternalEmail(email: string) {
  return email.toLowerCase().endsWith("@homex.local");
}

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
  const { toast } = useToast();
  const [adminPasswordPrompt, setAdminPasswordPrompt] = useState<{
    isOpen: boolean;
    title: string;
    action: "update" | "password" | "lock" | "unlockMenu" | "delete";
    item: UserAccount | null;
    values?: any;
  }>({ isOpen: false, title: "", action: "lock", item: null });
  const [adminPasswordInput, setAdminPasswordInput] = useState("");
  const [unlockedRootAdminIds, setUnlockedRootAdminIds] = useState<number[]>([]);

  const createForm = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      employeeCode: "",
      fullName: "",
      email: "",
      phone: "",
      password: "123456",
      role: "CASHIER",
    },
  });

  const updateForm = useForm<UpdateValues>({
    resolver: zodResolver(updateSchema),
    defaultValues: {
      employeeCode: "",
      fullName: "",
      email: "",
      phone: "",
      role: "CASHIER",
      status: "ACTIVE",
    },
  });

  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { newPassword: "123456" },
  });

  async function loadData(currentPage = page) {
    try {
      setIsLoading(true);
      const data = await userService.list({ page: currentPage, limit: PAGE_SIZE, search, status, role });
      setItems(data.items);
      setPagination(data.pagination);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
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
    updateForm.reset({
      employeeCode: item.employeeCode || "",
      fullName: item.fullName,
      email: isInternalEmail(item.email) ? "" : item.email,
      phone: item.phone || "",
      role: item.role.name,
      status: item.status,
    });
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
      await userService.create(values);
      toast.success(t("users.createSuccess"));
      setIsCreateOpen(false);
      setShowCreatePassword(false);
      createForm.reset({ employeeCode: "", fullName: "", email: "", phone: "", password: "123456", role: "CASHIER" });
      await loadData(page);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  function isRootAdmin(user: UserAccount) {
    return user.email === "admin@homex.com" || user.fullName === "Admin Homex";
  }

  async function submitUpdate(values: UpdateValues) {
    if (!editingItem) return;
    if (isRootAdmin(editingItem)) {
      setAdminPasswordPrompt({ isOpen: true, title: t("users.adminPasswordRequired"), action: "update", item: editingItem, values });
      return;
    }
    executeSubmitUpdate(values);
  }

  async function executeSubmitUpdate(values: UpdateValues, adminPassword?: string) {
    if (!editingItem) return;
    try {
      await userService.update(editingItem.id, { ...values, adminPassword });
      toast.success(t("users.updateSuccess"));
      setEditingItem(null);
      await loadData(page);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  async function submitPassword(values: PasswordValues) {
    if (!passwordItem) return;
    if (isRootAdmin(passwordItem)) {
      setAdminPasswordPrompt({ isOpen: true, title: t("users.adminPasswordRequired"), action: "password", item: passwordItem, values });
      return;
    }
    executeSubmitPassword(values);
  }

  async function executeSubmitPassword(values: PasswordValues, adminPassword?: string) {
    if (!passwordItem) return;
    try {
      await userService.changePassword(passwordItem.id, { ...values, adminPassword });
      toast.success(t("users.passwordSuccess", { password: values.newPassword }));
      setPasswordItem(null);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  async function handleLock(item: UserAccount) {
    setAdminPasswordPrompt({ isOpen: true, title: t("users.confirmLockTitle"), action: "lock", item });
  }

  async function executeLock(item: UserAccount, adminPassword?: string) {
    try {
      await userService.lock(item.id, { adminPassword });
      toast.success(t("users.lockSuccess"));
      await loadData(page);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  async function handleDelete(item: UserAccount) {
    setAdminPasswordPrompt({ isOpen: true, title: t("users.confirmDeleteTitle"), action: "delete", item });
  }

  async function executeDelete(item: UserAccount, adminPassword?: string) {
    try {
      await userService.remove(item.id, { adminPassword });
      toast.success(t("users.deleteSuccess"));
      await loadData(page);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  function handleConfirmAdminPassword() {
    const { action, values, item } = adminPasswordPrompt;
    if (!item || !adminPasswordInput) return;
    
    setAdminPasswordPrompt({ ...adminPasswordPrompt, isOpen: false });
    
    if (action === "unlockMenu") {
      userService.verifyPassword({ adminPassword: adminPasswordInput })
        .then(() => {
          setUnlockedRootAdminIds((prev) => [...prev, item.id]);
          toast.success(t("users.verifySuccess"));
        })
        .catch((err) => {
          toast.error(getApiErrorMessage(err));
        });
    } else if (action === "update") {
      executeSubmitUpdate(values, adminPasswordInput);
    } else if (action === "password") {
      executeSubmitPassword(values, adminPasswordInput);
    } else if (action === "lock") {
      executeLock(item, adminPasswordInput);
    } else if (action === "delete") {
      executeDelete(item, adminPasswordInput);
    }
    
    setAdminPasswordInput("");
  }

  async function handleRestore(item: UserAccount) {
    if (!(await confirmAction({ description: t("users.restoreConfirm", { email: item.employeeCode || item.email }), confirmLabel: t("common.confirm"), cancelLabel: t("common.cancel") }))) return;
    try {
      await userService.restore(item.id);
      toast.success(t("users.restoreSuccess"));
      await loadData(page);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    loadData(1);
  }

  function roleLabel(value: "ADMIN" | "CASHIER") {
    return t(`role.${value}`);
  }

  return (
    <RoleGuard allowedRoles={["ADMIN"]}>
      <div className="min-w-0 space-y-6">
        <PageHeader title={t("nav.employees")} description={t("users.description")}>
          <Button onClick={() => setIsCreateOpen((value) => !value)}>
            <Plus className="h-4 w-4" />
            {t("users.add")}
          </Button>
        </PageHeader>

        <Card className="min-w-0">
          <CardContent className="pt-6">
            <form onSubmit={handleSearchSubmit} className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px_180px_auto]">
              <Input placeholder={t("users.searchPlaceholder")} value={search} onChange={(event) => setSearch(event.target.value)} />
              <Select value={role} onChange={(event) => { setRole(event.target.value); setPage(1); }}>
                <option value="">{t("common.allRoles")}</option>
                <option value="ADMIN">{roleLabel("ADMIN")}</option>
                <option value="CASHIER">{roleLabel("CASHIER")}</option>
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

        <Dialog open={isCreateOpen} onOpenChange={(open) => { setIsCreateOpen(open); if (!open) { createForm.reset(); setShowCreatePassword(false); } }}>
          <DialogContent className="max-w-xl p-0 overflow-hidden flex flex-col max-h-[85vh]">
            <DialogHeader className="px-6 py-4 border-b shrink-0">
              <DialogTitle>{t("users.createTitle")}</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <form id="create-user-form" onSubmit={createForm.handleSubmit(submitCreate)} className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2"><Label>{t("users.employeeCode")}</Label><Input placeholder={t("users.employeeCodeAuto")} {...createForm.register("employeeCode")} /></div>
                <div className="space-y-2"><Label>{t("users.fullName")}</Label><Input {...createForm.register("fullName")} />{createForm.formState.errors.fullName ? <p className="text-sm text-destructive">{t("users.validationRequired")}</p> : null}</div>
                <div className="space-y-2"><Label>{t("common.phone")}</Label><Input {...createForm.register("phone")} />{createForm.formState.errors.phone ? <p className="text-sm text-destructive">{t("users.validationPhone")}</p> : null}</div>
                <div className="space-y-2"><Label>{t("users.emailOptional")}</Label><Input {...createForm.register("email")} />{createForm.formState.errors.email ? <p className="text-sm text-destructive">{t("users.validationEmail")}</p> : null}</div>
                <div className="space-y-2">
                  <Label>{t("users.password")}</Label>
                  <div className="flex gap-2">
                    <Input type={showCreatePassword ? "text" : "password"} {...createForm.register("password")} />
                    <Button type="button" variant="outline" size="icon" onClick={() => setShowCreatePassword((value) => !value)} title={showCreatePassword ? t("common.hide") : t("common.show")}>
                      {showCreatePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  {createForm.formState.errors.password ? <p className="text-sm text-destructive">{t("users.validationPassword")}</p> : null}
                </div>
                <div className="space-y-2"><Label>{t("common.role")}</Label><Select {...createForm.register("role")}><option value="CASHIER">{roleLabel("CASHIER")}</option></Select></div>
              </form>
            </div>
            <div className="px-6 py-4 border-t shrink-0 bg-slate-50/50 flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>{t("common.cancel")}</Button>
              <Button type="submit" form="create-user-form">{t("common.create")}</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!editingItem} onOpenChange={(open) => { if (!open) setEditingItem(null); }}>
          <DialogContent className="max-w-xl p-0 overflow-hidden flex flex-col max-h-[85vh]">
            <DialogHeader className="px-6 py-4 border-b shrink-0">
              <DialogTitle>{editingItem ? t("users.updateTitle", { email: editingItem.employeeCode || editingItem.email }) : ""}</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <form id="update-user-form" onSubmit={updateForm.handleSubmit(submitUpdate)} className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2"><Label>{t("users.employeeCode")}</Label><Input {...updateForm.register("employeeCode")} /></div>
                <div className="space-y-2"><Label>{t("users.fullName")}</Label><Input {...updateForm.register("fullName")} />{updateForm.formState.errors.fullName ? <p className="text-sm text-destructive">{t("users.validationRequired")}</p> : null}</div>
                <div className="space-y-2"><Label>{t("common.phone")}</Label><Input {...updateForm.register("phone")} />{updateForm.formState.errors.phone ? <p className="text-sm text-destructive">{t("users.validationPhone")}</p> : null}</div>
                <div className="space-y-2"><Label>{t("users.emailOptional")}</Label><Input {...updateForm.register("email")} />{updateForm.formState.errors.email ? <p className="text-sm text-destructive">{t("users.validationEmail")}</p> : null}</div>
                <div className="space-y-2"><Label>{t("common.role")}</Label><Select {...updateForm.register("role")}><option value="ADMIN">{roleLabel("ADMIN")}</option><option value="CASHIER">{roleLabel("CASHIER")}</option></Select></div>
                <div className="space-y-2"><Label>{t("common.status")}</Label><Select {...updateForm.register("status")}><option value="ACTIVE">{t("status.ACTIVE")}</option><option value="INACTIVE">{t("status.INACTIVE")}</option></Select></div>
              </form>
            </div>
            <div className="px-6 py-4 border-t shrink-0 bg-slate-50/50 flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setEditingItem(null)}>{t("common.cancel")}</Button>
              <Button type="submit" form="update-user-form">{t("common.save")}</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!passwordItem} onOpenChange={(open) => { if (!open) setPasswordItem(null); }}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{passwordItem ? t("users.changePasswordTitle", { email: passwordItem.employeeCode || passwordItem.email }) : ""}</DialogTitle>
            </DialogHeader>
            <form onSubmit={passwordForm.handleSubmit(submitPassword)} className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{t("users.newPassword")}</Label>
                <div className="flex gap-2">
                  <Input type={showChangePassword ? "text" : "password"} {...passwordForm.register("newPassword")} />
                  <Button type="button" variant="outline" size="icon" onClick={() => setShowChangePassword((value) => !value)} title={showChangePassword ? t("common.hide") : t("common.show")}>
                    {showChangePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                {passwordForm.formState.errors.newPassword ? <p className="text-sm text-destructive">{t("users.validationPassword")}</p> : null}
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setPasswordItem(null)}>{t("common.cancel")}</Button>
                <Button type="submit">{t("users.changePassword")}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {isLoading ? <LoadingState /> : null}
        {!isLoading && items.length === 0 ? <EmptyState /> : null}
        {!isLoading && items.length > 0 ? (
          <DataTable>
            <thead>
              <tr>
                <Th className="w-[80px] whitespace-nowrap">{t("common.no")}</Th>
                <Th>{t("users.employeeCode")}</Th>
                <Th>{t("users.fullName")}</Th>
                <Th>{t("common.phone")}</Th>
                <Th>{t("common.email")}</Th>
                <Th>{t("common.role")}</Th>
                <Th>{t("common.status")}</Th>
                <Th>{t("users.lastLoginAt")}</Th>
                <Th className="w-[96px] whitespace-nowrap text-right">{t("common.actions")}</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={item.id}>
                  <Td className="font-medium">{(page - 1) * PAGE_SIZE + index + 1}</Td>
                  <Td className="font-black text-slate-700">{item.employeeCode || t("common.notAvailable")}</Td>
                  <Td className="font-medium">{item.fullName}</Td>
                  <Td>{item.phone || t("common.notAvailable")}</Td>
                  <Td>{isInternalEmail(item.email) ? t("common.notAvailable") : item.email}</Td>
                  <Td>{roleLabel(item.role.name)}</Td>
                  <Td><StatusBadge status={item.status} /></Td>
                  <Td>{item.lastLoginAt ? formatDateTime(item.lastLoginAt) : t("common.notAvailable")}</Td>
                  <Td className="text-right">
                    {isRootAdmin(item) && !unlockedRootAdminIds.includes(item.id) ? (
                      <Button variant="outline" size="icon" className="h-9 w-9 min-w-9" title={t("common.actions")} onClick={() => setAdminPasswordPrompt({ isOpen: true, title: t("users.verifyRootAdminTitle"), action: "unlockMenu", item })}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    ) : (
                      <ActionMenu
                        label={t("common.actions")}
                        items={[
                          { label: t("common.update"), icon: <Edit className="h-4 w-4" />, onClick: () => openEdit(item) },
                          { label: t("users.changePassword"), icon: <KeyRound className="h-4 w-4" />, onClick: () => openPassword(item) },
                          ...(isRootAdmin(item) ? [] : [
                            ...(item.status === "ACTIVE" ? [
                              { label: t("users.lockAccount"), icon: <Lock className="h-4 w-4" />, onClick: () => handleLock(item) }
                            ] : [
                              { label: t("users.unlock"), icon: <RotateCcw className="h-4 w-4" />, onClick: () => handleRestore(item) }
                            ]),
                            { label: t("users.deleteAccount"), icon: <Trash2 className="h-4 w-4" />, onClick: () => handleDelete(item), variant: "destructive" as const }
                          ])
                        ]}
                      />
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : null}
        <PaginationControls pagination={pagination} onPageChange={setPage} />

        {adminPasswordPrompt.isOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
            <Card className="w-full max-w-sm border-none shadow-2xl">
              <CardHeader>
                <CardTitle>{adminPasswordPrompt.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {adminPasswordPrompt.action === "lock" && <p className="text-sm text-slate-500 mb-2">{t("users.confirmLockDescription")}</p>}
                {adminPasswordPrompt.action === "delete" && <p className="text-sm text-slate-500 mb-2">{t("users.confirmDeleteDescription")}</p>}
                {adminPasswordPrompt.action === "unlockMenu" && <p className="text-sm text-slate-500 mb-2">{t("users.verifyRootAdminDescription")}</p>}
                <div className="space-y-2">
                  <Label>{t("users.adminPasswordPlaceholder")}</Label>
                  <Input type="password" value={adminPasswordInput} onChange={(e) => setAdminPasswordInput(e.target.value)} autoFocus />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setAdminPasswordPrompt({ ...adminPasswordPrompt, isOpen: false })}>
                    {t("users.cancel")}
                  </Button>
                  <Button type="button" onClick={handleConfirmAdminPassword} disabled={!adminPasswordInput} variant={adminPasswordPrompt.action === "delete" ? "destructive" : "default"}>
                    {adminPasswordPrompt.action === "lock" ? t("users.lockAccount") : adminPasswordPrompt.action === "delete" ? t("users.deleteAccount") : t("users.confirm")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}


