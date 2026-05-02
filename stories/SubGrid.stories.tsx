import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MuiDataGrid } from '@iasbuilt/datagrid-mui';
import type { ColumnDef, StatusOption } from '@iasbuilt/datagrid-core';
import { storyContainer, gridContainer } from './helpers';
import * as styles from './stories.styles';

const meta: Meta = {
  title: 'Examples/Sub-Grid',
};
export default meta;

// ---------------------------------------------------------------------------
// Shared data helpers
// ---------------------------------------------------------------------------

const taskStatusOptions: StatusOption[] = [
  { value: 'Not Started', label: 'Not Started', color: '#94a3b8' },
  { value: 'In Progress', label: 'In Progress', color: '#3b82f6' },
  { value: 'Done', label: 'Done', color: '#10b981' },
];

// ---------------------------------------------------------------------------
// 1. BasicSubGrid
// ---------------------------------------------------------------------------

interface TaskRow {
  id: string;
  task: string;
  hours: number;
  status: string;
}

interface EmployeeWithTasks {
  id: string;
  name: string;
  email: string;
  department: string;
  tasks: TaskRow[];
}

const taskSubGridColumns: ColumnDef<TaskRow>[] = [
  { id: 'task', field: 'task', title: 'Task Name', width: 220 },
  { id: 'hours', field: 'hours', title: 'Hours', width: 100, cellType: 'numeric' },
  { id: 'status', field: 'status', title: 'Status', width: 140, cellType: 'status', options: taskStatusOptions },
];

function makeEmployeesWithTasks(): EmployeeWithTasks[] {
  const names = ['Alice Smith', 'Bob Johnson', 'Charlie Brown', 'Diana Garcia', 'Eve Miller', 'Frank Davis', 'Grace Wilson', 'Hank Moore', 'Ivy Taylor', 'Jack Anderson'];
  const depts = ['Engineering', 'Design', 'Marketing', 'Sales', 'HR'];
  const taskNames = ['Code review', 'Write tests', 'Deploy staging', 'Update docs', 'Fix bug #42', 'Design mockup', 'Client meeting', 'Sprint planning', 'Refactor module', 'Data migration'];
  const statuses = taskStatusOptions.map((o) => o.value);

  return names.map((name, i) => ({
    id: String(i + 1),
    name,
    email: `${name.split(' ')[0]!.toLowerCase()}@example.com`,
    department: depts[i % depts.length]!,
    tasks: Array.from({ length: 2 + (i % 2) }, (_, j) => ({
      id: `${i + 1}-t${j + 1}`,
      task: taskNames[(i * 3 + j) % taskNames.length]!,
      hours: 2 + ((i + j) % 6),
      status: statuses[(i + j) % statuses.length]!,
    })),
  }));
}

const basicColumns: ColumnDef<EmployeeWithTasks>[] = [
  { id: 'name', field: 'name', title: 'Employee', width: 180, sortable: true },
  { id: 'email', field: 'email', title: 'Email', width: 220 },
  { id: 'department', field: 'department', title: 'Department', width: 140 },
  { id: 'tasks', field: 'tasks', title: 'Tasks', width: 120, cellType: 'subGrid', subGridColumns: taskSubGridColumns as ColumnDef[], subGridRowKey: 'id' },
];

export const BasicSubGrid: StoryObj = {
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>Basic Sub-Grid</h2>
      <p style={styles.subtitle}>
        Click the badge+icon toggle on any row to expand an inline sub-grid beneath the
        parent row. The sub-grid renders its OWN column headers (Task Name, Hours, Status)
        separate from the parent grid's headers (Employee, Email, Department, Tasks).
        While expanded the toggle shows an "x" affordance to close the sub-grid.
      </p>
      <div style={gridContainer}>
        <MuiDataGrid
          data={makeEmployeesWithTasks()}
          columns={basicColumns as any}
          rowKey="id"
          selectionMode="cell"
          keyboardNavigation
        />
      </div>
    </div>
  ),
};

// ---------------------------------------------------------------------------
// 2. DeepNesting
// ---------------------------------------------------------------------------

interface Member {
  id: string;
  name: string;
  role: string;
}

interface Team {
  id: string;
  teamName: string;
  headcount: number;
  members: Member[];
}

interface Department {
  id: string;
  departmentName: string;
  budget: number;
  teams: Team[];
}

const memberColumns: ColumnDef<Member>[] = [
  { id: 'name', field: 'name', title: 'Name', width: 180 },
  { id: 'role', field: 'role', title: 'Role', width: 160 },
];

