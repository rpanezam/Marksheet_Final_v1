import { createRoot, type Root } from "react-dom/client";
import { useEffect, useState } from "react";

type ConfirmOpts = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
};

type PromptOpts = {
  title?: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  password?: boolean;
  confirmText?: string;
  cancelText?: string;
};

type AlertOpts = {
  title?: string;
  message: string;
  confirmText?: string;
};

let containerRoot: Root | null = null;
function ensureRoot(): Root {
  if (typeof document === "undefined") {
    throw new Error("dialog can only be used in the browser");
  }
  if (containerRoot) return containerRoot;
  const el = document.createElement("div");
  el.setAttribute("data-app-dialog-root", "");
  document.body.appendChild(el);
  containerRoot = createRoot(el);
  return containerRoot;
}

function render(node: React.ReactNode) {
  const root = ensureRoot();
  root.render(node);
}

function clear() {
  if (containerRoot) containerRoot.render(null);
}

export function confirmDialog(opts: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => {
    const handle = (v: boolean) => {
      clear();
      resolve(v);
    };
    render(<ConfirmModal opts={opts} onDone={handle} />);
  });
}

export function promptDialog(opts: PromptOpts): Promise<string | null> {
  return new Promise((resolve) => {
    const handle = (v: string | null) => {
      clear();
      resolve(v);
    };
    render(<PromptModal opts={opts} onDone={handle} />);
  });
}

export function alertDialog(opts: AlertOpts): Promise<void> {
  return new Promise((resolve) => {
    const handle = () => {
      clear();
      resolve();
    };
    render(<AlertModal opts={opts} onDone={handle} />);
  });
}

function Backdrop({ children, onCancel }: { children: React.ReactNode; onCancel: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-4 shadow-xl space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function ConfirmModal({ opts, onDone }: { opts: ConfirmOpts; onDone: (v: boolean) => void }) {
  return (
    <Backdrop onCancel={() => onDone(false)}>
      {opts.title && <h3 className="text-base font-bold text-foreground">{opts.title}</h3>}
      <p className="text-sm text-foreground/90 whitespace-pre-line">{opts.message}</p>
      <div className="flex gap-2 justify-end pt-1">
        <button
          onClick={() => onDone(false)}
          className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-secondary"
        >
          {opts.cancelText ?? "Cancel"}
        </button>
        <button
          autoFocus
          onClick={() => onDone(true)}
          className={
            opts.destructive
              ? "rounded-lg border border-destructive/40 bg-destructive px-3 py-1.5 text-sm font-semibold text-destructive-foreground hover:opacity-90"
              : "rounded-lg bg-[image:var(--gradient-primary)] px-3 py-1.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-primary)] hover:opacity-95"
          }
        >
          {opts.confirmText ?? "Confirm"}
        </button>
      </div>
    </Backdrop>
  );
}

function PromptModal({ opts, onDone }: { opts: PromptOpts; onDone: (v: string | null) => void }) {
  const [value, setValue] = useState(opts.defaultValue ?? "");
  return (
    <Backdrop onCancel={() => onDone(null)}>
      {opts.title && <h3 className="text-base font-bold text-foreground">{opts.title}</h3>}
      <p className="text-sm text-foreground/90 whitespace-pre-line">{opts.message}</p>
      <input
        autoFocus
        type={opts.password ? "password" : "text"}
        autoComplete={opts.password ? "new-password" : "off"}
        value={value}
        placeholder={opts.placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onDone(value);
        }}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
      />
      <div className="flex gap-2 justify-end pt-1">
        <button
          onClick={() => onDone(null)}
          className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-secondary"
        >
          {opts.cancelText ?? "Cancel"}
        </button>
        <button
          onClick={() => onDone(value)}
          className="rounded-lg bg-[image:var(--gradient-primary)] px-3 py-1.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-primary)] hover:opacity-95"
        >
          {opts.confirmText ?? "OK"}
        </button>
      </div>
    </Backdrop>
  );
}

function AlertModal({ opts, onDone }: { opts: AlertOpts; onDone: () => void }) {
  return (
    <Backdrop onCancel={onDone}>
      {opts.title && <h3 className="text-base font-bold text-foreground">{opts.title}</h3>}
      <p className="text-sm text-foreground/90 whitespace-pre-line">{opts.message}</p>
      <div className="flex justify-end pt-1">
        <button
          autoFocus
          onClick={onDone}
          className="rounded-lg bg-[image:var(--gradient-primary)] px-3 py-1.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-primary)] hover:opacity-95"
        >
          {opts.confirmText ?? "OK"}
        </button>
      </div>
    </Backdrop>
  );
}