/**
 * Expense Management Schema - 10 Tables with Relationships
 *
 * Run this script with: npx tsx scripts/seed-expense-tables.ts
 *
 * Make sure you have:
 * 1. Backend running at localhost:9002
 * 2. Valid API key set in API_KEY environment variable
 */

const API_URL = process.env.API_URL || 'http://localhost:9002/v1';
const API_KEY = process.env.API_KEY || '';

if (!API_KEY) {
  console.error('❌ Please set API_KEY environment variable');
  console.error('   Example: API_KEY=your_api_key npx tsx scripts/seed-expense-tables.ts');
  process.exit(1);
}

interface Column {
  name: string;
  type: string;
  primary?: boolean;
  nullable?: boolean;
  unique?: boolean;
  default?: string;
}

interface TableDefinition {
  name: string;
  description: string;
  columns: Column[];
}

const tables: TableDefinition[] = [
  {
    name: 'departments',
    description: 'Company departments',
    columns: [
      { name: 'id', type: 'uuid', primary: true, default: 'gen_random_uuid()' },
      { name: 'name', type: 'varchar(100)', nullable: false },
      { name: 'code', type: 'varchar(20)', nullable: false, unique: true },
      { name: 'budget_limit', type: 'numeric(12,2)', default: '0' },
      { name: 'manager_id', type: 'uuid', nullable: true },
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
    ],
  },
  {
    name: 'employees',
    description: 'Employee information',
    columns: [
      { name: 'id', type: 'uuid', primary: true, default: 'gen_random_uuid()' },
      { name: 'email', type: 'varchar(255)', nullable: false, unique: true },
      { name: 'first_name', type: 'varchar(100)', nullable: false },
      { name: 'last_name', type: 'varchar(100)', nullable: false },
      { name: 'department_id', type: 'uuid', nullable: true },
      { name: 'role', type: 'varchar(50)', default: "'employee'" },
      { name: 'hire_date', type: 'date', nullable: true },
      { name: 'is_active', type: 'boolean', default: 'true' },
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
    ],
  },
  {
    name: 'categories',
    description: 'Expense categories',
    columns: [
      { name: 'id', type: 'uuid', primary: true, default: 'gen_random_uuid()' },
      { name: 'name', type: 'varchar(100)', nullable: false },
      { name: 'code', type: 'varchar(20)', nullable: false, unique: true },
      { name: 'description', type: 'text', nullable: true },
      { name: 'icon', type: 'varchar(50)', nullable: true },
      { name: 'color', type: 'varchar(20)', default: "'#6366f1'" },
      { name: 'is_active', type: 'boolean', default: 'true' },
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
    ],
  },
  {
    name: 'payment_methods',
    description: 'Payment method types (credit cards, cash, etc.)',
    columns: [
      { name: 'id', type: 'uuid', primary: true, default: 'gen_random_uuid()' },
      { name: 'name', type: 'varchar(100)', nullable: false },
      { name: 'type', type: 'varchar(50)', nullable: false },
      { name: 'last_four', type: 'varchar(4)', nullable: true },
      { name: 'employee_id', type: 'uuid', nullable: true },
      { name: 'is_corporate', type: 'boolean', default: 'false' },
      { name: 'is_active', type: 'boolean', default: 'true' },
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
    ],
  },
  {
    name: 'expense_policies',
    description: 'Spending rules and limits per department/category',
    columns: [
      { name: 'id', type: 'uuid', primary: true, default: 'gen_random_uuid()' },
      { name: 'name', type: 'varchar(100)', nullable: false },
      { name: 'department_id', type: 'uuid', nullable: true },
      { name: 'category_id', type: 'uuid', nullable: true },
      { name: 'max_amount', type: 'numeric(12,2)', nullable: true },
      { name: 'requires_receipt', type: 'boolean', default: 'true' },
      { name: 'requires_approval', type: 'boolean', default: 'true' },
      { name: 'auto_approve_under', type: 'numeric(12,2)', nullable: true },
      { name: 'is_active', type: 'boolean', default: 'true' },
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
    ],
  },
  {
    name: 'expense_reports',
    description: 'Expense report submissions',
    columns: [
      { name: 'id', type: 'uuid', primary: true, default: 'gen_random_uuid()' },
      { name: 'title', type: 'varchar(255)', nullable: false },
      { name: 'description', type: 'text', nullable: true },
      { name: 'employee_id', type: 'uuid', nullable: false },
      { name: 'status', type: 'varchar(20)', default: "'draft'" },
      { name: 'total_amount', type: 'numeric(12,2)', default: '0' },
      { name: 'submitted_at', type: 'timestamptz', nullable: true },
      { name: 'approved_at', type: 'timestamptz', nullable: true },
      { name: 'approved_by', type: 'uuid', nullable: true },
      { name: 'rejected_reason', type: 'text', nullable: true },
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
      { name: 'updated_at', type: 'timestamptz', default: 'now()' },
    ],
  },
  {
    name: 'expenses',
    description: 'Individual expense line items',
    columns: [
      { name: 'id', type: 'uuid', primary: true, default: 'gen_random_uuid()' },
      { name: 'report_id', type: 'uuid', nullable: false },
      { name: 'category_id', type: 'uuid', nullable: false },
      { name: 'payment_method_id', type: 'uuid', nullable: true },
      { name: 'merchant', type: 'varchar(255)', nullable: false },
      { name: 'description', type: 'text', nullable: true },
      { name: 'amount', type: 'numeric(12,2)', nullable: false },
      { name: 'currency', type: 'varchar(3)', default: "'USD'" },
      { name: 'expense_date', type: 'date', nullable: false },
      { name: 'is_billable', type: 'boolean', default: 'false' },
      { name: 'client_id', type: 'uuid', nullable: true },
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
    ],
  },
  {
    name: 'receipts',
    description: 'Receipt attachments and OCR data',
    columns: [
      { name: 'id', type: 'uuid', primary: true, default: 'gen_random_uuid()' },
      { name: 'expense_id', type: 'uuid', nullable: false },
      { name: 'file_name', type: 'varchar(255)', nullable: false },
      { name: 'file_url', type: 'text', nullable: false },
      { name: 'file_size', type: 'integer', nullable: true },
      { name: 'mime_type', type: 'varchar(100)', nullable: true },
      { name: 'ocr_data', type: 'jsonb', nullable: true },
      { name: 'uploaded_at', type: 'timestamptz', default: 'now()' },
    ],
  },
  {
    name: 'approvers',
    description: 'Approval chain configuration',
    columns: [
      { name: 'id', type: 'uuid', primary: true, default: 'gen_random_uuid()' },
      { name: 'department_id', type: 'uuid', nullable: true },
      { name: 'employee_id', type: 'uuid', nullable: false },
      { name: 'approval_level', type: 'integer', default: '1' },
      { name: 'max_approval_amount', type: 'numeric(12,2)', nullable: true },
      { name: 'can_approve_all', type: 'boolean', default: 'false' },
      { name: 'is_active', type: 'boolean', default: 'true' },
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
    ],
  },
  {
    name: 'approval_history',
    description: 'Audit trail for approval actions',
    columns: [
      { name: 'id', type: 'uuid', primary: true, default: 'gen_random_uuid()' },
      { name: 'report_id', type: 'uuid', nullable: false },
      { name: 'approver_id', type: 'uuid', nullable: false },
      { name: 'action', type: 'varchar(20)', nullable: false },
      { name: 'comments', type: 'text', nullable: true },
      { name: 'previous_status', type: 'varchar(20)', nullable: true },
      { name: 'new_status', type: 'varchar(20)', nullable: false },
      { name: 'created_at', type: 'timestamptz', default: 'now()' },
    ],
  },
];

