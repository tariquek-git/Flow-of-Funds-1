import React, { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AccountType,
  Edge,
  EntityType,
  FlowDirection,
  GridMode,
  Node,
  PaymentRail,
  ReconciliationMethod,
  TimingType
} from '../types';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  FileJson,
  Layers,
  ListOrdered,
  MousePointer2,
  Plus,
  Settings2,
  ShieldCheck,
  Sparkles,
  X
} from 'lucide-react';

export type InspectorTab = 'node' | 'edge' | 'canvas' | 'export';
type LintIssue = {
  id: 'missing-settlement' | 'missing-exception' | 'missing-reconciliation';
  message: string;
  actionLabel: string;
};

interface InspectorProps {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  onUpdateNode: (node: Node) => void;
  onUpdateEdge: (edge: Edge) => void;
  isDarkMode: boolean;
  onClose: () => void;
  showSwimlanes: boolean;
  onToggleSwimlanes: () => void;
  swimlaneLabels: string[];
  onAddSwimlane: () => void;
  onRemoveSwimlane: (index: number) => void;
  onUpdateSwimlaneLabel: (index: number, label: string) => void;
  gridMode: GridMode;
  onSetGridMode: (mode: GridMode) => void;
  snapToGrid: boolean;
  onToggleSnapToGrid: () => void;
  showPorts: boolean;
  onTogglePorts: () => void;
  hasRecoverySnapshot: boolean;
  onRestoreRecovery: () => void;
  onResetCanvas: () => void;
  onImportDiagram: () => void;
  onExportDiagram: () => void;
  lintIssues?: LintIssue[];
  onRunLintAction?: (issueId: LintIssue['id']) => void;
  activeTabRequest?: InspectorTab | null;
}

const PRESET_COLORS = [
  { hex: '#020617', label: 'Dark' },
  { hex: '#ffffff', label: 'Light' },
  { hex: '#ef4444', label: 'Danger' },
  { hex: '#10b981', label: 'Success' },
  { hex: '#6366f1', label: 'Indigo' }
];

const nodeSchema = z.object({
  label: z.string().trim().min(1, 'Label is required').max(120),
  type: z.nativeEnum(EntityType),
  accountType: z.union([z.nativeEnum(AccountType), z.literal('')]).optional(),
  description: z.string().max(2000).optional(),
  color: z.string().optional()
});

const edgeSchema = z.object({
  label: z.string().trim().max(120),
  rail: z.nativeEnum(PaymentRail),
  direction: z.nativeEnum(FlowDirection),
  timing: z.string().optional(),
  amount: z.string().optional(),
  currency: z.string().optional(),
  sequence: z.number().int().nonnegative(),
  isFX: z.boolean(),
  isExceptionPath: z.boolean(),
  fxPair: z.string().optional(),
  recoMethod: z.nativeEnum(ReconciliationMethod),
  dataSchema: z.string().optional(),
  description: z.string().optional()
});

type NodeFormValues = z.infer<typeof nodeSchema>;
type EdgeFormValues = z.infer<typeof edgeSchema>;

const FIELD_HELPERS: Record<string, string> = {
  direction: 'Use Push/Pull/Settlement to describe how value or messages move.',
  rail: 'Select the operating network or rail for this connection.',
  timing: 'Capture settlement cadence or SLA window for this flow.'
};

const PanelSection: React.FC<{ title: string; icon: React.ReactNode; children?: React.ReactNode }> = ({
  title,
  icon,
  children
}) => (
  <section className="mb-4 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
    <div className="mb-3 flex items-center gap-2 border-b border-slate-200 px-1 pb-1.5 dark:border-slate-700">
      <div className="text-blue-600 dark:text-blue-300">{icon}</div>
      <h3 className="ui-section-title">{title}</h3>
    </div>
    <div className="space-y-3 px-1">{children}</div>
  </section>
);

const Field: React.FC<{ label: string; helper?: string; children?: React.ReactNode }> = ({ label, helper, children }) => (
  <div className="flex flex-col gap-1">
    <label className="ml-0.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400">
      {label}
    </label>
    {children}
    {helper ? <span className="ml-0.5 text-[10px] text-slate-500 dark:text-slate-400">{helper}</span> : null}
  </div>
);

const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input
    {...props}
    className="ui-input h-9 w-full px-3 text-xs font-medium outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
  />
);

