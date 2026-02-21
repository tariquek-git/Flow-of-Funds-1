import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getBezierPath, Position as RFPosition } from '@xyflow/react';
import {
  DrawingPath,
  Edge,
  EndPointType,
  EntityType,
  FlowDirection,
  Node,
  NodeShape,
  Position,
  ViewportTransform
} from '../types';
import { ENDPOINT_ICONS, ENTITY_ICONS, RAIL_COLORS } from '../constants';

interface FlowCanvasProps {
  nodes: Node[];
  edges: Edge[];
  drawings: DrawingPath[];
  selectedNodeIds: string[];
  selectedEdgeId: string | null;
  onSelectNodes: (ids: string[]) => void;
  onSelectEdge: (id: string | null) => void;
  onUpdateNodePosition: (id: string, pos: Position) => void;
  onUpdateNodeLabel: (id: string, label: string) => void;
  onBeginNodeMove: (ids: string[]) => void;
  onConnect: (sourceId: string, targetId: string, spIdx: number, tpIdx: number) => void;
  onAddNode: (type: EntityType, pos?: Position) => void;
  isDarkMode: boolean;
  showPorts: boolean;
  snapToGrid: boolean;
  activeTool: 'select' | 'draw' | 'text';
  onAddDrawing: (d: DrawingPath) => void;
  onOpenInspector: () => void;
  viewport: ViewportTransform;
  onViewportChange: (v: ViewportTransform) => void;
  onPointerWorldChange?: (position: Position | null) => void;
  showSwimlanes: boolean;
  swimlaneLabels: string[];
  onUpdateSwimlaneLabel: (index: number, label: string) => void;
  gridMode: 'none' | 'lines' | 'dots';
}

const NODE_WIDTH = 180;
const NODE_HEIGHT = 60;
const ANCHOR_SIZE = 16;
const SWIMLANE_HEIGHT = 300;
const GRID_SIZE = 40;
const GRID_EXTENT = 12000;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2.5;
const PORT_HIT_SIZE = 18;
const PORT_HALF = PORT_HIT_SIZE / 2;
const PORT_DOT_SIZE = 8;

type PendingConnection = { nodeId: string; portIdx: number };
type PendingConnectionResolution = {
  nextPending: PendingConnection | null;
  edgeToCreate?: { sourceId: string; targetId: string; sourcePortIdx: number; targetPortIdx: number };
};

const isEditableTarget = (target: EventTarget | null): target is HTMLElement => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tagName = target.tagName;
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
};

const getHandlePosition = (portIdx: number): RFPosition => {
  if (portIdx === 0) return RFPosition.Top;
  if (portIdx === 1) return RFPosition.Right;
  if (portIdx === 2) return RFPosition.Bottom;
  return RFPosition.Left;
};

const getPortPosition = (node: Node, portIdx: number) => {
  if (node.type === EntityType.ANCHOR) {
    return { x: node.position.x + ANCHOR_SIZE / 2, y: node.position.y + ANCHOR_SIZE / 2 };
  }

  const w = node.width || (node.shape === NodeShape.CIRCLE ? 80 : node.shape === NodeShape.DIAMOND ? 100 : NODE_WIDTH);
  const h = node.height || (node.shape === NodeShape.CIRCLE ? 80 : node.shape === NodeShape.DIAMOND ? 100 : NODE_HEIGHT);
  const x = node.position.x;
  const y = node.position.y;
  const cx = x + w / 2;
  const cy = y + h / 2;

  if (portIdx === 0) return { x: cx, y };
  if (portIdx === 1) return { x: x + w, y: cy };
  if (portIdx === 2) return { x: cx, y: y + h };
  return { x, y: cy };
};

const getClosestPortToPoint = (node: Node, point: Position) => {
  let bestIdx = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let idx = 0; idx < 4; idx += 1) {
    const port = getPortPosition(node, idx);
    const dx = port.x - point.x;
    const dy = port.y - point.y;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIdx = idx;
    }
  }
  return bestIdx;
};

const resolvePendingConnectionFromNodeClick = (
  nodes: Node[],
  pendingConnection: PendingConnection | null,
  nodeId: string,
  clickWorld: Position
): PendingConnectionResolution => {
  const clickedNode = nodes.find((candidate) => candidate.id === nodeId);
  if (!clickedNode) return { nextPending: null };

  if (!pendingConnection) {
    return {
      nextPending: { nodeId, portIdx: getClosestPortToPoint(clickedNode, clickWorld) }
    };
  }

  if (pendingConnection.nodeId === nodeId) {
    return { nextPending: null };
  }

  const sourceNode = nodes.find((candidate) => candidate.id === pendingConnection.nodeId);
  if (!sourceNode) {
    return { nextPending: null };
  }

  const sourcePortIdx = pendingConnection.portIdx;
  const sourcePortPosition = getPortPosition(sourceNode, sourcePortIdx);
  const targetPortIdx = getClosestPortToPoint(clickedNode, sourcePortPosition);

  return {
    nextPending: null,
    edgeToCreate: {
      sourceId: sourceNode.id,
      targetId: clickedNode.id,
      sourcePortIdx,
      targetPortIdx
    }
  };
};

