export interface Task {
  id: number;
  title: string;
  done: boolean;
}

export interface TaskFilters {
  done?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
  sort?: "title";
}

export interface UpdateTaskInput {
  title?: string;
  done?: boolean;
}