async function createTable(table: TableDefinition): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/tables`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: table.name,
        columns: table.columns,
      }),
    });

    if (response.ok) {
      console.log(`✅ Created table: ${table.name}`);
      return true;
    } else {
      const error = await response.json();
      console.error(`❌ Failed to create ${table.name}:`, error.error || error);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error creating ${table.name}:`, error);
    return false;
  }
}

async function seedSampleData() {
  console.log('\n📊 Seeding sample data...\n');

  // Seed departments
  const departments = [
    { name: 'Engineering', code: 'ENG', budget_limit: 50000 },
    { name: 'Marketing', code: 'MKT', budget_limit: 30000 },
    { name: 'Sales', code: 'SLS', budget_limit: 40000 },
    { name: 'Human Resources', code: 'HR', budget_limit: 20000 },
    { name: 'Finance', code: 'FIN', budget_limit: 25000 },
  ];

  for (const dept of departments) {
    await fetch(`${API_URL}/tables/departments/rows`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dept),
    });
  }
  console.log('✅ Seeded departments');

  // Seed categories
  const categories = [
    { name: 'Travel', code: 'TRV', icon: 'plane', color: '#3b82f6' },
    { name: 'Meals & Entertainment', code: 'MEL', icon: 'utensils', color: '#f59e0b' },
    { name: 'Office Supplies', code: 'OFC', icon: 'paperclip', color: '#8b5cf6' },
    { name: 'Software & Subscriptions', code: 'SFT', icon: 'laptop', color: '#06b6d4' },
    { name: 'Training & Education', code: 'TRN', icon: 'book', color: '#10b981' },
    { name: 'Transportation', code: 'TRP', icon: 'car', color: '#6366f1' },
    { name: 'Accommodation', code: 'ACC', icon: 'building', color: '#ec4899' },
    { name: 'Communication', code: 'COM', icon: 'phone', color: '#14b8a6' },
  ];

  for (const cat of categories) {
    await fetch(`${API_URL}/tables/categories/rows`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(cat),
    });
  }
  console.log('✅ Seeded categories');

  // Seed employees
  const employees = [
    { email: 'john.doe@company.com', first_name: 'John', last_name: 'Doe', role: 'manager' },
    { email: 'jane.smith@company.com', first_name: 'Jane', last_name: 'Smith', role: 'employee' },
    { email: 'bob.wilson@company.com', first_name: 'Bob', last_name: 'Wilson', role: 'employee' },
    { email: 'alice.johnson@company.com', first_name: 'Alice', last_name: 'Johnson', role: 'admin' },
    { email: 'charlie.brown@company.com', first_name: 'Charlie', last_name: 'Brown', role: 'employee' },
  ];

  for (const emp of employees) {
    await fetch(`${API_URL}/tables/employees/rows`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emp),
    });
  }
  console.log('✅ Seeded employees');

  // Seed payment methods
  const paymentMethods = [
    { name: 'Corporate Visa', type: 'credit_card', last_four: '4532', is_corporate: true },
    { name: 'Corporate Amex', type: 'credit_card', last_four: '8901', is_corporate: true },
    { name: 'Petty Cash', type: 'cash', is_corporate: true },
    { name: 'Personal Card (Reimbursable)', type: 'personal', is_corporate: false },
  ];

  for (const pm of paymentMethods) {
    await fetch(`${API_URL}/tables/payment_methods/rows`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(pm),
    });
  }
  console.log('✅ Seeded payment methods');

  console.log('\n✨ Sample data seeded successfully!');
}

