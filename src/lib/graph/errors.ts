export class DiagramSyntaxError extends Error {
  readonly line: number;
  readonly directive?: string;

  constructor(message: string, line: number, directive?: string) {
    super(`Graph line ${line}: ${message}`);
    this.name = 'DiagramSyntaxError';
    this.line = line;
    this.directive = directive;
  }
}

export class DiagramValidationError extends Error {
  readonly line?: number;

  constructor(message: string, line?: number) {
    super(line ? `Graph line ${line}: ${message}` : message);
    this.name = 'DiagramValidationError';
    this.line = line;
  }
}
