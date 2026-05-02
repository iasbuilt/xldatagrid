import type { ColumnDef, StatusOption } from '@iasbuilt/datagrid-core';

// ---------------------------------------------------------------------------
// Shared demo data used across stories
// ---------------------------------------------------------------------------

export interface Employee {
  id: string;
  name: string;
  email: string;
  department: string;
  role: string;
  salary: number;
  startDate: string;
  active: boolean;
  tags: string[];
  city: string;
  notes: string;
  rating: number;
  password: string;
  resume: string;
}

export const departmentOptions: StatusOption[] = [
  { value: 'Engineering', label: 'Engineering', color: '#3b82f6' },
  { value: 'Design', label: 'Design', color: '#8b5cf6' },
  { value: 'Marketing', label: 'Marketing', color: '#f59e0b' },
  { value: 'Sales', label: 'Sales', color: '#10b981' },
  { value: 'HR', label: 'HR', color: '#ec4899' },
  { value: 'Finance', label: 'Finance', color: '#6366f1' },
];

export const roleOptions: StatusOption[] = [
  { value: 'Junior', label: 'Junior' },
  { value: 'Mid', label: 'Mid' },
  { value: 'Senior', label: 'Senior' },
  { value: 'Lead', label: 'Lead' },
  { value: 'Manager', label: 'Manager' },
  { value: 'Director', label: 'Director' },
];

export const cityOptions: StatusOption[] = [
  { value: 'New York', label: 'New York' },
  { value: 'San Francisco', label: 'San Francisco' },
  { value: 'London', label: 'London' },
  { value: 'Berlin', label: 'Berlin' },
  { value: 'Tokyo', label: 'Tokyo' },
  { value: 'Sydney', label: 'Sydney' },
];

export function makeEmployees(count = 50): Employee[] {
  const firstNames = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Hank', 'Ivy', 'Jack', 'Kate', 'Leo', 'Mia', 'Nick', 'Olivia', 'Pete', 'Quinn', 'Rose', 'Sam', 'Tina'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'];
  const depts = departmentOptions.map(o => o.value);
  const roles = roleOptions.map(o => o.value);
  const cities = cityOptions.map(o => o.value);
  const tagPool = ['react', 'typescript', 'node', 'python', 'go', 'rust', 'aws', 'gcp', 'docker', 'k8s', 'graphql', 'sql'];

  return Array.from({ length: count }, (_, i) => {
    const first = firstNames[i % firstNames.length]!;
    const last = lastNames[i % lastNames.length]!;
    const name = `${first} ${last}`;
    return {
      id: String(i + 1),
      name,
      email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
      department: depts[i % depts.length]!,
      role: roles[i % roles.length]!,
      salary: 50000 + Math.round(Math.random() * 100000),
      startDate: `20${18 + (i % 7)}-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
      active: i % 5 !== 0,
      tags: tagPool.slice(i % tagPool.length, (i % tagPool.length) + 2 + (i % 3)),
      city: cities[i % cities.length]!,
      notes: `Employee #${i + 1} — ${name}`,
      rating: 1 + (i % 5),
      password: 'secret123',
      resume: i % 3 === 0 ? 'resume.pdf' : '',
    };
  });
}

export const defaultColumns: ColumnDef<Employee>[] = [
  { id: 'name', field: 'name', title: 'Name', width: 180, sortable: true, filterable: true, editable: true },
  { id: 'email', field: 'email', title: 'Email', width: 240, sortable: true, editable: true },
  { id: 'department', field: 'department', title: 'Department', width: 150, cellType: 'status', options: departmentOptions, sortable: true, filterable: true, editable: true },
  { id: 'role', field: 'role', title: 'Role', width: 120, cellType: 'list', options: roleOptions, sortable: true, editable: true },
  { id: 'salary', field: 'salary', title: 'Salary', width: 130, cellType: 'currency', sortable: true, format: 'USD', editable: true },
  { id: 'startDate', field: 'startDate', title: 'Start Date', width: 140, cellType: 'calendar', sortable: true, editable: true },
  { id: 'active', field: 'active', title: 'Active', width: 80, cellType: 'boolean', editable: true },
  { id: 'city', field: 'city', title: 'City', width: 140, sortable: true, filterable: true, editable: true },
  { id: 'rating', field: 'rating', title: 'Rating', width: 90, cellType: 'numeric', min: 1, max: 5, sortable: true, editable: true },
];

// ---------------------------------------------------------------------------
// Order data (for grouping / aggregates)
// ---------------------------------------------------------------------------

export interface Order {
  id: string;
  customer: string;
  product: string;
  category: string;
  region: string;
  quantity: number;
  unitPrice: number;
  total: number;
  status: string;
  date: string;
}

export const orderStatusOptions: StatusOption[] = [
  { value: 'Pending', label: 'Pending', color: '#f59e0b' },
  { value: 'Shipped', label: 'Shipped', color: '#3b82f6' },
  { value: 'Delivered', label: 'Delivered', color: '#10b981' },
  { value: 'Cancelled', label: 'Cancelled', color: '#ef4444' },
];

export function makeOrders(count = 80): Order[] {
  const customers = ['Acme Corp', 'Globex', 'Initech', 'Umbrella', 'Soylent', 'Hooli', 'Pied Piper', 'Stark Ind.'];
  const products = ['Widget A', 'Widget B', 'Gadget X', 'Gadget Y', 'Gizmo Pro', 'Gizmo Lite', 'Doohickey', 'Thingamajig'];
  const categories = ['Electronics', 'Hardware', 'Software', 'Services'];
  const regions = ['North', 'South', 'East', 'West'];
  const statuses = orderStatusOptions.map(o => o.value);

  return Array.from({ length: count }, (_, i) => {
    const qty = 1 + (i % 20);
    const price = 10 + (i * 7) % 200;
    return {
      id: `ORD-${String(i + 1).padStart(4, '0')}`,
      customer: customers[i % customers.length]!,
      product: products[i % products.length]!,
      category: categories[i % categories.length]!,
      region: regions[i % regions.length]!,
      quantity: qty,
      unitPrice: price,
      total: qty * price,
      status: statuses[i % statuses.length]!,
      date: `2025-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
    };
  });
}

export const orderColumns: ColumnDef<Order>[] = [
  { id: 'id', field: 'id', title: 'Order ID', width: 120, sortable: true },
  { id: 'customer', field: 'customer', title: 'Customer', width: 150, sortable: true, filterable: true },
  { id: 'product', field: 'product', title: 'Product', width: 140, sortable: true },
  { id: 'category', field: 'category', title: 'Category', width: 120, sortable: true, filterable: true },
  { id: 'region', field: 'region', title: 'Region', width: 100, sortable: true, filterable: true },
  { id: 'quantity', field: 'quantity', title: 'Qty', width: 80, cellType: 'numeric', sortable: true },
  { id: 'unitPrice', field: 'unitPrice', title: 'Unit Price', width: 110, cellType: 'currency', format: 'USD', sortable: true },
  { id: 'total', field: 'total', title: 'Total', width: 110, cellType: 'currency', format: 'USD', sortable: true },
  { id: 'status', field: 'status', title: 'Status', width: 120, cellType: 'status', options: orderStatusOptions, sortable: true, filterable: true },
  { id: 'date', field: 'date', title: 'Date', width: 120, cellType: 'calendar', sortable: true },
];
