export type FlowNodeType =
  | "start"
  | "message"
  | "question"
  | "buttons"
  | "list"
  | "condition"
  | "action"
  | "delay"
  | "human_handoff"
  | "template"
  | "end";

export type FlowCategory =
  | "entry"
  | "messaging"
  | "interactive"
  | "logic"
  | "operations"
  | "terminal";

export type FlowLayoutMode = "edit" | "master";
export type FlowModuleKey = "atendimento" | "recovery" | "shared";
export type FlowVariableScope = "shared" | "atendimento" | "recovery";
export type FlowChannelPolicy = "session" | "template" | "either";
export type FlowValidationSeverity = "error" | "warning" | "info";

export type FlowPosition = {
  x: number;
  y: number;
};

export type FlowVariableDefinition = {
  key: string;
  label: string;
  example: string;
  description: string;
  scope: FlowVariableScope;
  required: boolean;
};

export type FlowActionDefinition = {
  id: string;
  label: string;
  description: string;
  category: string;
};

export type FlowTemplateDefinition = {
  id: string;
  name: string;
  language?: string;
  category?: string;
  status?: string;
};

export type FlowChoiceOption = {
  id: string;
  label: string;
  value?: string;
  description?: string;
};

export type FlowConditionCase = {
  id: string;
  label: string;
  operator:
    | "exists"
    | "equals"
    | "not_equals"
    | "contains"
    | "greater_than"
    | "less_than";
  variableKey: string;
  value?: string;
};

export type FlowNodeBaseData = {
  title: string;
  summary: string;
  category: FlowCategory;
  bindingKey?: string | null;
  channelPolicy?: FlowChannelPolicy;
};

export type StartNodeData = FlowNodeBaseData & {
  type: "start";
  config: {
    triggerLabel: string;
  };
};

export type MessageNodeData = FlowNodeBaseData & {
  type: "message";
  config: {
    body: string;
    footer?: string;
  };
};

export type QuestionNodeData = FlowNodeBaseData & {
  type: "question";
  config: {
    prompt: string;
    variableKey: string;
    placeholder?: string;
    answerType: "text" | "number" | "email" | "date";
  };
};

export type ButtonsNodeData = FlowNodeBaseData & {
  type: "buttons";
  config: {
    body: string;
    footer?: string;
    buttons: FlowChoiceOption[];
  };
};

export type ListNodeData = FlowNodeBaseData & {
  type: "list";
  config: {
    body: string;
    buttonLabel: string;
    options: FlowChoiceOption[];
  };
};

export type ConditionNodeData = FlowNodeBaseData & {
  type: "condition";
  config: {
    description: string;
    cases: FlowConditionCase[];
    fallbackLabel: string;
  };
};

export type ActionNodeData = FlowNodeBaseData & {
  type: "action";
  config: {
    actionId: string;
    payload: string;
    note?: string;
  };
};

export type DelayNodeData = FlowNodeBaseData & {
  type: "delay";
  config: {
    amount: number;
    unit: "minutes" | "hours" | "days";
  };
};

export type HumanHandoffNodeData = FlowNodeBaseData & {
  type: "human_handoff";
  config: {
    message: string;
    queue: string;
    reason: string;
  };
};

export type TemplateNodeData = FlowNodeBaseData & {
  type: "template";
  config: {
    templateId: string;
    templateName: string;
    language: string;
    body: string;
  };
};

export type EndNodeData = FlowNodeBaseData & {
  type: "end";
  config: {
    closingMessage: string;
    result: "completed" | "blocked" | "paused" | "closed";
  };
};

export type FlowNodeData =
  | StartNodeData
  | MessageNodeData
  | QuestionNodeData
  | ButtonsNodeData
  | ListNodeData
  | ConditionNodeData
  | ActionNodeData
  | DelayNodeData
  | HumanHandoffNodeData
  | TemplateNodeData
  | EndNodeData;

export type FlowBuilderNode<TData extends FlowNodeData = FlowNodeData> = TData extends FlowNodeData
  ? {
      id: string;
      type: TData["type"];
      position: FlowPosition;
      data: TData;
    }
  : never;

export type FlowBuilderEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  label?: string;
};

export type FlowLayoutSettings = {
  mode: FlowLayoutMode;
  rowGap: number;
  columnGap: number;
  snapToGrid: boolean;
};

export type FlowRuntimeSettings = {
  within24hWindow: boolean;
  showValidationHints: boolean;
};

export type FlowDefinition = {
  version: 1;
  moduleKey: FlowModuleKey;
  name: string;
  description: string;
  variables: FlowVariableDefinition[];
  actions: FlowActionDefinition[];
  templates: FlowTemplateDefinition[];
  nodes: FlowBuilderNode[];
  edges: FlowBuilderEdge[];
  layout: FlowLayoutSettings;
  runtime: FlowRuntimeSettings;
};

export type FlowValidationIssue = {
  id: string;
  severity: FlowValidationSeverity;
  code: string;
  message: string;
  hint?: string;
  nodeId?: string;
  edgeId?: string;
};

export type FlowTransitionSummary = {
  nodeId: string;
  title: string;
  branches: Array<{
    edgeId: string;
    label: string;
    targetId: string;
  }>;
};

export type FlowRuntimeEvent =
  | {
      id: string;
      kind: "bot_message";
      nodeId: string;
      title: string;
      body: string;
      messageType: "message" | "template" | "question" | "buttons" | "list";
      options?: FlowChoiceOption[];
    }
  | {
      id: string;
      kind: "user_message";
      nodeId: string;
      title: string;
      body: string;
    }
  | {
      id: string;
      kind: "system_event";
      nodeId: string;
      title: string;
      body: string;
      tone: "neutral" | "warning" | "success";
    };

export type FlowRuntimeSession = {
  currentNodeId: string | null;
  waitingForNodeId: string | null;
  completed: boolean;
  paused: boolean;
  events: FlowRuntimeEvent[];
  variables: Record<string, string>;
  visitedNodeIds: string[];
};
