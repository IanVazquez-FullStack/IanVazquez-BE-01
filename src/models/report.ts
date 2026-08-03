export type ReportStatus = "pending" | "completed" | "failed";

export interface Report {
  id: string;
  userId: string;
  status: ReportStatus;
  filePath: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface TaskMetrics {
  total: number;
  completed: number;
  byStatus: { status: "done" | "open"; count: number }[];
}

export interface CreateReportInput {
  id: string;
  userId: string;
}