const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = (props) => (
  <select
    {...props}
    className="ui-input h-9 w-full cursor-pointer appearance-none px-3 text-xs font-medium outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
  >
    {props.children}
  </select>
);

const tabMeta: Array<{ id: InspectorTab; label: string }> = [
  { id: 'node', label: 'Node' },
  { id: 'edge', label: 'Edge' },
  { id: 'canvas', label: 'Canvas' },
  { id: 'export', label: 'Export' }
];

const nodeToFormValues = (node: Node | undefined): NodeFormValues => ({
  label: node?.label || '',
  type: node?.type || EntityType.PROCESSOR,
  accountType: node?.accountType || '',
  description: node?.description || '',
  color: node?.color || ''
});

const edgeToFormValues = (edge: Edge | undefined): EdgeFormValues => ({
  label: edge?.label || '',
  rail: edge?.rail || PaymentRail.BLANK,
  direction: edge?.direction || FlowDirection.PUSH,
  timing: edge?.timing || '',
  amount: edge?.amount || '',
  currency: edge?.currency || '',
  sequence: edge?.sequence || 0,
  isFX: !!edge?.isFX,
  isExceptionPath: !!edge?.isExceptionPath,
  fxPair: edge?.fxPair || '',
  recoMethod: edge?.recoMethod || ReconciliationMethod.NONE,
  dataSchema: edge?.dataSchema || '',
  description: edge?.description || ''
});