const teamColumns: ColumnDef<Team>[] = [
  { id: 'teamName', field: 'teamName', title: 'Team', width: 180 },
  { id: 'headcount', field: 'headcount', title: 'Headcount', width: 110, cellType: 'numeric' },
  { id: 'members', field: 'members', title: 'Members', width: 120, cellType: 'subGrid', subGridColumns: memberColumns as ColumnDef[], subGridRowKey: 'id' },
];

const deptColumns: ColumnDef<Department>[] = [
  { id: 'departmentName', field: 'departmentName', title: 'Department', width: 200 },
  { id: 'budget', field: 'budget', title: 'Budget', width: 140, cellType: 'currency', format: 'USD' },
  { id: 'teams', field: 'teams', title: 'Teams', width: 120, cellType: 'subGrid', subGridColumns: teamColumns as ColumnDef[], subGridRowKey: 'id' },
];

function makeDepartments(): Department[] {
  const deptNames = ['Engineering', 'Product', 'Design', 'Marketing', 'Operations'];
  const teamPrefixes = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'];
  const roles = ['Developer', 'Designer', 'PM', 'QA Engineer', 'Analyst'];
  const firstNames = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Hank', 'Ivy', 'Jack', 'Kate', 'Leo', 'Mia', 'Nick', 'Olivia'];

  return deptNames.map((dept, di) => {
    const teamCount = 2 + (di % 2);
    return {
      id: `dept-${di + 1}`,
      departmentName: dept,
      budget: 500000 + di * 150000,
      teams: Array.from({ length: teamCount }, (_, ti) => {
        const memberCount = 2 + (ti % 2);
        return {
          id: `team-${di}-${ti}`,
          teamName: `${teamPrefixes[(di * 2 + ti) % teamPrefixes.length]} Team`,
          headcount: memberCount,
          members: Array.from({ length: memberCount }, (__, mi) => ({
            id: `member-${di}-${ti}-${mi}`,
            name: firstNames[(di * 4 + ti * 2 + mi) % firstNames.length]!,
            role: roles[(di + ti + mi) % roles.length]!,
          })),
        };
      }),
    };
  });
}

export const DeepNesting: StoryObj = {
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>Deep Nesting (2 Levels of Recursion)</h2>
      <p style={styles.subtitle}>
        Departments contain teams, and teams contain members. Each level has its own
        independent sub-grid with its own headers, sort state, and expansion state.
        Expand a department to see its teams; expand a team to see its members. Each
        nested grid is a fully independent `GridModel` instance — events (click, keydown,
        DnD) are scoped to the currently focused level.
      </p>
      <div style={gridContainer}>
        <MuiDataGrid
          data={makeDepartments()}
          columns={deptColumns as any}
          rowKey="id"
          subGrid={{ maxDepth: 3 }}
          selectionMode="cell"
          keyboardNavigation
        />
      </div>
    </div>
  ),
};

// ---------------------------------------------------------------------------
// 3. SubGridWithEditing
// ---------------------------------------------------------------------------

interface EditableTask {
  id: string;
  task: string;
  hours: number;
  notes: string;
}

interface ProjectRow {
  id: string;
  project: string;
  owner: string;
  tasks: EditableTask[];
}

const editableTaskColumns: ColumnDef<EditableTask>[] = [
  { id: 'task', field: 'task', title: 'Task', width: 200, editable: true },
  { id: 'hours', field: 'hours', title: 'Hours', width: 100, cellType: 'numeric', editable: true, min: 0, max: 999 },
  { id: 'notes', field: 'notes', title: 'Notes', width: 220, editable: true },
];

const projectColumns: ColumnDef<ProjectRow>[] = [
  { id: 'project', field: 'project', title: 'Project', width: 200, editable: true },
  { id: 'owner', field: 'owner', title: 'Owner', width: 160, editable: true },
  { id: 'tasks', field: 'tasks', title: 'Tasks', width: 120, cellType: 'subGrid', subGridColumns: editableTaskColumns as ColumnDef[], subGridRowKey: 'id' },
];

function makeProjects(): ProjectRow[] {
  const projects = ['Website Redesign', 'API v2', 'Mobile App', 'Data Pipeline', 'Security Audit'];
  const owners = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve'];
  return projects.map((proj, i) => ({
    id: `proj-${i + 1}`,
    project: proj,
    owner: owners[i]!,
    tasks: Array.from({ length: 3 }, (_, j) => ({
      id: `proj-${i + 1}-t${j + 1}`,
      task: `${proj} - Phase ${j + 1}`,
      hours: 8 + j * 4,
      notes: `Initial estimate for phase ${j + 1}`,
    })),
  }));
}

