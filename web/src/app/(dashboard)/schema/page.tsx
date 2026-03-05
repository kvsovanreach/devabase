'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  BackgroundVariant,
  Panel,
  Handle,
  Position,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Header } from '@/components/layout/header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageSpinner } from '@/components/ui/spinner';
import { useTables, TableInfo, TableColumnInfo } from '@/hooks/use-tables';
import { useCollections } from '@/hooks/use-collections';

// Type for converted collection schema (used in schema visualizer)
interface CollectionSchema {
  name: string;
  row_count: number;
  created_at: string;
  columns: TableColumnInfo[];
}
import {
  GitBranch,
  Table2,
  FolderOpen,
  Key,
  Hash,
  Type,
  Calendar,
  ToggleLeft,
  Braces,
  Link2,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Calculate node height based on number of columns
function calculateNodeHeight(columnCount: number): number {
  const headerHeight = 40;
  const columnHeight = 28;
  return headerHeight + (columnCount * columnHeight);
}

interface TableNodeData {
  table: TableInfo | CollectionSchema;
  type: 'table' | 'collection';
  foreignKeys?: string[];
  connectedHandles?: Set<string>;
}

// Column row dimensions (must match CSS)
const HEADER_HEIGHT = 40;
const COLUMN_HEIGHT = 28;

// Custom node component for tables and collections
function TableNode({ data }: { data: TableNodeData }) {
  const { table, type, foreignKeys = [], connectedHandles } = data;
  const Icon = type === 'table' ? Table2 : FolderOpen;
  const headerBg = type === 'table' ? 'bg-violet-500' : 'bg-primary';

  // Check if a column is a foreign key
  const isForeignKey = (colName: string) => foreignKeys.includes(colName);

  // Only render handles that are actually connected
  const isConnected = (handleId: string) => connectedHandles?.has(handleId) ?? false;

  return (
    <div className="bg-surface border border-border-light rounded-lg shadow-lg overflow-hidden min-w-[240px] max-w-[300px] relative">
      {/* Only render handles for columns that have connections */}
      {table.columns.map((col: TableColumnInfo, i: number) => {
        const topPx = HEADER_HEIGHT + i * COLUMN_HEIGHT + COLUMN_HEIGHT / 2;
        const srId = `source-right-${col.name}`;
        const slId = `source-left-${col.name}`;
        const trId = `target-right-${col.name}`;
        const tlId = `target-left-${col.name}`;
        const hasAny = isConnected(srId) || isConnected(slId) || isConnected(trId) || isConnected(tlId);
        if (!hasAny) return null;
        return (
          <div key={col.name}>
            {isConnected(srId) && (
              <Handle type="source" position={Position.Right} id={srId}
                className="!w-2.5 !h-2.5 !bg-violet-500 !border-2 !border-surface" style={{ top: topPx }} />
            )}
            {isConnected(slId) && (
              <Handle type="source" position={Position.Left} id={slId}
                className="!w-2.5 !h-2.5 !bg-violet-500 !border-2 !border-surface" style={{ top: topPx }} />
            )}
            {isConnected(trId) && (
              <Handle type="target" position={Position.Right} id={trId}
                className="!w-2.5 !h-2.5 !bg-primary !border-2 !border-surface" style={{ top: topPx }} />
            )}
            {isConnected(tlId) && (
              <Handle type="target" position={Position.Left} id={tlId}
                className="!w-2.5 !h-2.5 !bg-primary !border-2 !border-surface" style={{ top: topPx }} />
            )}
          </div>
        );
      })}

      {/* Header */}
      <div className={cn('px-3 py-2 flex items-center gap-2', headerBg)}>
        <Icon className="w-4 h-4 text-white" />
        <span className="font-semibold text-white text-[13px] truncate flex-1">
          {table.name}
        </span>
        <Badge variant="default" size="sm" className="bg-white/20 text-white border-0">
          {table.row_count}
        </Badge>
      </div>

      {/* Columns */}
      <div>
        {table.columns.map((col: TableColumnInfo) => (
          <div
            key={col.name}
            className={cn(
              'px-3 py-1.5 flex items-center gap-2 text-[12px] border-b border-border-light last:border-0',
              col.is_primary && 'bg-warning/10',
              isForeignKey(col.name) && 'bg-primary/10'
            )}
          >
            <span className={cn('flex-shrink-0', getTypeColor(col.data_type))}>
              {getTypeIcon(col.data_type)}
            </span>
            <span className={cn(
              'flex-1 truncate',
              col.is_primary ? 'text-warning font-medium' :
              isForeignKey(col.name) ? 'text-primary font-medium' : 'text-foreground'
            )}>
              {col.name}
            </span>
            {col.is_primary && <Key className="w-3 h-3 text-warning flex-shrink-0" />}
            {isForeignKey(col.name) && !col.is_primary && (
              <Link2 className="w-3 h-3 text-primary flex-shrink-0" />
            )}
            <span className="text-text-tertiary font-mono text-[10px] flex-shrink-0">
              {formatDataType(col.data_type)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Map PostgreSQL types to icons
function getTypeIcon(dataType: string) {
  const normalizedType = dataType.toLowerCase();
  if (normalizedType.includes('uuid')) return <Key className="w-3 h-3" />;
  if (normalizedType.includes('int') || normalizedType.includes('numeric') || normalizedType.includes('real') || normalizedType.includes('double'))
    return <Hash className="w-3 h-3" />;
  if (normalizedType.includes('bool')) return <ToggleLeft className="w-3 h-3" />;
  if (normalizedType.includes('json')) return <Braces className="w-3 h-3" />;
  if (normalizedType.includes('time') || normalizedType.includes('date')) return <Calendar className="w-3 h-3" />;
  return <Type className="w-3 h-3" />;
}

function getTypeColor(dataType: string) {
  const normalizedType = dataType.toLowerCase();
  if (normalizedType.includes('uuid')) return 'text-violet-500';
  if (normalizedType.includes('int') || normalizedType.includes('numeric') || normalizedType.includes('real') || normalizedType.includes('double'))
    return 'text-blue-500';
  if (normalizedType.includes('bool')) return 'text-amber-500';
  if (normalizedType.includes('json')) return 'text-rose-500';
  if (normalizedType.includes('time') || normalizedType.includes('date')) return 'text-orange-500';
  if (normalizedType.includes('text') || normalizedType.includes('char') || normalizedType.includes('varchar'))
    return 'text-emerald-500';
  return 'text-text-secondary';
}

function formatDataType(dataType: string) {
  // Shorten common types
  return dataType
    .replace('character varying', 'varchar')
    .replace('timestamp with time zone', 'timestamptz')
    .replace('timestamp without time zone', 'timestamp')
    .replace('double precision', 'float8');
}

// Node types
const nodeTypes = {
  tableNode: TableNode,
};

// Detect foreign key relationships based on column naming conventions
function detectRelationships(tables: TableInfo[]): { edges: Edge[]; foreignKeyMap: Map<string, string[]> } {
  const edges: Edge[] = [];
  const foreignKeyMap = new Map<string, string[]>();
  const tableNames = new Set(tables.map(t => t.name));
  const tableMap = new Map(tables.map(t => [t.name, t]));

  // Find the primary key column name for a table
  function getPkColumn(tableName: string): string {
    const table = tableMap.get(tableName);
    const pk = table?.columns.find(c => c.is_primary);
    return pk?.name || 'id';
  }

  function addEdge(sourceTable: string, sourceCol: string, targetTable: string) {
    const targetCol = getPkColumn(targetTable);
    edges.push({
      id: `${sourceTable}-${sourceCol}-${targetTable}`,
      source: `table-${sourceTable}`,
      target: `table-${targetTable}`,
      sourceHandle: null,
      targetHandle: null,
      type: 'smoothstep',
      animated: true,
      style: { stroke: '#8b5cf6', strokeWidth: 2 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#8b5cf6',
        width: 20,
        height: 20,
      },
      label: sourceCol,
      labelStyle: {
        fill: '#a1a1aa',
        fontSize: 10,
        fontWeight: 500,
      },
      labelBgStyle: {
        fill: '#18181b',
        fillOpacity: 0.9,
      },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 4,
      data: { sourceColumn: sourceCol, targetColumn: targetCol },
    });
  }

  tables.forEach((table) => {
    const fkColumns: string[] = [];

    table.columns.forEach((c) => {
      // Check for common FK patterns: xxx_id
      if (c.name.endsWith('_id') && c.data_type.toLowerCase().includes('uuid')) {
        const referencedTableName = c.name.slice(0, -3); // Remove '_id'

        // Try to find matching table (singular or plural forms)
        const possibleNames = [
          referencedTableName,
          referencedTableName + 's',
          referencedTableName + 'es',
          referencedTableName.replace(/y$/, 'ies'),
        ];

        let found = false;
        for (const possibleName of possibleNames) {
          if (tableNames.has(possibleName) && possibleName !== table.name) {
            fkColumns.push(c.name);
            addEdge(table.name, c.name, possibleName);
            found = true;
            break;
          }
        }

        // Special case mappings
        if (!found) {
          const specialMappings: Record<string, string> = {
            'approved_by': 'employees',
            'approver_id': 'employees',
            'manager_id': 'employees',
            'user_id': 'employees',
            'report_id': 'expense_reports',
            'document_id': 'documents',
          };

          if (specialMappings[c.name] && tableNames.has(specialMappings[c.name])) {
            if (!fkColumns.includes(c.name)) {
              fkColumns.push(c.name);
              addEdge(table.name, c.name, specialMappings[c.name]);
            }
          }
        }
      }
    });

    foreignKeyMap.set(table.name, fkColumns);
  });

  // Remove duplicate edges (same source-target pair)
  const uniqueEdges = edges.filter((edge, index, self) =>
    index === self.findIndex((e) => e.source === edge.source && e.target === edge.target && e.label === edge.label)
  );

  return { edges: uniqueEdges, foreignKeyMap };
}

// Build relationship graph for layout calculation
interface RelationshipGraph {
  // tableName -> tables it references (outgoing edges)
  references: Map<string, Set<string>>;
  // tableName -> tables that reference it (incoming edges)
  referencedBy: Map<string, Set<string>>;
}

function buildRelationshipGraph(tables: TableInfo[], edges: Edge[]): RelationshipGraph {
  const references = new Map<string, Set<string>>();
  const referencedBy = new Map<string, Set<string>>();

  // Initialize maps
  tables.forEach(t => {
    references.set(t.name, new Set());
    referencedBy.set(t.name, new Set());
  });

  // Build graph from edges
  edges.forEach(edge => {
    const sourceTable = edge.source.replace('table-', '');
    const targetTable = edge.target.replace('table-', '');

    references.get(sourceTable)?.add(targetTable);
    referencedBy.get(targetTable)?.add(sourceTable);
  });

  return { references, referencedBy };
}

// Find connected components in the table graph
function findConnectedComponents(tables: TableInfo[], graph: RelationshipGraph): string[][] {
  const visited = new Set<string>();
  const components: string[][] = [];
  const tableNames = new Set(tables.map(t => t.name));

  function dfs(name: string, component: string[]) {
    if (visited.has(name) || !tableNames.has(name)) return;
    visited.add(name);
    component.push(name);
    graph.references.get(name)?.forEach(ref => dfs(ref, component));
    graph.referencedBy.get(name)?.forEach(ref => dfs(ref, component));
  }

  tables.forEach(t => {
    if (!visited.has(t.name)) {
      const component: string[] = [];
      dfs(t.name, component);
      components.push(component);
    }
  });

  // Sort: larger connected groups first, standalone tables last
  components.sort((a, b) => b.length - a.length);
  return components;
}

// Barycenter ordering: reorder nodes within a layer to minimize edge crossings
function barycentricOrder(
  layers: string[][],
  graph: RelationshipGraph,
  tableMap: Map<string, TableInfo>
) {
  // Run multiple passes to converge
  for (let pass = 0; pass < 4; pass++) {
    // Forward pass: order each layer based on connected nodes in previous layer
    for (let i = 1; i < layers.length; i++) {
      const prevLayer = layers[i - 1];
      const prevPositions = new Map(prevLayer.map((name, idx) => [name, idx]));

      layers[i].sort((a, b) => {
        const aRefs = graph.references.get(a) || new Set();
        const bRefs = graph.references.get(b) || new Set();

        // Calculate barycenter (average position of connected nodes in previous layer)
        let aSum = 0, aCount = 0;
        aRefs.forEach(ref => {
          if (prevPositions.has(ref)) { aSum += prevPositions.get(ref)!; aCount++; }
        });
        let bSum = 0, bCount = 0;
        bRefs.forEach(ref => {
          if (prevPositions.has(ref)) { bSum += prevPositions.get(ref)!; bCount++; }
        });

        const aBarycenter = aCount > 0 ? aSum / aCount : Infinity;
        const bBarycenter = bCount > 0 ? bSum / bCount : Infinity;
        return aBarycenter - bBarycenter;
      });
    }

    // Backward pass: order each layer based on connected nodes in next layer
    for (let i = layers.length - 2; i >= 0; i--) {
      const nextLayer = layers[i + 1];
      const nextPositions = new Map(nextLayer.map((name, idx) => [name, idx]));

      layers[i].sort((a, b) => {
        const aRefBy = graph.referencedBy.get(a) || new Set();
        const bRefBy = graph.referencedBy.get(b) || new Set();

        let aSum = 0, aCount = 0;
        aRefBy.forEach(ref => {
          if (nextPositions.has(ref)) { aSum += nextPositions.get(ref)!; aCount++; }
        });
        let bSum = 0, bCount = 0;
        bRefBy.forEach(ref => {
          if (nextPositions.has(ref)) { bSum += nextPositions.get(ref)!; bCount++; }
        });

        const aBarycenter = aCount > 0 ? aSum / aCount : Infinity;
        const bBarycenter = bCount > 0 ? bSum / bCount : Infinity;
        return aBarycenter - bBarycenter;
      });
    }
  }
}

// Resolve vertical overlaps within a layer by pushing nodes apart
function resolveOverlaps(
  layer: string[],
  positions: Map<string, { x: number; y: number }>,
  heights: Map<string, number>,
  gap: number
) {
  // Sort by current Y position
  const sorted = [...layer].sort((a, b) => positions.get(a)!.y - positions.get(b)!.y);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const prevBottom = positions.get(prev)!.y + heights.get(prev)!;
    const currTop = positions.get(curr)!.y;
    if (currTop < prevBottom + gap) {
      positions.get(curr)!.y = prevBottom + gap;
    }
  }
}

// Calculate hierarchical layout - tables flow left to right based on dependencies
function calculateHierarchicalLayout(
  tables: TableInfo[],
  collections: CollectionSchema[],
  showTables: boolean,
  showCollections: boolean,
  foreignKeyMap: Map<string, string[]>,
  edges: Edge[]
): Node[] {
  const nodes: Node[] = [];
  const nodeWidth = 280;
  const horizontalGap = 120;
  const verticalGap = 40;
  const groupGap = 80; // Extra gap between connected components

  if (!showTables || tables.length === 0) {
    // Just show collections in a grid
    if (showCollections) {
      const cols = Math.ceil(Math.sqrt(collections.length));
      collections.forEach((collection, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        nodes.push({
          id: `collection-${collection.name}`,
          type: 'tableNode',
          position: {
            x: col * (nodeWidth + horizontalGap),
            y: row * (calculateNodeHeight(collection.columns.length) + verticalGap),
          },
          data: { table: collection, type: 'collection', foreignKeys: [] },
        });
      });
    }
    return nodes;
  }

  const graph = buildRelationshipGraph(tables, edges);
  const tableMap = new Map(tables.map(t => [t.name, t]));

  // Split tables into connected components
  const components = findConnectedComponents(tables, graph);

  // Separate connected groups (>1 table) from standalone tables
  const connectedGroups = components.filter(c => c.length > 1);
  const standaloneTables = components.filter(c => c.length === 1).map(c => c[0]);

  let globalYOffset = 0;

  // Layout each connected group independently
  connectedGroups.forEach((component) => {
    const componentTables = component.map(name => tableMap.get(name)!).filter(Boolean);
    const componentEdges = edges.filter(e => {
      const src = e.source.replace('table-', '');
      const tgt = e.target.replace('table-', '');
      return component.includes(src) && component.includes(tgt);
    });
    const componentGraph = buildRelationshipGraph(componentTables, componentEdges);
    const componentTableMap = new Map(componentTables.map(t => [t.name, t]));

    // Assign layers using topological sort
    const tableLayer = new Map<string, number>();

    function getLayer(tableName: string, visiting: Set<string> = new Set()): number {
      if (tableLayer.has(tableName)) return tableLayer.get(tableName)!;
      if (visiting.has(tableName)) return 0; // Circular dependency
      visiting.add(tableName);

      const refs = componentGraph.references.get(tableName) || new Set();
      let maxRefLayer = -1;
      refs.forEach(ref => {
        if (componentTableMap.has(ref)) {
          maxRefLayer = Math.max(maxRefLayer, getLayer(ref, visiting));
        }
      });

      const layer = maxRefLayer < 0 ? 0 : maxRefLayer + 1;
      tableLayer.set(tableName, layer);
      return layer;
    }

    componentTables.forEach(t => getLayer(t.name));

    // Group tables by layer
    const maxLayer = Math.max(...Array.from(tableLayer.values()), 0);
    const layers: string[][] = Array.from({ length: maxLayer + 1 }, () => []);
    componentTables.forEach(t => {
      const layer = tableLayer.get(t.name) || 0;
      layers[layer].push(t.name);
    });

    // Apply barycentric ordering to minimize edge crossings
    barycentricOrder(layers, componentGraph, componentTableMap);

    // Phase 1: Initial stacked positioning per layer
    let xOffset = 0;
    const nodePositions = new Map<string, { x: number; y: number }>();
    const nodeHeights = new Map<string, number>();

    layers.forEach((layer) => {
      let yOffset = globalYOffset;
      layer.forEach((tableName) => {
        const table = componentTableMap.get(tableName)!;
        const height = calculateNodeHeight(table.columns.length);
        nodeHeights.set(tableName, height);
        nodePositions.set(tableName, { x: xOffset, y: yOffset });
        yOffset += height + verticalGap;
      });
      xOffset += nodeWidth + horizontalGap;
    });

    // Phase 2: Iterative Y-relaxation — move each node toward the barycenter of its neighbors
    for (let iter = 0; iter < 6; iter++) {
      // Forward pass (left-to-right): adjust based on referenced tables
      for (let li = 1; li < layers.length; li++) {
        layers[li].forEach((tableName) => {
          const refs = componentGraph.references.get(tableName) || new Set();
          const neighbors = [...refs].filter(r => componentTableMap.has(r));
          if (neighbors.length === 0) return;
          const avgY = neighbors.reduce((sum, n) => {
            const pos = nodePositions.get(n)!;
            const h = nodeHeights.get(n)!;
            return sum + pos.y + h / 2;
          }, 0) / neighbors.length;
          const h = nodeHeights.get(tableName)!;
          nodePositions.get(tableName)!.y = avgY - h / 2;
        });
        // Resolve vertical overlaps within this layer
        resolveOverlaps(layers[li], nodePositions, nodeHeights, verticalGap);
      }

      // Backward pass (right-to-left): adjust based on tables that reference this one
      for (let li = layers.length - 2; li >= 0; li--) {
        layers[li].forEach((tableName) => {
          const refBy = componentGraph.referencedBy.get(tableName) || new Set();
          const neighbors = [...refBy].filter(r => componentTableMap.has(r));
          if (neighbors.length === 0) return;
          const avgY = neighbors.reduce((sum, n) => {
            const pos = nodePositions.get(n)!;
            const h = nodeHeights.get(n)!;
            return sum + pos.y + h / 2;
          }, 0) / neighbors.length;
          const h = nodeHeights.get(tableName)!;
          nodePositions.get(tableName)!.y = avgY - h / 2;
        });
        resolveOverlaps(layers[li], nodePositions, nodeHeights, verticalGap);
      }
    }

    // Phase 3: Normalize Y positions so the topmost node starts at globalYOffset
    let minY = Infinity;
    let maxY = -Infinity;
    component.forEach(name => {
      const pos = nodePositions.get(name)!;
      const h = nodeHeights.get(name)!;
      minY = Math.min(minY, pos.y);
      maxY = Math.max(maxY, pos.y + h);
    });
    const yShift = globalYOffset - minY;
    component.forEach(name => {
      nodePositions.get(name)!.y += yShift;
    });

    // Phase 4: Push nodes into the node list
    component.forEach(name => {
      const table = componentTableMap.get(name)!;
      const pos = nodePositions.get(name)!;
      nodes.push({
        id: `table-${table.name}`,
        type: 'tableNode',
        position: { x: pos.x, y: pos.y },
        data: { table, type: 'table', foreignKeys: foreignKeyMap.get(table.name) || [] },
      });
    });

    globalYOffset += (maxY - minY) + groupGap;
  });

  // Layout standalone tables in a compact grid below connected groups
  if (standaloneTables.length > 0) {
    const cols = Math.min(3, standaloneTables.length);
    let rowY = globalYOffset;
    let rowMaxHeight = 0;

    standaloneTables.forEach((tableName, i) => {
      const table = tableMap.get(tableName)!;
      const col = i % cols;
      const height = calculateNodeHeight(table.columns.length);

      if (col === 0 && i > 0) {
        rowY += rowMaxHeight + verticalGap;
        rowMaxHeight = 0;
      }
      rowMaxHeight = Math.max(rowMaxHeight, height);

      nodes.push({
        id: `table-${table.name}`,
        type: 'tableNode',
        position: { x: col * (nodeWidth + horizontalGap), y: rowY },
        data: { table, type: 'table', foreignKeys: [] },
      });
    });

    globalYOffset = rowY + rowMaxHeight + groupGap;
  }

  // Layout collections in their own section
  if (showCollections && collections.length > 0) {
    const cols = Math.min(3, collections.length);
    let rowY = globalYOffset;
    let rowMaxHeight = 0;

    collections.forEach((collection, i) => {
      const col = i % cols;
      const height = calculateNodeHeight(collection.columns.length);

      if (col === 0 && i > 0) {
        rowY += rowMaxHeight + verticalGap;
        rowMaxHeight = 0;
      }
      rowMaxHeight = Math.max(rowMaxHeight, height);

      nodes.push({
        id: `collection-${collection.name}`,
        type: 'tableNode',
        position: { x: col * (nodeWidth + horizontalGap), y: rowY },
        data: { table: collection, type: 'collection', foreignKeys: [] },
      });
    });
  }

  return nodes;
}

// Calculate simple grid layout (fallback)
function calculateGridLayout(
  tables: TableInfo[],
  collections: CollectionSchema[],
  showTables: boolean,
  showCollections: boolean,
  foreignKeyMap: Map<string, string[]>
): Node[] {
  const nodes: Node[] = [];
  const nodeWidth = 280;
  const horizontalGap = 80;
  const verticalGap = 40;
  const cols = 3;

  const items: { item: TableInfo | CollectionSchema; type: 'table' | 'collection' }[] = [];

  if (showTables && tables.length > 0) {
    tables.forEach(table => items.push({ item: table, type: 'table' }));
  }
  if (showCollections && collections.length > 0) {
    collections.forEach(collection => items.push({ item: collection, type: 'collection' }));
  }

  // Calculate row heights
  const rows: { items: typeof items; maxHeight: number }[] = [];
  let currentRow: typeof items = [];

  items.forEach((item, index) => {
    currentRow.push(item);
    if (currentRow.length === cols || index === items.length - 1) {
      const maxHeight = Math.max(...currentRow.map(i =>
        calculateNodeHeight(i.item.columns.length)
      ));
      rows.push({ items: [...currentRow], maxHeight });
      currentRow = [];
    }
  });

  let yOffset = 0;
  rows.forEach(row => {
    row.items.forEach((item, colIndex) => {
      const id = item.type === 'table' ? `table-${item.item.name}` : `collection-${item.item.name}`;
      nodes.push({
        id,
        type: 'tableNode',
        position: { x: colIndex * (nodeWidth + horizontalGap), y: yOffset },
        data: {
          table: item.item,
          type: item.type,
          foreignKeys: item.type === 'table' ? foreignKeyMap.get(item.item.name) || [] : []
        },
      });
    });
    yOffset += row.maxHeight + verticalGap;
  });

  return nodes;
}

// Assign smart source/target handles based on relative node positions
function assignSmartHandles(rawEdges: Edge[], nodeList: Node[]): Edge[] {
  const posMap = new Map(nodeList.map(n => [n.id, n.position]));
  return rawEdges.map(edge => {
    const sp = posMap.get(edge.source);
    const tp = posMap.get(edge.target);
    if (!sp || !tp) return edge;

    const dx = tp.x - sp.x;

    let sourceHandle: string;
    let targetHandle: string;

    const srcCol = edge.data?.sourceColumn || 'id';
    const tgtCol = edge.data?.targetColumn || 'id';

    if (dx > 0) {
      sourceHandle = `source-right-${srcCol}`;
      targetHandle = `target-left-${tgtCol}`;
    } else {
      sourceHandle = `source-left-${srcCol}`;
      targetHandle = `target-right-${tgtCol}`;
    }

    return { ...edge, sourceHandle, targetHandle };
  });
}

export default function SchemaPage() {
  const { data: tables, isLoading: tablesLoading } = useTables();
  const { data: collections, isLoading: collectionsLoading } = useCollections();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [showTables, setShowTables] = useState(true);
  const [showCollections, setShowCollections] = useState(true);
  const [showRelationships, setShowRelationships] = useState(true);
  const [layout, setLayout] = useState<'hierarchical' | 'grid'>('hierarchical');
  const [showSettings, setShowSettings] = useState(false);

  const isLoading = tablesLoading || collectionsLoading;

  // Detect relationships between tables
  const { edges: detectedEdges, foreignKeyMap } = useMemo(() => {
    if (!tables || tables.length === 0) {
      return { edges: [], foreignKeyMap: new Map() };
    }
    return detectRelationships(tables);
  }, [tables]);

  // Convert collections to table-like format
  const collectionSchemas = useMemo(() => {
    if (!collections) return [];
    return collections.map((c) => ({
      name: c.name,
      row_count: c.vector_count,
      created_at: '',
      columns: [
        { name: 'id', data_type: 'uuid', is_nullable: false, is_primary: true, column_default: null },
        { name: 'content', data_type: 'text', is_nullable: false, is_primary: false, column_default: null },
        { name: 'metadata', data_type: 'jsonb', is_nullable: true, is_primary: false, column_default: null },
        { name: 'embedding', data_type: `vector(${c.dimensions})`, is_nullable: false, is_primary: false, column_default: null },
        { name: 'document_id', data_type: 'uuid', is_nullable: true, is_primary: false, column_default: null },
        { name: 'created_at', data_type: 'timestamptz', is_nullable: false, is_primary: false, column_default: null },
      ] as TableColumnInfo[],
    }));
  }, [collections]);

  // Update nodes when data changes
  useEffect(() => {
    if (isLoading) return;

    const tableList = tables || [];
    const collectionList = collectionSchemas;

    const newNodes =
      layout === 'hierarchical'
        ? calculateHierarchicalLayout(tableList, collectionList, showTables, showCollections, foreignKeyMap, detectedEdges)
        : calculateGridLayout(tableList, collectionList, showTables, showCollections, foreignKeyMap);

    // Compute edges with smart handles, then inject connected handle info into nodes
    if (showRelationships && showTables) {
      const smartEdges = assignSmartHandles(detectedEdges, newNodes);

      // Build a map of nodeId -> Set of connected handle IDs
      const handleMap = new Map<string, Set<string>>();
      for (const edge of smartEdges) {
        if (edge.sourceHandle) {
          if (!handleMap.has(edge.source)) handleMap.set(edge.source, new Set());
          handleMap.get(edge.source)!.add(edge.sourceHandle);
        }
        if (edge.targetHandle) {
          if (!handleMap.has(edge.target)) handleMap.set(edge.target, new Set());
          handleMap.get(edge.target)!.add(edge.targetHandle);
        }
      }

      // Inject connectedHandles into node data
      const updatedNodes = newNodes.map(node => {
        const handles = handleMap.get(node.id);
        if (handles) {
          return { ...node, data: { ...node.data, connectedHandles: handles } };
        }
        return node;
      });

      setNodes(updatedNodes);
      setEdges(smartEdges);
    } else {
      setNodes(newNodes);
      setEdges([]);
    }
  }, [tables, collectionSchemas, isLoading, showTables, showCollections, showRelationships, layout, setNodes, setEdges, detectedEdges, foreignKeyMap]);

  const hasNoData = !tables?.length && !collections?.length;

  const handleAutoLayout = () => {
    const tableList = tables || [];
    const collectionList = collectionSchemas;
    const newNodes =
      layout === 'hierarchical'
        ? calculateHierarchicalLayout(tableList, collectionList, showTables, showCollections, foreignKeyMap, detectedEdges)
        : calculateGridLayout(tableList, collectionList, showTables, showCollections, foreignKeyMap);
    if (showRelationships && showTables) {
      const smartEdges = assignSmartHandles(detectedEdges, newNodes);
      const handleMap = new Map<string, Set<string>>();
      for (const edge of smartEdges) {
        if (edge.sourceHandle) {
          if (!handleMap.has(edge.source)) handleMap.set(edge.source, new Set());
          handleMap.get(edge.source)!.add(edge.sourceHandle);
        }
        if (edge.targetHandle) {
          if (!handleMap.has(edge.target)) handleMap.set(edge.target, new Set());
          handleMap.get(edge.target)!.add(edge.targetHandle);
        }
      }
      setNodes(newNodes.map(node => {
        const handles = handleMap.get(node.id);
        return handles ? { ...node, data: { ...node.data, connectedHandles: handles } } : node;
      }));
      setEdges(smartEdges);
    } else {
      setNodes(newNodes);
    }
  };

  const relationshipCount = detectedEdges.length;

  return (
    <div className="h-screen flex flex-col">
      <Header />

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <PageSpinner />
        </div>
      ) : hasNoData ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <EmptyState
            icon={<GitBranch className="w-8 h-8" />}
            title="No schema to display"
            description="Create tables or collections to see them visualized here."
          />
        </div>
      ) : (
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onPaneClick={() => setShowSettings(false)}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.1}
            maxZoom={2}
            defaultEdgeOptions={{
              type: 'smoothstep',
              animated: true,
            }}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--color-border-light)" />

            {/* Controls with Settings Button */}
            <Panel position="bottom-left" className="!m-4">
              <div className="flex items-end gap-3" style={{ position: 'relative', zIndex: 5 }}>
                <div className="flex-shrink-0">
                  <Controls className="!bg-surface !border-border-light !shadow-lg !relative !z-10">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowSettings(!showSettings);
                      }}
                      className={cn(
                        "react-flow__controls-button",
                        showSettings && "!bg-primary !text-white"
                      )}
                      title="Settings"
                    >
                      <Settings className="w-3.5 h-3.5" style={{ maxWidth: 12, maxHeight: 12 }} />
                    </button>
                  </Controls>
                </div>

                {/* Settings Popup */}
                {showSettings && (
                  <div className="flex-shrink-0" style={{ position: 'relative', zIndex: 100 }} onClick={(e) => e.stopPropagation()}>
                    <Card className="p-2 space-y-1 min-w-[140px] shadow-xl border border-border-light">
                    <Button
                      variant={showTables ? 'secondary' : 'ghost'}
                      size="sm"
                      onClick={() => setShowTables(!showTables)}
                      className="w-full justify-start"
                    >
                      <Table2 className="w-4 h-4 mr-2" />
                      Tables ({tables?.length || 0})
                    </Button>
                    <Button
                      variant={showCollections ? 'secondary' : 'ghost'}
                      size="sm"
                      onClick={() => setShowCollections(!showCollections)}
                      className="w-full justify-start"
                    >
                      <FolderOpen className="w-4 h-4 mr-2" />
                      Collections ({collections?.length || 0})
                    </Button>

                    <div className="border-t border-border-light my-1" />

                    <div className="flex gap-1">
                      <Button
                        variant={layout === 'hierarchical' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setLayout('hierarchical')}
                        className="flex-1"
                      >
                        Auto
                      </Button>
                      <Button
                        variant={layout === 'grid' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setLayout('grid')}
                        className="flex-1"
                      >
                        Grid
                      </Button>
                    </div>

                    <div className="border-t border-border-light my-1" />

                    <Button
                      variant={showRelationships ? 'secondary' : 'ghost'}
                      size="sm"
                      onClick={() => setShowRelationships(!showRelationships)}
                      className="w-full justify-start"
                    >
                      <Link2 className="w-4 h-4 mr-2" />
                      {showRelationships ? 'Hide' : 'Show'} ({relationshipCount})
                    </Button>

                    <Button variant="ghost" size="sm" onClick={handleAutoLayout} className="w-full justify-start text-text-secondary">
                      Reset Layout
                    </Button>
                    </Card>
                  </div>
                )}
              </div>
            </Panel>

            {/* Legend & Stats */}
            <Panel position="bottom-right" className="!m-4">
              <div className="flex items-center gap-3">
                {/* Legend */}
                <Card className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-text-secondary">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-violet-500" />
                      <span>Table</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-primary" />
                      <span>Collection</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Key className="w-3 h-3 text-warning" />
                      <span>Primary Key</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Link2 className="w-3 h-3 text-primary" />
                      <span>Foreign Key</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <svg width="24" height="12" className="text-violet-500">
                        <line x1="0" y1="6" x2="18" y2="6" stroke="currentColor" strokeWidth="2" />
                        <polygon points="24,6 16,2 16,10" fill="currentColor" />
                      </svg>
                      <span>Relationship</span>
                    </div>
                  </div>
                </Card>

                {/* Stats */}
                <Card className="px-3 py-2">
                  <div className="flex items-center gap-4 text-[11px] text-text-secondary">
                    <span>
                      <strong className="text-foreground">{tables?.length || 0}</strong> tables
                    </span>
                    <span>
                      <strong className="text-foreground">{collections?.length || 0}</strong> collections
                    </span>
                    <span>
                      <strong className="text-foreground">{relationshipCount}</strong> relationships
                    </span>
                    <span>
                      <strong className="text-foreground">
                        {(tables?.reduce((acc, t) => acc + t.row_count, 0) || 0) +
                          (collections?.reduce((acc, c) => acc + c.vector_count, 0) || 0)}
                      </strong>{' '}
                      records
                    </span>
                  </div>
                </Card>
              </div>
            </Panel>
          </ReactFlow>
        </div>
      )}
    </div>
  );
}
