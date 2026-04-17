export interface ApiCoverageOptions {
  rootDir?: string;
  srcDir?: string;
  testDir?: string;
  ignorePaths?: string[];
  outputFormat?: OutputFormat;
  debug?: boolean;
  threshold?: number;
}

export type OutputFormat =
  | 'text'
  | 'json'
  | 'html'
  | 'badge'
  | 'github'
  | 'github-plain'
  | 'github-table'
  | 'pretty';

export interface CoverageResult {
  className: string;
  methodName: string;
  covered: boolean;
}

export type ApiIndex = Map<string, Set<string>>;

export type MethodKey = `${string}.${string}`;