const Inspector: React.FC<InspectorProps> = ({
  nodes,
  edges,
  selectedNodeId,
  selectedEdgeId,
  onUpdateNode,
  onUpdateEdge,
  isDarkMode,
  onClose,
  showSwimlanes,
  onToggleSwimlanes,
  swimlaneLabels,
  onAddSwimlane,
  onRemoveSwimlane,
  onUpdateSwimlaneLabel,
  gridMode,
  onSetGridMode,
  snapToGrid,
  onToggleSnapToGrid,
  showPorts,
  onTogglePorts,
  hasRecoverySnapshot,
  onRestoreRecovery,
  onResetCanvas,
  onImportDiagram,
  onExportDiagram,
  lintIssues = [],
  onRunLintAction,
  activeTabRequest
}) => {
  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId),
    [nodes, selectedNodeId]
  );
  const selectedEdge = useMemo(
    () => edges.find((edge) => edge.id === selectedEdgeId),
    [edges, selectedEdgeId]
  );

  const [activeTab, setActiveTab] = useState<InspectorTab>('canvas');

  const nodeForm = useForm<NodeFormValues>({
    resolver: zodResolver(nodeSchema),
    mode: 'onChange',
    defaultValues: nodeToFormValues(selectedNode)
  });
  const edgeForm = useForm<EdgeFormValues>({
    resolver: zodResolver(edgeSchema),
    mode: 'onChange',
    defaultValues: edgeToFormValues(selectedEdge)
  });

  const nodeValues = useWatch({ control: nodeForm.control });
  const edgeValues = useWatch({ control: edgeForm.control });
  const selectedNodeColor = nodeForm.watch('color') || '';
  const edgeIsFX = edgeForm.watch('isFX');
  const edgeIsExceptionPath = edgeForm.watch('isExceptionPath');

  useEffect(() => {
    if (activeTabRequest) {
      setActiveTab(activeTabRequest);
      return;
    }

    if (selectedEdgeId) {
      setActiveTab('edge');
    } else if (selectedNodeId) {
      setActiveTab('node');
    }
  }, [selectedNodeId, selectedEdgeId, activeTabRequest]);

  useEffect(() => {
    if (!selectedNodeId && !selectedEdgeId && activeTab !== 'canvas' && activeTab !== 'export') {
      setActiveTab('canvas');
    }
  }, [selectedNodeId, selectedEdgeId, activeTab]);

  useEffect(() => {
    nodeForm.reset(nodeToFormValues(selectedNode));
  }, [selectedNode?.id, nodeForm]);

  useEffect(() => {
    edgeForm.reset(edgeToFormValues(selectedEdge));
  }, [selectedEdge?.id, edgeForm]);

  useEffect(() => {
    if (!selectedNode) return;
    const parsed = nodeSchema.safeParse(nodeValues);
    if (!parsed.success) return;

    const next = parsed.data;
    const nextNode: Node = {
      ...selectedNode,
      label: next.label,
      type: next.type,
      accountType: next.accountType || undefined,
      description: next.description || undefined,
      color: next.color || undefined
    };

    const hasChanged =
      selectedNode.label !== nextNode.label ||
      selectedNode.type !== nextNode.type ||
      selectedNode.accountType !== nextNode.accountType ||
      selectedNode.description !== nextNode.description ||
      selectedNode.color !== nextNode.color;

    if (hasChanged) onUpdateNode(nextNode);
  }, [nodeValues, selectedNode, onUpdateNode]);

  useEffect(() => {
    if (!selectedEdge) return;
    const parsed = edgeSchema.safeParse(edgeValues);
    if (!parsed.success) return;

    const next = parsed.data;
    const nextEdge: Edge = {
      ...selectedEdge,
      label: next.label,
      rail: next.rail,
      direction: next.direction,
      timing: next.timing || undefined,
      amount: next.amount || undefined,
      currency: next.currency || undefined,
      sequence: Number.isFinite(next.sequence) ? next.sequence : 0,
      isFX: next.isFX,
      isExceptionPath: next.isExceptionPath,
      fxPair: next.fxPair || undefined,
      recoMethod: next.recoMethod,
      dataSchema: next.dataSchema || undefined,
      description: next.description || undefined
    };

    const hasChanged =
      selectedEdge.label !== nextEdge.label ||
      selectedEdge.rail !== nextEdge.rail ||
      selectedEdge.direction !== nextEdge.direction ||
      selectedEdge.timing !== nextEdge.timing ||
      selectedEdge.amount !== nextEdge.amount ||
      selectedEdge.currency !== nextEdge.currency ||
      (selectedEdge.sequence || 0) !== (nextEdge.sequence || 0) ||
      selectedEdge.isFX !== nextEdge.isFX ||
      !!selectedEdge.isExceptionPath !== !!nextEdge.isExceptionPath ||
      selectedEdge.fxPair !== nextEdge.fxPair ||
      (selectedEdge.recoMethod || ReconciliationMethod.NONE) !==
        (nextEdge.recoMethod || ReconciliationMethod.NONE) ||
      selectedEdge.dataSchema !== nextEdge.dataSchema ||
      selectedEdge.description !== nextEdge.description;

    if (hasChanged) onUpdateEdge(nextEdge);
  }, [edgeValues, selectedEdge, onUpdateEdge]);

  return (
    <div className={`flex h-full flex-col ${isDarkMode ? 'bg-slate-900' : 'bg-white'}`}>
      <div
        className={`sticky top-0 z-10 border-b px-3 py-2 backdrop-blur ${
          isDarkMode ? 'border-slate-700 bg-slate-900/95' : 'border-slate-200 bg-white/95'
        }`}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-blue-500" />
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] dark:text-slate-200">Inspector</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-slate-300 p-1.5 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-700"
            aria-label="Close inspector"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-4 gap-1 rounded-md border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800">
          {tabMeta.map((tab) => {
            const disabled = (tab.id === 'node' && !selectedNode) || (tab.id === 'edge' && !selectedEdge);
            return (
              <button
                key={tab.id}
                type="button"
                disabled={disabled}
                onClick={() => setActiveTab(tab.id)}
                className={`rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors ${
                  activeTab === tab.id
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-500 hover:bg-white dark:text-slate-400 dark:hover:bg-slate-700'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto p-3">
        {activeTab === 'node' && !selectedNode ? (
          <div className="flex h-full min-h-56 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 p-6 text-center opacity-60">
            <MousePointer2 className="mb-3 h-10 w-10 text-slate-400" />
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Select a node to edit</p>
          </div>
        ) : null}

        {activeTab === 'node' && selectedNode ? (
          <>
            <PanelSection title="Node" icon={<Sparkles className="h-3.5 w-3.5" />}>
              <Field label="Node Label">
                <Input {...nodeForm.register('label')} />
              </Field>
              <Field label="Archetype">
                <Select {...nodeForm.register('type')}>
                  {Object.values(EntityType).map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Color">
                <div className="flex gap-2 pt-1">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color.hex}
                      onClick={() =>
                        nodeForm.setValue('color', color.hex, {
                          shouldDirty: true,
                          shouldValidate: true
                        })
                      }
                      title={color.label}
                      className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
                        selectedNodeColor === color.hex ? 'scale-110 border-blue-500 shadow-lg' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: color.hex }}
                    />
                  ))}
                </div>
              </Field>
            </PanelSection>

            <PanelSection title="Attributes" icon={<ShieldCheck className="h-3.5 w-3.5" />}>
              <Field label="Account Type">
                <Select {...nodeForm.register('accountType')}>
                  <option value="">None / Off-Ledger</option>
                  {Object.values(AccountType).map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Notes">
                <textarea
                  {...nodeForm.register('description')}
                  className="ui-input h-24 w-full resize-none p-3 text-xs outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  placeholder="Optional notes for this node..."
                />
              </Field>
            </PanelSection>
          </>
        ) : null}

        {activeTab === 'edge' && !selectedEdge ? (
          <div className="flex h-full min-h-56 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 p-6 text-center opacity-60">
            <MousePointer2 className="mb-3 h-10 w-10 text-slate-400" />
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Select an edge to edit</p>
          </div>
        ) : null}

        {activeTab === 'edge' && selectedEdge ? (
          <>
            <PanelSection title="Edge" icon={<ListOrdered className="h-3.5 w-3.5" />}>
              <Field label="Label">
                <Input {...edgeForm.register('label')} />
              </Field>
              <Field label="Rail" helper={FIELD_HELPERS.rail}>
                <Select {...edgeForm.register('rail')}>
                  <option value="">Generic Path</option>
                  {Object.values(PaymentRail)
                    .filter((rail) => rail !== '')
                    .map((rail) => (
                      <option key={rail} value={rail}>
                        {rail}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="Direction" helper={FIELD_HELPERS.direction}>
                <Select {...edgeForm.register('direction')}>
                  {Object.values(FlowDirection).map((direction) => (
                    <option key={direction} value={direction}>
                      {direction}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Settlement Timing" helper={FIELD_HELPERS.timing}>
                <Select {...edgeForm.register('timing')}>
                  <option value="">Undetermined</option>
                  {Object.values(TimingType).map((timing) => (
                    <option key={timing} value={timing}>
                      {timing}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Amount">
                  <Input {...edgeForm.register('amount')} placeholder="0.00" />
                </Field>
                <Field label="Currency">
                  <Input {...edgeForm.register('currency')} placeholder="USD" />
                </Field>
              </div>
            </PanelSection>

            <PanelSection title="Advanced" icon={<FileJson className="h-3.5 w-3.5" />}>
              <Field label="Sequence">
                <Input type="number" min="0" {...edgeForm.register('sequence', { valueAsNumber: true })} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => edgeForm.setValue('isFX', !edgeIsFX, { shouldDirty: true, shouldValidate: true })}
                  className={`rounded-md border px-3 py-2 text-[10px] font-semibold uppercase transition-all ${
                    edgeIsFX
                      ? 'border-emerald-600 bg-emerald-500 text-white shadow-md'
                      : 'border-slate-300 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800'
                  }`}
                >
                  FX
                </button>
                <button
                  onClick={() =>
                    edgeForm.setValue('isExceptionPath', !edgeIsExceptionPath, {
                      shouldDirty: true,
                      shouldValidate: true
                    })
                  }
                  className={`rounded-md border px-3 py-2 text-[10px] font-semibold uppercase transition-all ${
                    edgeIsExceptionPath
                      ? 'bg-rose-500 border-rose-600 text-white shadow-md'
                      : 'border-slate-300 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800'
                  }`}
                >
                  Exception
                </button>
              </div>
              {edgeIsFX ? (
                <Field label="FX Pair">
                  <Input {...edgeForm.register('fxPair')} placeholder="USD/EUR" />
                </Field>
              ) : null}
              <Field label="Reconciliation">
                <Select {...edgeForm.register('recoMethod')}>
                  {Object.values(ReconciliationMethod).map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Data Schema">
                <Input {...edgeForm.register('dataSchema')} placeholder="e.g. ISO 20022" />
              </Field>
              <Field label="Notes">
                <textarea
                  {...edgeForm.register('description')}
                  className="ui-input h-24 w-full resize-none p-3 text-xs outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  placeholder="Settlement rules, risk, data exchanged..."
                />
              </Field>
            </PanelSection>
          </>
        ) : null}

        {activeTab === 'canvas' ? (
          <>
            <PanelSection title="Flow Checks" icon={<ShieldCheck className="h-3.5 w-3.5" />}>
              {lintIssues.length === 0 ? (
                <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700 dark:border-emerald-700/40 dark:bg-emerald-900/20 dark:text-emerald-300">
                  No critical flow-structure warnings detected.
                </p>
              ) : (
                <div className="space-y-2">
                  {lintIssues.map((issue) => (
                    <div
                      key={issue.id}
                      className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-[11px] dark:border-amber-700/50 dark:bg-amber-900/20"
                    >
                      <p className="text-amber-900 dark:text-amber-200">{issue.message}</p>
                      {onRunLintAction ? (
                        <button
                          type="button"
                          onClick={() => onRunLintAction(issue.id)}
                          className="mt-1.5 rounded-md border border-amber-400 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-800 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-200 dark:hover:bg-amber-900/40"
                        >
                          {issue.actionLabel}
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </PanelSection>

            <PanelSection title="Canvas Utilities" icon={<Settings2 className="h-3.5 w-3.5" />}>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={onToggleSnapToGrid}
                  aria-pressed={snapToGrid}
                  className={`rounded-md border px-3 py-2 text-[10px] font-semibold uppercase transition-all ${
                    snapToGrid
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {snapToGrid ? 'Snap On' : 'Snap Off'}
                </button>
                <button
                  type="button"
                  onClick={onTogglePorts}
                  aria-pressed={showPorts}
                  className={`rounded-md border px-3 py-2 text-[10px] font-semibold uppercase transition-all ${
                    showPorts
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {showPorts ? 'Ports On' : 'Ports Off'}
                </button>
              </div>
              <Field label="Grid Mode">
                <div className="grid grid-cols-3 gap-1">
                  {(['none', 'lines', 'dots'] as GridMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => onSetGridMode(mode)}
                      aria-pressed={gridMode === mode}
                      className={`rounded-md border px-2 py-1.5 text-[10px] font-semibold uppercase ${
                        gridMode === mode
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </Field>
            </PanelSection>

            <PanelSection title="Swimlanes" icon={<Layers className="h-3.5 w-3.5" />}>
              <button
                type="button"
                onClick={onToggleSwimlanes}
                aria-pressed={showSwimlanes}
                className={`mb-2 rounded-md border px-3 py-2 text-[10px] font-semibold uppercase ${
                  showSwimlanes
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {showSwimlanes ? 'Swimlanes: On' : 'Swimlanes: Off'}
              </button>

              {showSwimlanes ? (
                <div className="space-y-2">
                  {swimlaneLabels.map((label, idx) => (
                    <div key={`swimlane-${idx}`} className="flex items-center gap-2">
                      <span className="w-12 text-[10px] font-semibold uppercase text-slate-500">L{idx + 1}</span>
                      <input
                        value={label}
                        onChange={(event) => onUpdateSwimlaneLabel(idx, event.target.value)}
                        className="ui-input h-8 flex-1 px-2 text-xs"
                      />
                      <button
                        type="button"
                        disabled={swimlaneLabels.length <= 2}
                        onClick={() => onRemoveSwimlane(idx)}
                        className="rounded-md border border-rose-300 px-2 py-1 text-[10px] font-semibold text-rose-600 disabled:opacity-40"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={onAddSwimlane}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-[10px] font-semibold uppercase"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Swimlane
                  </button>
                </div>
              ) : null}
            </PanelSection>
          </>
        ) : null}

        {activeTab === 'export' ? (
          <PanelSection title="File & Export" icon={<ArrowDownToLine className="h-3.5 w-3.5" />}>
            <button
              type="button"
              data-testid="toolbar-export-json"
              onClick={onExportDiagram}
              className="ui-button-primary inline-flex w-full items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold"
            >
              <ArrowDownToLine className="h-4 w-4" /> Export JSON
            </button>
            <button
              type="button"
              data-testid="toolbar-import-json"
              onClick={onImportDiagram}
              className="ui-button-secondary inline-flex w-full items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold"
            >
              <ArrowUpFromLine className="h-4 w-4" /> Import JSON
            </button>
            <button
              type="button"
              data-testid="toolbar-restore"
              onClick={onRestoreRecovery}
              className={`ui-button-secondary inline-flex w-full items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold ${
                hasRecoverySnapshot ? '' : 'opacity-90'
              }`}
            >
              Restore Backup
            </button>
            <button
              type="button"
              data-testid="toolbar-reset-canvas"
              onClick={onResetCanvas}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700"
            >
              New / Reset Canvas
            </button>
          </PanelSection>
        ) : null}
      </div>
    </div>
  );
};

export default Inspector;
