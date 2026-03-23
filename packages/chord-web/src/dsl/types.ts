export interface NodeRef {
  readonly id: string;
  readonly type: string;
  connect(target: NodeRef, fromPort?: string, toPort?: string): NodeRef;
  modulate(param: string, source: NodeRef, depth?: number): void;
  set(param: string, value: number): NodeRef;
}

export interface PatchConfig {
  tempo?: number;
  key?: string;
  scale?: string;
  description?: string;
}

export interface PatchBuilder {
  readonly tempo: number;
  readonly key: string;
  readonly scale: string;
  scaleNote(octave: number, degree: number): number;
  tempoSync(division: string): number;
  expose(name: string, node: NodeRef, param: string, options?: ExposeOptions): void;
}

export interface ExposeOptions {
  min?: number;
  max?: number;
  default?: number;
  unit?: string;
  label?: string;
}

export interface PatchDefinition {
  name: string;
  config: PatchConfig;
  nodes: NodeDef[];
  connections: ConnectionDef[];
  exposedParams: ExposedParam[];
}

export interface NodeDef {
  id: string;
  type: string;
  params: Record<string, number>;
}

export interface ConnectionDef {
  fromId: string;
  fromPort: string;
  toId: string;
  toPort: string;
}

export interface ExposedParam {
  name: string;
  nodeId: string;
  param: string;
  options: ExposeOptions;
}
