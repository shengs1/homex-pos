type ConfirmActionOptions = {
  title?: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

export function confirmAction(options: ConfirmActionOptions) {
  if (typeof document === "undefined") return Promise.resolve(false);

  return new Promise<boolean>((resolve) => {
    const root = document.createElement("div");
    root.className = "fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 px-4";

    const panel = document.createElement("div");
    panel.className = "w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl";

    const title = document.createElement("h2");
    title.className = "text-base font-bold text-slate-900";
    title.textContent = options.title || "Confirm";

    const description = document.createElement("p");
    description.className = "mt-2 text-sm leading-6 text-slate-600";
    description.textContent = options.description;

    const actions = document.createElement("div");
    actions.className = "mt-5 flex justify-end gap-2";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50";
    cancel.textContent = options.cancelLabel || "Cancel";

    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = options.destructive
      ? "rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
      : "rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800";
    confirm.textContent = options.confirmLabel || "Confirm";

    function close(value: boolean) {
      document.removeEventListener("keydown", onKeyDown);
      root.remove();
      resolve(value);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close(false);
    }

    cancel.addEventListener("click", () => close(false));
    confirm.addEventListener("click", () => close(true));
    root.addEventListener("click", (event) => {
      if (event.target === root) close(false);
    });
    document.addEventListener("keydown", onKeyDown);

    actions.append(cancel, confirm);
    panel.append(title, description, actions);
    root.append(panel);
    document.body.append(root);
    confirm.focus();
  });
}