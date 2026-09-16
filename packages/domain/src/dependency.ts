export type DependencyType =
  | 'dependency'
  | 'devDependency'
  | 'buildDependency'
  | 'optionalDependency'
  | 'peerDependency'
  | 'testDependency';

export interface DependencyItem {
  name: string;
  version?: string | undefined;
  ecosystem: string;
  manifest: string;
  type?: DependencyType | string | undefined;
  optional?: boolean | undefined;
  indirect?: boolean | undefined;
  metadata?: Record<string, unknown> | undefined;
}
