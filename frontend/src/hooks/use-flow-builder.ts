"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import type { Connection, Edge, EdgeChange, NodeChange, XYPosition } from "@xyflow/react";
import { applyEdgeChanges, applyNodeChanges } from "@xyflow/react";
import { advanceRuntimeSession, createRuntimeSession } from "@/lib/flow-engine";
import { validateFlowDefinition } from "@/lib/validators/flow-validator";
import {
  autoLayoutFlow,
  buildTransitionMap,
  cloneFlowDefinition,
  createFlowEdge,
  createFlowNode,
  findStartNode,
  getMaxOutgoing,
  getNodeById,
  getOutgoingEdges,
} from "@/lib/flow-schema/utils";
import type {
  FlowBuilderEdge,
  FlowBuilderNode,
  FlowDefinition,
  FlowNodeData,
  FlowNodeType,
  FlowRuntimeSession,
} from "@/lib/flow-schema/types";

export function useFlowBuilder(value: FlowDefinition) {
  const [definition, setDefinition] = useState<FlowDefinition>(() => cloneFlowDefinition(value));
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(() => findStartNode(value)?.id || null);
  const [runtimeSession, setRuntimeSession] = useState<FlowRuntimeSession>(() =>
    advanceRuntimeSession(value, createRuntimeSession(value)),
  );

  useEffect(() => {
    setDefinition(cloneFlowDefinition(value));
  }, [value]);

  useEffect(() => {
    setRuntimeSession(advanceRuntimeSession(definition, createRuntimeSession(definition)));
  }, [definition]);

  const issues = useMemo(() => validateFlowDefinition(definition), [definition]);
  const transitionMap = useMemo(() => buildTransitionMap(definition), [definition]);

  function commit(next: FlowDefinition) {
    setDefinition(next);
  }

  function updateNode(nodeId: string, updater: (node: FlowBuilderNode) => FlowBuilderNode) {
    commit({
      ...definition,
      nodes: definition.nodes.map((node) => (node.id === nodeId ? updater(node) : node)),
    });
  }

  function removeNode(nodeId: string) {
    commit({
      ...definition,
      nodes: definition.nodes.filter((node) => node.id !== nodeId),
      edges: definition.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
    });
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(findStartNode(definition)?.id || null);
    }
  }

  function duplicateNode(nodeId: string) {
    const node = getNodeById(definition, nodeId);
    if (!node) return;
    const cloned = createFlowNode(node.type, { x: node.position.x + 60, y: node.position.y + 60 }, node.data.bindingKey);
    cloned.data = JSON.parse(JSON.stringify(node.data)) as FlowNodeData;
    cloned.data.title = `${node.data.title} cópia`;
    commit({
      ...definition,
      nodes: [...definition.nodes, cloned],
    });
    setSelectedNodeId(cloned.id);
  }

  function addNode(type: FlowNodeType, position?: XYPosition) {
    const nextNode = createFlowNode(type, position ? { x: position.x, y: position.y } : { x: 240, y: 120 });
    commit({
      ...definition,
      nodes: [...definition.nodes, nextNode],
    });
    setSelectedNodeId(nextNode.id);
  }

  function onNodesChange(changes: NodeChange[]) {
    const reactNodes = definition.nodes.map((node) => ({
      id: node.id,
      position: node.position,
      data: node.data,
      type: node.type,
    }));
    const nextNodes = applyNodeChanges(changes, reactNodes).map((node) => ({
      id: node.id,
      position: node.position,
      data: node.data as FlowNodeData,
      type: node.type as FlowNodeType,
    }));
    commit({ ...definition, nodes: nextNodes as FlowBuilderNode[] });
  }

  function onEdgesChange(changes: EdgeChange[]) {
    const draftEdges: Edge[] = definition.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle || undefined,
      label: edge.label,
    }));
    const nextEdges = applyEdgeChanges(changes, draftEdges).map((edge) => {
      const edgeLabel = (edge as Edge & { label?: unknown }).label;
      return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle || null,
      label: typeof edgeLabel === "string" ? edgeLabel : undefined,
      };
    });
    commit({ ...definition, edges: nextEdges as FlowBuilderEdge[] });
  }

  function onConnect(connection: Connection) {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    const sourceNode = getNodeById(definition, connection.source);
    if (!sourceNode) return;
    const maxOutgoing = getMaxOutgoing(sourceNode.type);
    if (getOutgoingEdges(definition, sourceNode.id).length >= maxOutgoing) return;
    if (maxOutgoing === 0) return;
    commit({
      ...definition,
      edges: [
        ...definition.edges,
        createFlowEdge(
          connection.source,
          connection.target,
          connection.sourceHandle || null,
          connection.sourceHandle || "seguir",
        ),
      ],
    });
  }

  function autoLayout() {
    startTransition(() => {
      commit(autoLayoutFlow(definition));
    });
  }

  function updateRuntimeWindow(within24hWindow: boolean) {
    commit({
      ...definition,
      runtime: { ...definition.runtime, within24hWindow },
    });
  }

  function updateLayout(partial: Partial<FlowDefinition["layout"]>) {
    commit({
      ...definition,
      layout: { ...definition.layout, ...partial },
    });
  }

  function selectNode(nodeId: string | null) {
    setSelectedNodeId(nodeId);
  }

  function updateDefinition(next: FlowDefinition) {
    commit(next);
  }

  function sendTestInput(input: { value: string; optionId?: string }) {
    setRuntimeSession((current) => advanceRuntimeSession(definition, current, input));
  }

  function resetTestRuntime() {
    setRuntimeSession(advanceRuntimeSession(definition, createRuntimeSession(definition)));
  }

  return {
    definition,
    issues,
    selectedNode: getNodeById(definition, selectedNodeId),
    selectedNodeId,
    transitionMap,
    runtimeSession,
    selectNode,
    updateDefinition,
    updateNode,
    removeNode,
    duplicateNode,
    addNode,
    onNodesChange,
    onEdgesChange,
    onConnect,
    autoLayout,
    updateLayout,
    updateRuntimeWindow,
    sendTestInput,
    resetTestRuntime,
  };
}
