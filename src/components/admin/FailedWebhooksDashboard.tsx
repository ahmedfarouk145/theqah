// src/components/admin/FailedWebhooksDashboard.tsx

"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, RefreshCw, CheckCircle, XCircle, Clock, AlertTriangle } from "lucide-react";
import axios from "axios";

interface DeadLetterEntry {
  id: string;
  event: string;
  merchant: string | number | null;
  orderId: string | null;
  totalAttempts: number;
  failedAt: number;
  reviewedAt: number | null;
  resolution: "retried" | "ignored" | "manual_fix" | null;
  notes: string | null;
  storeUid: string | null;
  priority: "high" | "normal" | "low";
  errors: Array<{
    attempt: number;
    timestamp: number;
    error: string;
  }>;
}

interface DLQStatus {
  total: number;
  unreviewed: number;
  reviewed: number;
  byResolution: Record<string, number>;
  oldestEntry: number | null;
}

interface RetryQueueStatus {
  total: number;
  pending: number;
  scheduled: number;
  byPriority: Record<string, number>;
  oldestEntry: number | null;
}

export default function FailedWebhooksDashboard() {
  const [dlqStatus, setDlqStatus] = useState<DLQStatus | null>(null);
  const [retryStatus, setRetryStatus] = useState<RetryQueueStatus | null>(null);
  const [entries, setEntries] = useState<DeadLetterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<DeadLetterEntry | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const [dlqRes, retryRes, entriesRes] = await Promise.all([
        axios.get("/api/webhooks/retry?action=dlq_status"),
        axios.get("/api/webhooks/retry?action=status"),
        axios.get("/api/webhooks/failed?limit=50&onlyUnreviewed=true"),
      ]);

      setDlqStatus(dlqRes.data);
      setRetryStatus(retryRes.data);
      setEntries(entriesRes.data.entries || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
      console.error("Failed to fetch webhook data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRetry = async (dlqId: string) => {
    setActionLoading(dlqId);
    try {
      await axios.post("/api/webhooks/retry", { dlqId });
      await fetchData(); // Refresh data
      setSelectedEntry(null);
    } catch (err) {
      console.error("Failed to retry webhook:", err);
      alert("Failed to retry webhook");
    } finally {
      setActionLoading(null);
    }
  };

  const handleResolve = async (dlqId: string, resolution: "ignored" | "manual_fix", notes?: string) => {
    setActionLoading(dlqId);
    try {
      await axios.post("/api/webhooks/retry?action=resolve", { dlqId, resolution, notes });
      await fetchData(); // Refresh data
      setSelectedEntry(null);
    } catch (err) {
      console.error("Failed to resolve webhook:", err);
      alert("Failed to resolve webhook");
    } finally {
      setActionLoading(null);
    }
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatRelativeTime = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high": return "destructive";
      case "normal": return "default";
      case "low": return "secondary";
      default: return "default";
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Failed Webhooks</CardTitle>
          <CardDescription>Loading webhook data...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Failed Webhooks</CardTitle>
          <CardDescription className="text-destructive">
            <AlertCircle className="inline h-4 w-4 mr-1" />
            {error}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={fetchData} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Retry Queue Status */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Retry Queue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{retryStatus?.total || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {retryStatus?.pending || 0} pending, {retryStatus?.scheduled || 0} scheduled
            </p>
            {retryStatus?.oldestEntry && (
              <p className="text-xs text-amber-600 mt-2">
                <Clock className="inline h-3 w-3 mr-1" />
                Oldest: {formatRelativeTime(retryStatus.oldestEntry)}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Dead Letter Queue */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Dead Letter Queue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dlqStatus?.total || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {dlqStatus?.unreviewed || 0} unreviewed
            </p>
            {dlqStatus && dlqStatus.unreviewed > 10 && (
              <p className="text-xs text-destructive mt-2">
                <AlertTriangle className="inline h-3 w-3 mr-1" />
                Needs attention
              </p>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <Button onClick={fetchData} variant="outline" className="w-full">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Failed Webhooks List */}
      <Card>
        <CardHeader>
          <CardTitle>Unreviewed Failed Webhooks</CardTitle>
          <CardDescription>
            Webhooks that failed after {retryStatus?.total || 5} retry attempts
          </CardDescription>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-500" />
              <p>No failed webhooks! 🎉</p>
            </div>
          ) : (
            <div className="space-y-4">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="border rounded-lg p-4 hover:bg-accent/50 transition-colors cursor-pointer"
                  onClick={() => setSelectedEntry(entry)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant={getPriorityColor(entry.priority)}>
                          {entry.priority}
                        </Badge>
                        <code className="text-sm bg-muted px-2 py-1 rounded">
                          {entry.event}
                        </code>
                        {entry.orderId && (
                          <span className="text-xs text-muted-foreground">
                            Order: {entry.orderId}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <p>Failed: {formatRelativeTime(entry.failedAt)}</p>
                        <p>Attempts: {entry.totalAttempts}</p>
                        {entry.storeUid && (
                          <p className="text-xs mt-1">Store: {entry.storeUid}</p>
                        )}
                      </div>
                      {entry.errors.length > 0 && (
                        <div className="mt-2 text-xs text-destructive bg-destructive/10 p-2 rounded">
                          <code>{entry.errors[entry.errors.length - 1].error}</code>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 ml-4">
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRetry(entry.id);
                        }}
                        disabled={actionLoading === entry.id}
                      >
                        {actionLoading === entry.id ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <RefreshCw className="h-4 w-4 mr-1" />
                            Retry
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleResolve(entry.id, "ignored");
                        }}
                        disabled={actionLoading === entry.id}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Ignore
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected Entry Detail Modal */}
      {selectedEntry && (
        <Card className="border-2 border-primary">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Webhook Details</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedEntry(null)}
              >
                <XCircle className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">Event Information</h4>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-muted-foreground">Event:</dt>
                <dd><code>{selectedEntry.event}</code></dd>
                <dt className="text-muted-foreground">Order ID:</dt>
                <dd>{selectedEntry.orderId || "N/A"}</dd>
                <dt className="text-muted-foreground">Merchant:</dt>
                <dd>{selectedEntry.merchant || "N/A"}</dd>
                <dt className="text-muted-foreground">Store UID:</dt>
                <dd>{selectedEntry.storeUid || "N/A"}</dd>
                <dt className="text-muted-foreground">Failed At:</dt>
                <dd>{formatTimestamp(selectedEntry.failedAt)}</dd>
              </dl>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Error History</h4>
              <div className="space-y-2">
                {selectedEntry.errors.map((err, idx) => (
                  <div key={idx} className="bg-muted p-3 rounded text-sm">
                    <div className="flex justify-between mb-1">
                      <span className="font-medium">Attempt {err.attempt}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatTimestamp(err.timestamp)}
                      </span>
                    </div>
                    <code className="text-xs text-destructive">{err.error}</code>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => handleRetry(selectedEntry.id)}
                disabled={actionLoading === selectedEntry.id}
                className="flex-1"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry Webhook
              </Button>
              <Button
                variant="outline"
                onClick={() => handleResolve(selectedEntry.id, "manual_fix", "Manually fixed")}
                disabled={actionLoading === selectedEntry.id}
                className="flex-1"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Mark Fixed
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
