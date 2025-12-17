// src/components/admin/QuotaDashboard.tsx

/**
 * Admin dashboard for Firestore quota monitoring
 * 
 * Displays real-time quota usage, alerts, and projections
 * to help administrators monitor Firestore free tier limits.
 */

"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, CheckCircle, TrendingUp, RefreshCw, Database } from "lucide-react";

interface QuotaStats {
  date: string;
  reads: number;
  writes: number;
  deletes: number;
  timestamp: number;
}

interface QuotaAlert {
  type: "reads" | "writes";
  level: "warning" | "critical" | "danger";
  threshold: number;
  current: number;
  limit: number;
  message: string;
}

interface QuotaStatus {
  current: QuotaStats;
  limits: {
    reads: number;
    writes: number;
  };
  usage: {
    readsPercent: number;
    writesPercent: number;
  };
  alerts: QuotaAlert[];
  projection: {
    estimatedDailyReads: number;
    estimatedDailyWrites: number;
    willExceedReads: boolean;
    willExceedWrites: boolean;
  };
}

export default function QuotaDashboard() {
  const [status, setStatus] = useState<QuotaStatus | null>(null);
  const [history, setHistory] = useState<QuotaStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setRefreshing(true);
      setError(null);

      // Fetch current status
      const statusRes = await axios.get("/api/admin/quota");
      setStatus(statusRes.data.data);

      // Fetch 7-day history
      const historyRes = await axios.get("/api/admin/quota?action=history&days=7");
      setHistory(historyRes.data.data.history);

    } catch (err) {
      console.error("Failed to fetch quota data:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch quota data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!status) {
    return null;
  }

  const getAlertColor = (level: string) => {
    switch (level) {
      case "danger":
        return "destructive";
      case "critical":
        return "destructive";
      case "warning":
        return "default";
      default:
        return "secondary";
    }
  };

  const getProgressColor = (percent: number) => {
    if (percent >= 95) return "bg-red-600";
    if (percent >= 90) return "bg-orange-500";
    if (percent >= 80) return "bg-yellow-500";
    return "bg-green-600";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Firestore Quota Monitor</h2>
          <p className="text-sm text-muted-foreground">
            Track your daily Firestore usage against free tier limits
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchData}
          disabled={refreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Alerts */}
      {status.alerts.length > 0 && (
        <div className="space-y-2">
          {status.alerts.map((alert, idx) => (
            <Alert key={idx} variant={getAlertColor(alert.level) as any}>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="capitalize">
                {alert.level} - {alert.type}
              </AlertTitle>
              <AlertDescription>{alert.message}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* Current Usage Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Reads Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Read Operations</span>
              <Database className="h-5 w-5 text-muted-foreground" />
            </CardTitle>
            <CardDescription>
              {status.current.reads.toLocaleString()} / {status.limits.reads.toLocaleString()} today
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Usage</span>
                <span className="font-medium">{status.usage.readsPercent}%</span>
              </div>
              <Progress
                value={status.usage.readsPercent}
                className="h-2"
              />
            </div>

            {status.projection.willExceedReads && (
              <div className="flex items-center gap-2 text-sm text-orange-600">
                <TrendingUp className="h-4 w-4" />
                <span>
                  Projected: {status.projection.estimatedDailyReads.toLocaleString()} reads today
                </span>
              </div>
            )}

            <div className="pt-2 border-t">
              <div className="text-xs text-muted-foreground">
                Free tier: 50,000 reads/day
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Writes Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Write Operations</span>
              <Database className="h-5 w-5 text-muted-foreground" />
            </CardTitle>
            <CardDescription>
              {status.current.writes.toLocaleString()} / {status.limits.writes.toLocaleString()} today
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Usage</span>
                <span className="font-medium">{status.usage.writesPercent}%</span>
              </div>
              <Progress
                value={status.usage.writesPercent}
                className="h-2"
              />
            </div>

            {status.projection.willExceedWrites && (
              <div className="flex items-center gap-2 text-sm text-orange-600">
                <TrendingUp className="h-4 w-4" />
                <span>
                  Projected: {status.projection.estimatedDailyWrites.toLocaleString()} writes today
                </span>
              </div>
            )}

            <div className="pt-2 border-t">
              <div className="text-xs text-muted-foreground">
                Free tier: 20,000 writes/day
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 7-Day History Chart */}
      <Card>
        <CardHeader>
          <CardTitle>7-Day Usage History</CardTitle>
          <CardDescription>
            Daily read and write operations over the past week
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {history.map((day) => {
              const readsPercent = (day.reads / status.limits.reads) * 100;
              const writesPercent = (day.writes / status.limits.writes) * 100;

              return (
                <div key={day.date} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{day.date}</span>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>Reads: {day.reads.toLocaleString()}</span>
                      <span>Writes: {day.writes.toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {/* Reads bar */}
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Reads</div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div
                          className={`h-full ${getProgressColor(readsPercent)}`}
                          style={{ width: `${Math.min(readsPercent, 100)}%` }}
                        />
                      </div>
                      <div className="text-xs text-right">
                        {Math.round(readsPercent)}%
                      </div>
                    </div>

                    {/* Writes bar */}
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Writes</div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div
                          className={`h-full ${getProgressColor(writesPercent)}`}
                          style={{ width: `${Math.min(writesPercent, 100)}%` }}
                        />
                      </div>
                      <div className="text-xs text-right">
                        {Math.round(writesPercent)}%
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Status Footer */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {status.alerts.length === 0 ? (
                <>
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span className="text-sm font-medium">Quota usage is healthy</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-5 w-5 text-orange-600" />
                  <span className="text-sm font-medium">
                    {status.alerts.length} active alert{status.alerts.length > 1 ? "s" : ""}
                  </span>
                </>
              )}
            </div>

            <div className="text-xs text-muted-foreground">
              Last updated: {new Date(status.current.timestamp).toLocaleString()}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upgrade Notice */}
      {(status.usage.readsPercent > 80 || status.usage.writesPercent > 80) && (
        <Alert>
          <AlertTitle>Consider upgrading to Blaze plan</AlertTitle>
          <AlertDescription>
            Your Firestore usage is approaching free tier limits. 
            Upgrading to the Blaze (pay-as-you-go) plan will prevent service interruptions.
            <br />
            <a
              href="https://firebase.google.com/pricing"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline hover:no-underline mt-2 inline-block"
            >
              Learn more about Firebase pricing →
            </a>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