export const SubGridWithEditing: StoryObj = {
  render: () => {
    const [log, setLog] = useState<string[]>([]);
    return (
      <div style={storyContainer}>
        <h2 style={styles.heading}>Sub-Grid with Editing</h2>
        <p style={styles.subtitle}>
          Expand a row and double-click cells in the sub-grid to edit. Edits are logged below.
        </p>
        <div style={gridContainer}>
          <MuiDataGrid
            data={makeProjects()}
            columns={projectColumns as any}
            rowKey="id"
            selectionMode="cell"
            keyboardNavigation
            onCellEdit={(rowId, field, value, prev) =>
              setLog((p) => [...p.slice(-8), `[${rowId}].${field}: ${String(prev)} -> ${String(value)}`])
            }
          />
        </div>
        <pre style={styles.logPre}>
          {log.length ? log.join('\n') : '(expand a row and edit a sub-grid cell to see events)'}
        </pre>
      </div>
    );
  },
};

// ---------------------------------------------------------------------------
// 4. SingleExpandMode
// ---------------------------------------------------------------------------

interface OrderRow {
  id: string;
  customer: string;
  total: number;
  items: { id: string; product: string; quantity: number; price: number }[];
}

const orderItemColumns: ColumnDef[] = [
  { id: 'product', field: 'product', title: 'Product', width: 200 },
  { id: 'quantity', field: 'quantity', title: 'Qty', width: 80, cellType: 'numeric' },
  { id: 'price', field: 'price', title: 'Price', width: 120, cellType: 'currency', format: 'USD' },
];

const orderColumns: ColumnDef<OrderRow>[] = [
  { id: 'customer', field: 'customer', title: 'Customer', width: 200 },
  { id: 'total', field: 'total', title: 'Total', width: 140, cellType: 'currency', format: 'USD' },
  { id: 'items', field: 'items', title: 'Items', width: 120, cellType: 'subGrid', subGridColumns: orderItemColumns, subGridRowKey: 'id' },
];

function makeOrderRows(): OrderRow[] {
  const customers = ['Acme Corp', 'Globex Inc', 'Initech', 'Umbrella Co', 'Hooli', 'Pied Piper', 'Stark Ind.', 'Wayne Ent.'];
  const products = ['Widget A', 'Widget B', 'Gadget X', 'Gadget Y', 'Gizmo Pro', 'Gizmo Lite', 'Doohickey', 'Thingamajig'];

  return customers.map((cust, i) => {
    const items = Array.from({ length: 2 + (i % 3) }, (_, j) => {
      const qty = 1 + ((i + j) % 10);
      const price = 25 + ((i * 7 + j * 13) % 200);
      return { id: `item-${i}-${j}`, product: products[(i + j) % products.length]!, quantity: qty, price };
    });
    return {
      id: `order-${i + 1}`,
      customer: cust,
      total: items.reduce((sum, it) => sum + it.quantity * it.price, 0),
      items,
    };
  });
}

export const SingleExpandMode: StoryObj = {
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>Single Expand Mode</h2>
      <p style={styles.subtitle}>
        Only one sub-grid can be expanded at a time. Expanding a row automatically collapses the previously open one.
      </p>
      <div style={gridContainer}>
        <MuiDataGrid
          data={makeOrderRows()}
          columns={orderColumns as any}
          rowKey="id"
          subGrid={{ singleExpand: true }}
          selectionMode="cell"
          keyboardNavigation
        />
      </div>
    </div>
  ),
};

// ---------------------------------------------------------------------------
// 5. LargeSubGrid
// ---------------------------------------------------------------------------

interface LogEntry {
  id: string;
  timestamp: string;
  level: string;
  message: string;
}

interface ServiceRow {
  id: string;
  service: string;
  status: string;
  logs: LogEntry[];
}

const logLevelOptions: StatusOption[] = [
  { value: 'INFO', label: 'INFO', color: '#3b82f6' },
  { value: 'WARN', label: 'WARN', color: '#f59e0b' },
  { value: 'ERROR', label: 'ERROR', color: '#ef4444' },
  { value: 'DEBUG', label: 'DEBUG', color: '#94a3b8' },
];

const serviceStatusOptions: StatusOption[] = [
  { value: 'Healthy', label: 'Healthy', color: '#10b981' },
  { value: 'Degraded', label: 'Degraded', color: '#f59e0b' },
  { value: 'Down', label: 'Down', color: '#ef4444' },
];

