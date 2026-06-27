"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/language-context";

type ErrorBoundaryText = {
  title: string;
  description: string;
  retry: string;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

class ErrorBoundaryInner extends Component<{ children: ReactNode; text: ErrorBoundaryText }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Dashboard runtime error:", error, errorInfo);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="rounded-lg border bg-card p-6 text-sm shadow-sm">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
          <div className="space-y-3">
            <div>
              <h2 className="font-semibold">{this.props.text.title}</h2>
              <p className="mt-1 text-muted-foreground">{this.props.text.description}</p>
            </div>
            <Button type="button" variant="outline" onClick={() => this.setState({ hasError: false })}>
              {this.props.text.retry}
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

export function ErrorBoundary({ children }: { children: ReactNode }) {
  const { t } = useLanguage();

  return (
    <ErrorBoundaryInner
      text={{
        title: t("errorBoundary.title"),
        description: t("errorBoundary.description"),
        retry: t("errorBoundary.retry"),
      }}
    >
      {children}
    </ErrorBoundaryInner>
  );
}