async function main() {
  console.log('🏗️  Creating Expense Management Schema');
  console.log('=====================================\n');

  let successCount = 0;
  let failCount = 0;

  for (const table of tables) {
    console.log(`📋 Creating: ${table.name} - ${table.description}`);
    const success = await createTable(table);
    if (success) successCount++;
    else failCount++;
  }

  console.log('\n=====================================');
  console.log(`✅ Created: ${successCount} tables`);
  if (failCount > 0) {
    console.log(`❌ Failed: ${failCount} tables`);
  }

  console.log('\n📊 Table Relationships:');
  console.log('  • employees.department_id → departments.id');
  console.log('  • departments.manager_id → employees.id');
  console.log('  • payment_methods.employee_id → employees.id');
  console.log('  • expense_policies.department_id → departments.id');
  console.log('  • expense_policies.category_id → categories.id');
  console.log('  • expense_reports.employee_id → employees.id');
  console.log('  • expense_reports.approved_by → employees.id');
  console.log('  • expenses.report_id → expense_reports.id');
  console.log('  • expenses.category_id → categories.id');
  console.log('  • expenses.payment_method_id → payment_methods.id');
  console.log('  • receipts.expense_id → expenses.id');
  console.log('  • approvers.department_id → departments.id');
  console.log('  • approvers.employee_id → employees.id');
  console.log('  • approval_history.report_id → expense_reports.id');
  console.log('  • approval_history.approver_id → employees.id');

  // Ask to seed sample data
  if (successCount > 0) {
    await seedSampleData();
  }
}

main().catch(console.error);
