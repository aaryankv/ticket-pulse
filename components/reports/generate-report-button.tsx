"use client";

import { FileText, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function GenerateReportButton() {
  const [loading, setLoading] = useState(false);

  async function generateReport() {
    setLoading(true);
    const response = await fetch("/api/reports/weekly", { method: "POST" });
    setLoading(false);

    if (!response.ok) {
      toast.error("Weekly report generation failed");
      return;
    }

    toast.success("Weekly report generated");
  }

  return (
    <Button onClick={generateReport} disabled={loading}>
      {loading ? <Loader2 className="animate-spin" /> : <FileText />}
      Generate weekly report
    </Button>
  );
}