const getNodeDimensions = (node: Node) => {
  if (node.type === EntityType.ANCHOR) {
    return { width: ANCHOR_SIZE, height: ANCHOR_SIZE };
  }
  return {
    width: node.width || (node.shape === NodeShape.CIRCLE ? 80 : node.shape === NodeShape.DIAMOND ? 100 : NODE_WIDTH),
    height: node.height || (node.shape === NodeShape.CIRCLE ? 80 : node.shape === NodeShape.DIAMOND ? 100 : NODE_HEIGHT)
  };
};

const DiagramEdge = React.memo(
  ({
    edge,
    source,
    target,
    isSelected,
    isDarkMode,
    onSelect,
    offsetIndex,
    totalEdges
  }: {
    edge: Edge;
    source: Node;
    target: Node;
    isSelected: boolean;
    isDarkMode: boolean;
    onSelect: (id: string) => void;
    offsetIndex: number;
    totalEdges: number;
  }) => {
    const start = getPortPosition(source, edge.sourcePortIdx);
    const end = getPortPosition(target, edge.targetPortIdx);

    const gap = 30;
    const centerOffset = ((totalEdges - 1) * gap) / 2;
    const offsetValue = offsetIndex * gap - centerOffset;

    const strokeColor = edge.isExceptionPath ? '#ef4444' : RAIL_COLORS[edge.rail] || '#94a3b8';
    let strokeDash = '';
    if (edge.style === 'dashed' || edge.isExceptionPath) strokeDash = '6,4';
    if (edge.style === 'dotted') strokeDash = '2,4';

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;

    const finalOffset = edge.curvature !== undefined ? edge.curvature : offsetValue;
    const shiftedStart = { x: start.x + nx * (finalOffset / 2), y: start.y + ny * (finalOffset / 2) };
    const shiftedEnd = { x: end.x + nx * (finalOffset / 2), y: end.y + ny * (finalOffset / 2) };
    const [pathD, labelX, labelY] = getBezierPath({
      sourceX: shiftedStart.x,
      sourceY: shiftedStart.y,
      sourcePosition: getHandlePosition(edge.sourcePortIdx),
      targetX: shiftedEnd.x,
      targetY: shiftedEnd.y,
      targetPosition: getHandlePosition(edge.targetPortIdx),
      curvature: 0.28
    });
    const midPoint = { x: labelX, y: labelY };
    const endAngle = Math.atan2(shiftedEnd.y - shiftedStart.y, shiftedEnd.x - shiftedStart.x) * (180 / Math.PI);

    return (
      <g className="group cursor-pointer transition-opacity duration-150" onClick={(e) => { e.stopPropagation(); onSelect(edge.id); }}>
        <path d={pathD} stroke="transparent" strokeWidth="16" fill="none" />
        <path
          d={pathD}
          stroke={strokeColor}
          strokeWidth={isSelected ? 3.6 : edge.thickness || 2}
          strokeDasharray={strokeDash}
          fill="none"
          className="transition-all duration-200"
        />

        {edge.sequence !== undefined && edge.sequence > 0 && (
          <g transform={`translate(${midPoint.x}, ${midPoint.y})`}>
            <circle r="9" fill={strokeColor} />
            <text textAnchor="middle" dy="3.5" fontSize="9" fontWeight="bold" fill="white">{edge.sequence}</text>
          </g>
        )}

        {edge.direction === FlowDirection.SETTLEMENT && (
          <circle cx={midPoint.x} cy={midPoint.y} r="5" fill={strokeColor} className="animate-ping opacity-50" />
        )}

        {edge.showArrowHead && (
          <g transform={`translate(${end.x}, ${end.y}) rotate(${endAngle})`}>
            <path d="M -10 -5 L 0 0 L -10 5 Z" fill={strokeColor} />
          </g>
        )}

        {edge.showMidArrow && (
          <g transform={`translate(${midPoint.x}, ${midPoint.y}) rotate(${endAngle})`}>
            <path d="M -8 -4 L 0 0 L -8 4 Z" fill={strokeColor} />
          </g>
        )}

        <foreignObject
          x={midPoint.x - 60}
          y={midPoint.y - (finalOffset > 0 ? 55 : -15)}
          width="120"
          height="40"
          className="pointer-events-none overflow-visible"
        >
          <div className="flex flex-col items-center justify-center">
            <div
              className={`rounded-md border px-2 py-0.5 text-[8px] font-bold uppercase tracking-tight whitespace-nowrap shadow-sm ${
                isDarkMode
                  ? 'border-slate-600 bg-slate-900/95 text-slate-100'
                  : 'border-slate-300 bg-white/95 text-slate-700'
              }`}
            >
              {edge.label || edge.rail}
              {edge.amount && <span className="ml-1 text-emerald-500">${edge.amount}</span>}
            </div>
            {edge.timing && <div className="text-[7px] font-bold uppercase opacity-60">{edge.timing}</div>}
          </div>
        </foreignObject>
      </g>
    );
  }
);