const logColumns: ColumnDef<LogEntry>[] = [
  { id: 'timestamp', field: 'timestamp', title: 'Timestamp', width: 180 },
  { id: 'level', field: 'level', title: 'Level', width: 100, cellType: 'status', options: logLevelOptions },
  { id: 'message', field: 'message', title: 'Message', width: 400 },
];

const serviceColumns: ColumnDef<ServiceRow>[] = [
  { id: 'service', field: 'service', title: 'Service', width: 200 },
  { id: 'status', field: 'status', title: 'Status', width: 120, cellType: 'status', options: serviceStatusOptions },
  { id: 'logs', field: 'logs', title: 'Logs', width: 120, cellType: 'subGrid', subGridColumns: logColumns as ColumnDef[], subGridRowKey: 'id' },
];

function makeServiceRows(): ServiceRow[] {
  const services = ['auth-service', 'api-gateway', 'payment-service', 'notification-service', 'analytics-engine'];
  const statuses = serviceStatusOptions.map((o) => o.value);
  const levels = logLevelOptions.map((o) => o.value);
  const messages = [
    'Request processed successfully',
    'Connection timeout to database',
    'Rate limit exceeded for client',
    'Cache miss — fetching from origin',
    'Health check passed',
    'Retrying failed request (attempt 2/3)',
    'Worker thread terminated unexpectedly',
    'Configuration reloaded from disk',
    'TLS certificate renewed',
    'Memory usage above 80% threshold',
  ];

  return services.map((svc, si) => ({
    id: `svc-${si + 1}`,
    service: svc,
    status: statuses[si % statuses.length]!,
    logs: Array.from({ length: 50 }, (_, li) => ({
      id: `log-${si}-${li}`,
      timestamp: `2026-04-15T${String(8 + Math.floor(li / 6)).padStart(2, '0')}:${String((li * 7) % 60).padStart(2, '0')}:${String((li * 13) % 60).padStart(2, '0')}Z`,
      level: levels[(si + li) % levels.length]!,
      message: messages[(si * 3 + li) % messages.length]!,
    })),
  }));
}

export const LargeSubGrid: StoryObj = {
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>Large Sub-Grid (50+ Rows)</h2>
      <p style={styles.subtitle}>
        Each service contains 50 log entries. Expand a row to test scrolling within the nested grid.
      </p>
      <div style={gridContainer}>
        <MuiDataGrid
          data={makeServiceRows()}
          columns={serviceColumns as any}
          rowKey="id"
          selectionMode="cell"
          keyboardNavigation
        />
      </div>
    </div>
  ),
};

// ---------------------------------------------------------------------------
// 6. RecursiveWithDnD — demonstrate scoped DnD and keyboard navigation
// ---------------------------------------------------------------------------
//
// This story highlights the recursive composition and the event-scoping
// guarantees that the sub-grid architecture makes:
//   - Each level's drag-and-drop sessions act only on its own rows/columns.
//     Dragging a team row inside the nested grid does not reorder the
//     parent departments.
//   - Keyboard navigation boundaries are scoped per level: Tab cycles
//     within the current grid, Enter enters a sub-grid, Escape returns
//     focus to the parent grid.
//   - Column headers, sort state, and widths are independent at every
//     level — sorting by "Team Name" in a sub-grid has no effect on the
//     parent department list.

export const RecursiveWithDnD: StoryObj = {
  render: () => (
    <div style={storyContainer}>
      <h2 style={styles.heading}>Recursive Sub-Grids with Scoped DnD + Keyboard</h2>
      <p style={styles.subtitle}>
        Expand a department to see its teams; expand a team to see its members.
        Each sub-grid is a fully-independent DataGrid with its own row chrome,
        own column headers, own DnD session, and own keyboard focus.
        Keyboard: <kbd>Enter</kbd> on a sub-grid cell expands + focuses the
        nested grid. <kbd>Esc</kbd> inside a sub-grid returns focus to the
        parent. <kbd>Tab</kbd> never crosses a level boundary.
      </p>
      <div style={gridContainer}>
        <MuiDataGrid
          data={makeDepartments()}
          columns={deptColumns as any}
          rowKey="id"
          subGrid={{ maxDepth: 3 }}
          selectionMode="cell"
          keyboardNavigation
          chrome={{ rowNumbers: { position: 'left', reorderable: true } }}
        />
      </div>
    </div>
  ),
};
