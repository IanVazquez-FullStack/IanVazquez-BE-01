export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class UpstreamUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpstreamUnavailableError";
  }
}

export class ClassificationRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClassificationRejectedError";
  }
}