const DiagramNode = React.memo(
  ({
    node,
    isSelected,
    isDarkMode,
    onMouseDown,
    onClick,
    onPortClick,
    onLabelChange,
    showPorts,
    connectState,
    isConnectorHandleSelected
  }: {
    node: Node;
    isSelected: boolean;
    isDarkMode: boolean;
    onMouseDown: (e: React.MouseEvent, id: string) => void;
    onClick: (e: React.MouseEvent, id: string) => void;
    onPortClick: (e: React.MouseEvent, id: string, idx: number) => void;
    onLabelChange: (id: string, label: string) => void;
    showPorts: boolean;
    connectState: 'idle' | 'source' | 'candidate';
    isConnectorHandleSelected: boolean;
  }) => {
    const [isEditing, setIsEditing] = useState(false);
    const isDarkNode = ['#020617', '#ef4444', '#6366f1'].includes(node.color || '');
    const textColor = isDarkNode ? 'text-white' : isDarkMode ? 'text-slate-200' : 'text-slate-900';
    const isSourceNode = connectState === 'source';
    const isCandidateNode = connectState === 'candidate';

    if (node.type === EntityType.ANCHOR) {
      return (
        <div
          className={`absolute cursor-grab rounded-full border shadow-sm transition-transform hover:scale-125 active:cursor-grabbing ${
            isSourceNode
              ? 'border-emerald-300 bg-emerald-500 ring-2 ring-emerald-300/80'
              : isSelected
              ? 'bg-blue-500 ring-2 ring-blue-300'
              : isCandidateNode
                ? 'border-sky-400 bg-sky-100 ring-2 ring-sky-300/80 dark:bg-sky-500/20'
              : node.isConnectorHandle
                ? isConnectorHandleSelected
                  ? 'border-blue-500 bg-blue-300 ring-2 ring-blue-300/80 dark:bg-blue-400/40 dark:ring-blue-300/50'
                  : 'border-blue-400 bg-blue-100 dark:bg-blue-500/20'
                : isDarkMode
                  ? 'border-slate-500 bg-slate-500'
                  : 'border-slate-400 bg-slate-400'
          }`}
          style={{ left: node.position.x, top: node.position.y, width: ANCHOR_SIZE, height: ANCHOR_SIZE, zIndex: 100 }}
          onMouseDown={(e) => onMouseDown(e, node.id)}
        />
      );
    }

    return (
      <div
        className={`group absolute flex flex-col items-center justify-center rounded-xl border shadow-sm transition-all duration-150 ${
          isSourceNode
            ? 'scale-[1.02] border-emerald-500 ring-2 ring-emerald-300/80 shadow-lg'
            : isSelected
            ? 'scale-[1.02] border-blue-500 ring-2 ring-blue-400/70 shadow-lg'
            : isCandidateNode
              ? 'border-sky-400 ring-2 ring-sky-300/70'
            : isDarkMode
              ? 'border-slate-700 hover:border-slate-500'
              : 'border-slate-300 hover:border-slate-400'
        }`}
        style={{
          left: node.position.x,
          top: node.position.y,
          width: node.width || NODE_WIDTH,
          height: node.height || NODE_HEIGHT,
          backgroundColor: node.color || (isDarkMode ? '#1e293b' : 'white'),
          zIndex: isSelected ? 99 : 10
        }}
        data-node-id={node.id}
        data-node-label={node.label}
        onMouseDown={(e) => onMouseDown(e, node.id)}
        onClick={(e) => onClick(e, node.id)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setIsEditing(true);
        }}
      >
        <div className="flex h-full w-full flex-col items-center justify-center">
          <div
            className={`mb-1 flex h-8 w-8 items-center justify-center rounded-md border ${
              isDarkNode
                ? 'border-white/25 bg-white/12'
                : isDarkMode
                  ? 'border-slate-700 bg-black/20'
                  : 'border-slate-200 bg-slate-50'
            }`}
          >
            <span className={isDarkNode ? 'text-white' : ''}>
              {node.type === EntityType.END_POINT && node.endPointType
                ? ENDPOINT_ICONS[node.endPointType as EndPointType]
                : ENTITY_ICONS[node.type]}
            </span>
          </div>
          {isEditing ? (
            <input
              autoFocus
              className="w-full bg-transparent text-center text-xs font-semibold outline-none"
              defaultValue={node.label}
              onBlur={(e) => {
                onLabelChange(node.id, e.target.value);
                setIsEditing(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
              }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            />
          ) : (
            <span className={`px-2 text-center text-xs font-semibold leading-tight tracking-tight ${textColor}`}>
              {node.label}
            </span>
          )}
          {node.accountType && <span className="mt-0.5 text-[7px] font-bold uppercase opacity-65">{node.accountType}</span>}
        </div>

        {showPorts &&
          [0, 1, 2, 3].map((idx) => (
            <button
              key={idx}
              className={`absolute z-50 rounded-full border shadow-sm transition-all ${
                isSourceNode
                  ? 'border-emerald-200 bg-emerald-500/25'
                  : isCandidateNode
                    ? 'border-sky-200 bg-sky-500/25'
                    : 'border-white/80 bg-blue-500/20'
              } hover:scale-110 dark:border-slate-800`}
              style={
                idx === 0
                  ? { left: '50%', top: -PORT_HALF, transform: 'translateX(-50%)', width: PORT_HIT_SIZE, height: PORT_HIT_SIZE }
                  : idx === 1
                    ? { right: -PORT_HALF, top: '50%', transform: 'translateY(-50%)', width: PORT_HIT_SIZE, height: PORT_HIT_SIZE }
                    : idx === 2
                      ? { left: '50%', bottom: -PORT_HALF, transform: 'translateX(-50%)', width: PORT_HIT_SIZE, height: PORT_HIT_SIZE }
                      : { left: -PORT_HALF, top: '50%', transform: 'translateY(-50%)', width: PORT_HIT_SIZE, height: PORT_HIT_SIZE }
              }
              data-testid={`node-port-${node.id}-${idx}`}
              onMouseDown={(e) => { e.stopPropagation(); }}
              onClick={(e) => { e.stopPropagation(); onPortClick(e, node.id, idx); }}
            >
              <span
                className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                  isSourceNode ? 'bg-emerald-500' : 'bg-sky-500'
                }`}
                style={{ width: PORT_DOT_SIZE, height: PORT_DOT_SIZE }}
              />
            </button>
          ))}
      </div>
    );
  }
);

const FlowCanvas: React.FC<FlowCanvasProps> = ({
  nodes,
  edges,
  drawings,
  selectedNodeIds,
  selectedEdgeId,
  onSelectNodes,
  onSelectEdge,
  onUpdateNodePosition,
  onUpdateNodeLabel,
  onBeginNodeMove,
  onConnect,
  onAddNode,
  isDarkMode,
  showPorts,
  snapToGrid,
  activeTool,
  onAddDrawing,
  onOpenInspector,
  viewport,
  onViewportChange,
  onPointerWorldChange,
  showSwimlanes,
  swimlaneLabels,
  onUpdateSwimlaneLabel,
  gridMode
}) => {
  const [draggingNodes, setDraggingNodes] = useState<{
    ids: string[];
    pointerStart: Position;
    initialPositions: Record<string, Position>;
  } | null>(null);
  const [hasRecordedDragHistory, setHasRecordedDragHistory] = useState(false);
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);
  const [selectionMarquee, setSelectionMarquee] = useState<{
    start: Position;
    current: Position;
    baseSelection: string[];
  } | null>(null);
  const [snapGuide, setSnapGuide] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const [panningState, setPanningState] = useState<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [pointerWorld, setPointerWorld] = useState<Position | null>(null);
  const [editingLaneIdx, setEditingLaneIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const screenToWorld = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return { x: (clientX - rect.left - viewport.x) / viewport.zoom, y: (clientY - rect.top - viewport.y) / viewport.zoom };
  }, [viewport]);

  const edgeGroups = useMemo(() => {
    const groups: Record<string, string[]> = {};
    edges.forEach((e) => {
      const key = [e.sourceId, e.targetId].sort().join('-');
      if (!groups[key]) groups[key] = [];
      groups[key].push(e.id);
    });
    return groups;
  }, [edges]);

  const activeConnectorHandleIds = useMemo(() => {
    if (!selectedEdgeId) return [];
    const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId);
    if (!selectedEdge) return [];

    return [selectedEdge.sourceId, selectedEdge.targetId].filter((nodeId) => {
      const node = nodes.find((candidate) => candidate.id === nodeId);
      return !!node?.isConnectorHandle;
    });
  }, [selectedEdgeId, edges, nodes]);

  const visibleNodes = useMemo(
    () => nodes,
    [nodes]
  );

  const pendingSourceNode = useMemo(
    () => (pendingConnection ? nodes.find((node) => node.id === pendingConnection.nodeId) || null : null),
    [nodes, pendingConnection]
  );

  const pendingTargetCount = useMemo(() => {
    if (!pendingConnection) return 0;
    return visibleNodes.filter((node) => node.id !== pendingConnection.nodeId).length;
  }, [pendingConnection, visibleNodes]);

  const startPanning = useCallback(
    (clientX: number, clientY: number) => {
      setPendingConnection(null);
      setDraggingNodes(null);
      setHasRecordedDragHistory(false);
      setSelectionMarquee(null);
      setPanningState({
        startX: clientX,
        startY: clientY,
        baseX: viewport.x,
        baseY: viewport.y
      });
    },
    [viewport.x, viewport.y]
  );

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    const isMiddleMouse = e.button === 1;
    const isSpacePanGesture = e.button === 0 && isSpacePressed;
    if (isMiddleMouse || isSpacePanGesture) {
      e.preventDefault();
      startPanning(e.clientX, e.clientY);
      return;
    }
    if (e.button !== 0) return;

    const worldPos = screenToWorld(e.clientX, e.clientY);

    if (activeTool === 'text') {
      onAddNode(EntityType.TEXT_BOX, { x: worldPos.x - 90, y: worldPos.y - 30 });
      return;
    }

    if (activeTool === 'draw' && pendingConnection) {
      setPendingConnection(null);
      return;
    }

    if (activeTool === 'select') {
      const baseSelection = e.shiftKey ? selectedNodeIds : [];
      setSelectionMarquee({
        start: worldPos,
        current: worldPos,
        baseSelection
      });
      setPendingConnection(null);
      setDraggingNodes(null);
      setSnapGuide({ x: null, y: null });
      if (!e.shiftKey) {
        onSelectNodes([]);
        onSelectEdge(null);
      }
      return;
    }

    setPendingConnection(null);
    onSelectNodes([]);
    onSelectEdge(null);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const worldPos = screenToWorld(e.clientX, e.clientY);
    setPointerWorld(worldPos);
    onPointerWorldChange?.(worldPos);

    if (panningState) {
      const deltaX = e.clientX - panningState.startX;
      const deltaY = e.clientY - panningState.startY;
      onViewportChange({
        ...viewport,
        x: panningState.baseX + deltaX,
        y: panningState.baseY + deltaY
      });
      return;
    }

    if (selectionMarquee) {
      const nextMarquee = {
        ...selectionMarquee,
        current: worldPos
      };
      setSelectionMarquee(nextMarquee);

      const minX = Math.min(nextMarquee.start.x, nextMarquee.current.x);
      const minY = Math.min(nextMarquee.start.y, nextMarquee.current.y);
      const maxX = Math.max(nextMarquee.start.x, nextMarquee.current.x);
      const maxY = Math.max(nextMarquee.start.y, nextMarquee.current.y);

      const marqueeSelected = visibleNodes
        .filter((node) => {
          const { width, height } = getNodeDimensions(node);
          const nodeMinX = node.position.x;
          const nodeMaxX = node.position.x + width;
          const nodeMinY = node.position.y;
          const nodeMaxY = node.position.y + height;
          return nodeMaxX >= minX && nodeMinX <= maxX && nodeMaxY >= minY && nodeMinY <= maxY;
        })
        .map((node) => node.id);

      onSelectNodes(Array.from(new Set([...nextMarquee.baseSelection, ...marqueeSelected])));
      return;
    }

    if (draggingNodes) {
      if (!hasRecordedDragHistory) {
        onBeginNodeMove(draggingNodes.ids);
        setHasRecordedDragHistory(true);
      }

      const deltaX = worldPos.x - draggingNodes.pointerStart.x;
      const deltaY = worldPos.y - draggingNodes.pointerStart.y;

      let appliedDeltaX = deltaX;
      let appliedDeltaY = deltaY;

      if (snapToGrid && !e.altKey && draggingNodes.ids.length > 0) {
        const primaryId = draggingNodes.ids[0];
        const primaryInitial = draggingNodes.initialPositions[primaryId];
        if (primaryInitial) {
          const snappedPrimaryX = Math.round((primaryInitial.x + deltaX) / GRID_SIZE) * GRID_SIZE;
          const snappedPrimaryY = Math.round((primaryInitial.y + deltaY) / GRID_SIZE) * GRID_SIZE;
          appliedDeltaX = snappedPrimaryX - primaryInitial.x;
          appliedDeltaY = snappedPrimaryY - primaryInitial.y;
          setSnapGuide({ x: snappedPrimaryX, y: snappedPrimaryY });
        }
      } else {
        setSnapGuide({ x: null, y: null });
      }

      draggingNodes.ids.forEach((id) => {
        const initial = draggingNodes.initialPositions[id];
        if (!initial) return;
        onUpdateNodePosition(id, {
          x: initial.x + appliedDeltaX,
          y: initial.y + appliedDeltaY
        });
      });
      return;
    }

    setSnapGuide({ x: null, y: null });
  };

  const handleMouseUp = () => {
    setDraggingNodes(null);
    setHasRecordedDragHistory(false);
    setSelectionMarquee(null);
    setSnapGuide({ x: null, y: null });
    setPanningState(null);
    setPointerWorld(null);
    onPointerWorldChange?.(null);
  };

  const handlePortClick = (nodeId: string, portIdx: number) => {
    if (activeTool !== 'draw') return;

    if (!pendingConnection) {
      setPendingConnection({ nodeId, portIdx });
      return;
    }
    if (pendingConnection.nodeId !== nodeId) {
      onConnect(pendingConnection.nodeId, nodeId, pendingConnection.portIdx, portIdx);
    }
    setPendingConnection(null);
  };

  const handleNodeConnectClick = (e: React.MouseEvent, nodeId: string) => {
    if (activeTool !== 'draw') return;
    const world = screenToWorld(e.clientX, e.clientY);
    const resolution = resolvePendingConnectionFromNodeClick(nodes, pendingConnection, nodeId, world);
    if (resolution.edgeToCreate) {
      onConnect(
        resolution.edgeToCreate.sourceId,
        resolution.edgeToCreate.targetId,
        resolution.edgeToCreate.sourcePortIdx,
        resolution.edgeToCreate.targetPortIdx
      );
    }
    setPendingConnection(resolution.nextPending);
  };

  useEffect(() => {
    if (activeTool !== 'draw' && pendingConnection) {
      setPendingConnection(null);
    }
  }, [activeTool, pendingConnection]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' || event.key === ' ') {
        if (isEditableTarget(event.target)) return;
        event.preventDefault();
        setIsSpacePressed(true);
      }
      if (event.key === 'Escape') {
        setPendingConnection(null);
        setSelectionMarquee(null);
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space' || event.key === ' ') {
        setIsSpacePressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown, { passive: false });
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (!containerRef.current) return;
      const factor = e.deltaY > 0 ? 0.92 : 1.08;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, viewport.zoom * factor));
      const rect = containerRef.current.getBoundingClientRect();
      const world = screenToWorld(e.clientX, e.clientY);
      onViewportChange({
        zoom: newZoom,
        x: e.clientX - rect.left - world.x * newZoom,
        y: e.clientY - rect.top - world.y * newZoom
      });
      return;
    }

    if (e.deltaX !== 0 || e.deltaY !== 0) {
      e.preventDefault();
      onViewportChange({
        ...viewport,
        x: viewport.x - e.deltaX,
        y: viewport.y - e.deltaY
      });
    }
  };

  const swimlaneWidth = 5000;
  const gridPatternId = `canvas-grid-${gridMode}-${isDarkMode ? 'dark' : 'light'}`;
  const selectionRect = selectionMarquee
    ? {
        left: Math.min(selectionMarquee.start.x, selectionMarquee.current.x) * viewport.zoom + viewport.x,
        top: Math.min(selectionMarquee.start.y, selectionMarquee.current.y) * viewport.zoom + viewport.y,
        width:
          Math.abs(selectionMarquee.current.x - selectionMarquee.start.x) * viewport.zoom,
        height:
          Math.abs(selectionMarquee.current.y - selectionMarquee.start.y) * viewport.zoom
      }
    : null;

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full overflow-hidden ${
        panningState ? 'cursor-grabbing' : isSpacePressed ? 'cursor-grab' : activeTool === 'draw' ? 'cursor-crosshair' : 'cursor-default'
      } ${
        activeTool === 'draw'
          ? isDarkMode
            ? 'ring-1 ring-sky-300/35'
            : 'ring-1 ring-sky-500/35'
          : ''
      }`}
      style={{
        background: isDarkMode
          ? 'radial-gradient(1200px circle at 16% 0%, #2b3342 0%, #202327 45%, #171b22 100%)'
          : 'radial-gradient(900px circle at 14% 0%, #ffffff 0%, #f6f8ff 42%, #eef2f8 100%)'
      }}
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      {activeTool === 'draw' && (
        <div
          className={`pointer-events-none absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-2 rounded-lg border px-3 py-1.5 text-[11px] font-medium shadow-sm ${
            isDarkMode
              ? 'border-sky-300/35 bg-slate-900/90 text-sky-100'
              : 'border-sky-200 bg-white/95 text-sky-900'
          }`}
          role="status"
          aria-live="polite"
        >
          <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-sky-600 dark:text-sky-200">
            Connect mode
          </span>
          {pendingConnection ? (
            <>
              <span>
                Source: <strong>{pendingSourceNode?.label || 'Node'}</strong> - choose target ({pendingTargetCount} available)
              </span>
              <button
                type="button"
                data-testid="cancel-pending-connection"
                className={`pointer-events-auto rounded-md border px-2 py-0.5 text-[10px] font-semibold ${
                  isDarkMode
                    ? 'border-sky-400/40 bg-sky-500/20 text-sky-100 hover:bg-sky-500/30'
                    : 'border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100'
                }`}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  setPendingConnection(null);
                }}
                aria-label="Cancel pending connection"
                title="Cancel pending connection"
              >
                Cancel
              </button>
            </>
          ) : (
            <span>Click source node or port, then click target.</span>
          )}
        </div>
      )}

      <div className="absolute inset-0" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`, transformOrigin: '0 0' }}>
        <svg className="absolute top-0 left-0 w-full h-full overflow-visible">
          {(gridMode === 'lines' || gridMode === 'dots') && (
            <defs>
              {gridMode === 'lines' && (
                <pattern id={gridPatternId} width={GRID_SIZE} height={GRID_SIZE} patternUnits="userSpaceOnUse">
                  <path
                    d={`M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}`}
                    fill="none"
                    stroke={isDarkMode ? '#3a3f46' : '#d9dde5'}
                    strokeWidth="1"
                    opacity="0.85"
                  />
                </pattern>
              )}
              {gridMode === 'dots' && (
                <pattern id={gridPatternId} width={GRID_SIZE} height={GRID_SIZE} patternUnits="userSpaceOnUse">
                  <circle cx="1.5" cy="1.5" r="1.2" fill={isDarkMode ? '#4b5563' : '#b2bccb'} opacity="0.8" />
                </pattern>
              )}
            </defs>
          )}

          {gridMode !== 'none' && (
            <rect
              x={-GRID_EXTENT / 2}
              y={-GRID_EXTENT / 2}
              width={GRID_EXTENT}
              height={GRID_EXTENT}
              fill={`url(#${gridPatternId})`}
              className="pointer-events-none"
            />
          )}

          {showSwimlanes &&
            swimlaneLabels.map((laneLabel, idx) => {
              const y = idx * SWIMLANE_HEIGHT;
              return (
                <g key={`lane-${idx}`} className="pointer-events-none">
                  <rect
                    x={-1000}
                    y={y}
                    width={swimlaneWidth}
                    height={SWIMLANE_HEIGHT}
                    fill={idx % 2 === 0 ? (isDarkMode ? '#1f2933' : '#f2f4f7') : isDarkMode ? '#252a31' : '#ebeff4'}
                    opacity={0.72}
                  />
                  <line x1={-1000} y1={y} x2={swimlaneWidth} y2={y} stroke={isDarkMode ? '#374151' : '#d0d7e2'} strokeWidth="1" />
                  {editingLaneIdx === idx ? (
                    <foreignObject x={-960} y={y + 8} width="200" height="28">
                      <input
                        autoFocus
                        defaultValue={laneLabel}
                        className="w-full bg-transparent text-xs font-semibold outline-none"
                        onBlur={(e) => {
                          onUpdateSwimlaneLabel(idx, e.target.value);
                          setEditingLaneIdx(null);
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                      />
                    </foreignObject>
                  ) : (
                    <text
                      x={-960}
                      y={y + 24}
                      fontSize="12"
                      fill={isDarkMode ? '#cbd5e1' : '#667085'}
                      fontWeight="600"
                      style={{ cursor: 'pointer', pointerEvents: 'all' }}
                      onDoubleClick={() => setEditingLaneIdx(idx)}
                    >
                      {laneLabel?.trim() || `Swimlane ${idx + 1}`}
                    </text>
                  )}
                </g>
              );
            })}

          {(snapGuide.x !== null || snapGuide.y !== null) && (
            <g className="pointer-events-none">
              {snapGuide.x !== null && (
                <line
                  x1={snapGuide.x}
                  y1={-GRID_EXTENT / 2}
                  x2={snapGuide.x}
                  y2={GRID_EXTENT / 2}
                  stroke={isDarkMode ? '#60a5fa' : '#2563eb'}
                  strokeWidth={1}
                  strokeDasharray="4,4"
                  opacity={0.8}
                />
              )}
              {snapGuide.y !== null && (
                <line
                  x1={-GRID_EXTENT / 2}
                  y1={snapGuide.y}
                  x2={GRID_EXTENT / 2}
                  y2={snapGuide.y}
                  stroke={isDarkMode ? '#60a5fa' : '#2563eb'}
                  strokeWidth={1}
                  strokeDasharray="4,4"
                  opacity={0.8}
                />
              )}
            </g>
          )}

          {drawings.map((d) => (
            <polyline
              key={d.id}
              points={d.points.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={d.color}
              strokeWidth={d.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="pointer-events-none"
            />
          ))}

          {edges.map((edge) => {
            const source = nodes.find((n) => n.id === edge.sourceId);
            const target = nodes.find((n) => n.id === edge.targetId);
            if (!source || !target) return null;
            const key = [edge.sourceId, edge.targetId].sort().join('-');
            return (
              <DiagramEdge
                key={edge.id}
                edge={edge}
                source={source}
                target={target}
                isSelected={selectedEdgeId === edge.id}
                isDarkMode={isDarkMode}
                onSelect={(id) => { onSelectEdge(id); onOpenInspector(); }}
                offsetIndex={edgeGroups[key].indexOf(edge.id)}
                totalEdges={edgeGroups[key].length}
              />
            );
          })}

          {activeTool === 'draw' && pendingConnection && pointerWorld && (() => {
            const sourceNode = nodes.find((node) => node.id === pendingConnection.nodeId);
            if (!sourceNode) return null;
            const start = getPortPosition(sourceNode, pendingConnection.portIdx);
            const end = pointerWorld;
            const midX = (start.x + end.x) / 2;
            const midY = (start.y + end.y) / 2;
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const length = Math.sqrt(dx * dx + dy * dy) || 1;
            const nx = -dy / length;
            const ny = dx / length;
            const control = { x: midX + nx * 24, y: midY + ny * 24 };
            const previewPath = `M ${start.x} ${start.y} Q ${control.x} ${control.y}, ${end.x} ${end.y}`;

            return (
              <path
                d={previewPath}
                fill="none"
                stroke={isDarkMode ? '#60a5fa' : '#0d99ff'}
                strokeWidth={2}
                strokeDasharray="6,4"
                className="pointer-events-none"
              />
            );
          })()}
        </svg>

        {visibleNodes.map((node) => (
          <DiagramNode
            key={node.id}
            node={node}
            isSelected={selectedNodeIds.includes(node.id)}
            isDarkMode={isDarkMode}
            showPorts={showPorts && activeTool === 'draw'}
            connectState={
              activeTool === 'draw'
                ? pendingConnection?.nodeId === node.id
                  ? 'source'
                  : pendingConnection
                    ? 'candidate'
                    : 'idle'
                : 'idle'
            }
            isConnectorHandleSelected={activeConnectorHandleIds.includes(node.id)}
            onMouseDown={(e, id) => {
              if (e.button !== 0 || isSpacePressed) return;
              e.stopPropagation();
              if (activeTool !== 'select') return;
              if (e.shiftKey) {
                if (selectedNodeIds.includes(id)) {
                  onSelectNodes(selectedNodeIds.filter((candidate) => candidate !== id));
                } else {
                  onSelectNodes([...selectedNodeIds, id]);
                }
                onSelectEdge(null);
                return;
              }

              const dragIds =
                selectedNodeIds.includes(id) && selectedNodeIds.length > 0
                  ? selectedNodeIds
                  : [id];

              onSelectNodes(dragIds);
              onSelectEdge(null);
              const worldPos = screenToWorld(e.clientX, e.clientY);
              const initialPositions: Record<string, Position> = {};
              dragIds.forEach((nodeId) => {
                const currentNode = nodes.find((candidate) => candidate.id === nodeId);
                if (!currentNode) return;
                initialPositions[nodeId] = { ...currentNode.position };
              });
              setDraggingNodes({
                ids: dragIds,
                pointerStart: worldPos,
                initialPositions
              });
              setHasRecordedDragHistory(false);
            }}
            onClick={(e, id) => { e.stopPropagation(); handleNodeConnectClick(e, id); }}
            onPortClick={(_, id, idx) => handlePortClick(id, idx)}
            onLabelChange={onUpdateNodeLabel}
          />
        ))}
      </div>
      {selectionRect && (
        <div
          className={`pointer-events-none absolute rounded-md border ${
            isDarkMode
              ? 'border-blue-300/80 bg-blue-500/15'
              : 'border-blue-600/70 bg-blue-500/10'
          }`}
          style={selectionRect}
        />
      )}
    </div>
  );
};

export default FlowCanvas;
