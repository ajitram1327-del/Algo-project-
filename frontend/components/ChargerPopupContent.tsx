"use client";

import React, { useState, useEffect } from "react";
import { CheckCircle2, AlertTriangle, Clock, Send } from "lucide-react";
import { ChargerPOI } from "./Map";

interface ChargerPopupContentProps {
  charger: ChargerPOI;
  userId?: string;
}

export default function ChargerPopupContent({ charger, userId = "user_ajit_1327" }: ChargerPopupContentProps) {
  const [reportSummary, setReportSummary] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showReportForm, setShowReportForm] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<"operational" | "broken" | "slow">("operational");
  const [note, setNote] = useState("");
  const [submitFeedback, setSubmitFeedback] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadReports() {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/chargers/${charger.id}/reports`
        );
        if (res.ok && isMounted) {
          const data = await res.json();
          setReportSummary(data);
        }
      } catch {
        if (isMounted) {
          setReportSummary({
            has_reports: false,
            status_label: "No recent community reports",
          });
        }
      }
    }
    loadReports();
    return () => {
      isMounted = false;
    };
  }, [charger.id]);

  const handleSubmitReport = async () => {
    setIsSubmitting(true);
    setSubmitFeedback(null);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/chargers/report`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            station_id: charger.id,
            status: selectedStatus,
            connector_type: charger.connections?.[0] || "CCS2",
            note: note.trim() || undefined,
            user_id: userId,
          }),
        }
      );
      if (res.ok) {
        setSubmitFeedback("Report submitted!");
        setShowReportForm(false);
        setNote("");
        // Refresh summary
        const updated = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/chargers/${charger.id}/reports`
        );
        if (updated.ok) {
          setReportSummary(await updated.json());
        }
      } else {
        setSubmitFeedback("Submission failed");
      }
    } catch {
      setSubmitFeedback("Offline or error");
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setSubmitFeedback(null), 3000);
    }
  };

  return (
    <div className="font-sans text-xs p-1 min-w-[210px] max-w-[260px] space-y-1.5">
      {/* Title & Peak Power */}
      <div className="flex items-start justify-between gap-1 pb-1 border-b border-slate-100">
        <span className="font-bold text-slate-900 leading-tight line-clamp-1">{charger.name}</span>
        <span className="px-1.5 py-0.5 bg-sky-50 text-sky-700 font-mono font-bold text-[10px] rounded shrink-0">
          {charger.power_kw || 50} kW
        </span>
      </div>

      {/* Operator & Distance */}
      <div className="text-[11px] text-slate-500 space-y-0.5">
        {charger.operator && (
          <div>
            Operator: <span className="text-slate-700 font-medium">{charger.operator}</span>
          </div>
        )}
        {charger.distance_km !== undefined && (
          <div className="text-emerald-600 font-medium">
            {charger.distance_km} km away
          </div>
        )}
        {charger.connections && charger.connections.length > 0 && (
          <div className="text-slate-500 text-[10px] font-mono">
            Plugs: {charger.connections.join(", ")}
          </div>
        )}
      </div>

      {/* Community Reliability Status Badge */}
      <div className="pt-1 border-t border-slate-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1 text-[10px]">
            {reportSummary?.latest_status === "operational" ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
            ) : reportSummary?.latest_status === "broken" ? (
              <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />
            ) : (
              <Clock className="w-3 h-3 text-slate-400 shrink-0" />
            )}
            <span
              className={`font-semibold ${
                reportSummary?.latest_status === "operational"
                  ? "text-emerald-700"
                  : reportSummary?.latest_status === "broken"
                  ? "text-red-700"
                  : "text-slate-600"
              }`}
            >
              {reportSummary?.status_label || "Checking reports..."}
            </span>
          </div>

          {!showReportForm && (
            <button
              type="button"
              onClick={() => setShowReportForm(true)}
              className="text-[9px] font-bold text-blue-600 hover:text-blue-800 underline ml-1 cursor-pointer"
            >
              Report
            </button>
          )}
        </div>

        {submitFeedback && (
          <div className="text-[10px] font-bold text-emerald-600 pt-0.5">{submitFeedback}</div>
        )}
      </div>

      {/* Quick Report Submission Form */}
      {showReportForm && (
        <div className="mt-1.5 p-2 bg-slate-50 rounded-lg border border-slate-200 space-y-1.5 text-[10px]">
          <div className="font-bold text-slate-700">Submit Station Status</div>
          <div className="grid grid-cols-3 gap-1">
            {(["operational", "slow", "broken"] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setSelectedStatus(st)}
                className={`py-1 rounded font-bold capitalize transition cursor-pointer ${
                  selectedStatus === st
                    ? st === "operational"
                      ? "bg-emerald-600 text-white"
                      : st === "broken"
                      ? "bg-red-600 text-white"
                      : "bg-amber-600 text-white"
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <input
            type="text"
            placeholder="Optional note (e.g. plug #2 working)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-[10px] outline-none"
            maxLength={140}
          />

          <div className="flex items-center justify-end space-x-1 pt-0.5">
            <button
              type="button"
              onClick={() => setShowReportForm(false)}
              className="px-2 py-0.5 text-slate-500 hover:text-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmitReport}
              disabled={isSubmitting}
              className="px-2.5 py-0.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded flex items-center space-x-1"
            >
              <span>Submit</span>
              <Send className="w-2.5 h-2.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
