/**
 * Test data generator utilities for integration testing
 * Provides methods to generate realistic test data for various scenarios
 */

export interface TestUser {
  id?: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt?: string;
  active?: boolean;
}

export interface TestProduct {
  id?: number;
  name: string;
  description: string;
  price: number;
  category: string;
  sku: string;
  inStock?: boolean;
  createdAt?: string;
}

export interface TestOrder {
  id?: number;
  userId: number;
  productId: number;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  orderDate?: string | undefined;
  shippedDate?: string | undefined;
}

export interface TestSchema {
  name: string;
  tables: TestTable[];
  views: TestView[];
  functions: TestFunction[];
  indexes: TestIndex[];
}

export interface TestTable {
  name: string;
  columns: TestColumn[];
  primaryKey?: string[];
  foreignKeys?: TestForeignKey[];
  indexes?: TestIndex[];
}

export interface TestColumn {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: string;
  isPrimaryKey?: boolean;
}

export interface TestForeignKey {
  column: string;
  referencedTable: string;
  referencedColumn: string;
}

export interface TestView {
  name: string;
  definition: string;
}

export interface TestFunction {
  name: string;
  parameters: TestFunctionParameter[];
  returnType: string;
  language: string;
  definition: string;
}

export interface TestFunctionParameter {
  name: string;
  type: string;
}

export interface TestIndex {
  name: string;
  table: string;
  columns: string[];
  isUnique: boolean;
}

export class TestDataGenerator {
  private static usedUsernames = new Set<string>();
  private static usedEmails = new Set<string>();
  private static usedSkus = new Set<string>();

  /**
   * Generate a random string of specified length
   */
  static generateRandomString(length: number, charset: string = 'abcdefghijklmnopqrstuvwxyz'): string {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return result;
  }

  /**
   * Generate a unique username
   */
  static generateUsername(): string {
    const adjectives = ['happy', 'clever', 'swift', 'bright', 'calm', 'eager', 'fair', 'gentle', 'kind', 'lively'];
    const nouns = ['developer', 'analyst', 'manager', 'designer', 'engineer', 'specialist', 'consultant', 'architect'];

    let username: string;
    let attempts = 0;

    do {
      const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
      const noun = nouns[Math.floor(Math.random() * nouns.length)];
      const number = Math.floor(Math.random() * 999) + 1;
      username = `${adjective}${noun}${number}`;
      attempts++;
    } while (this.usedUsernames.has(username) && attempts < 10);

    this.usedUsernames.add(username);
    return username;
  }

  /**
   * Generate a unique email address
   */
  static generateEmail(): string {
    const domains = ['example.com', 'test.org', 'demo.net', 'sample.io'];
    let email: string;
    let attempts = 0;

    do {
      const username = this.generateRandomString(8, 'abcdefghijklmnopqrstuvwxyz0123456789');
      const domain = domains[Math.floor(Math.random() * domains.length)];
      email = `${username}@${domain}`;
      attempts++;
    } while (this.usedEmails.has(email) && attempts < 10);

    this.usedEmails.add(email);
    return email;
  }

  /**
   * Generate a unique SKU
   */
  static generateSku(): string {
    let sku: string;
    let attempts = 0;

    do {
      sku = `SKU-${this.generateRandomString(3, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ')}${Math.floor(Math.random() * 9999).toString().padStart(4, '0')}`;
      attempts++;
    } while (this.usedSkus.has(sku) && attempts < 10);

    this.usedSkus.add(sku);
    return sku;
  }

  /**
   * Generate a random user
   */
  static generateUser(overrides: Partial<TestUser> = {}): TestUser {
    const firstNames = ['John', 'Jane', 'Michael', 'Sarah', 'David', 'Emma', 'Chris', 'Lisa', 'Mark', 'Anna'];
    const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'];

    return {
      username: this.generateUsername(),
      email: this.generateEmail(),
      firstName: firstNames[Math.floor(Math.random() * firstNames.length)],
      lastName: lastNames[Math.floor(Math.random() * lastNames.length)],
      createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
      active: Math.random() > 0.1, // 90% active users
      ...overrides
    };
  }

  /**
   * Generate multiple users
   */
  static generateUsers(count: number, overrides: Partial<TestUser> = {}): TestUser[] {
    return Array.from({ length: count }, () => this.generateUser(overrides));
  }

  /**
   * Generate a random product
   */
  static generateProduct(overrides: Partial<TestProduct> = {}): TestProduct {
    const categories = ['Electronics', 'Books', 'Clothing', 'Home & Garden', 'Sports', 'Toys', 'Automotive', 'Health'];
    const adjectives = ['Premium', 'Deluxe', 'Basic', 'Professional', 'Compact', 'Portable', 'Wireless', 'Smart'];

    const category = categories[Math.floor(Math.random() * categories.length)];
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = this.generateRandomString(6, 'abcdefghijklmnopqrstuvwxyz');

    return {
      name: `${adjective} ${noun.charAt(0).toUpperCase() + noun.slice(1)}`,
      description: `A high-quality ${category.toLowerCase()} product with excellent features and reliable performance.`,
      price: Math.floor(Math.random() * 1000) + 10, // $10 to $1010
      category,
      sku: this.generateSku(),
      inStock: Math.random() > 0.2, // 80% in stock
      createdAt: new Date(Date.now() - Math.random() * 180 * 24 * 60 * 60 * 1000).toISOString(),
      ...overrides
    };
  }

  /**
   * Generate multiple products
   */
  static generateProducts(count: number, overrides: Partial<TestProduct> = {}): TestProduct[] {
    return Array.from({ length: count }, () => this.generateProduct(overrides));
  }

  /**
   * Generate a random order
   */
  static generateOrder(userId: number, productId: number, overrides: Partial<TestOrder> = {}): TestOrder {
    const statuses: TestOrder['status'][] = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
    const quantity = Math.floor(Math.random() * 5) + 1; // 1 to 5 items
    const unitPrice = Math.floor(Math.random() * 100) + 10; // $10 to $110

    return {
      userId,
      productId,
      quantity,
      unitPrice,
      totalAmount: quantity * unitPrice,
      status: statuses[Math.floor(Math.random() * statuses.length)],
      orderDate: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
      shippedDate: Math.random() > 0.5 ? new Date(Date.now() - Math.random() * 10 * 24 * 60 * 60 * 1000).toISOString() : undefined,
      ...overrides
    };
  }

  /**
   * Generate multiple orders for given users and products
   */
  static generateOrders(users: TestUser[], products: TestProduct[], count: number): TestOrder[] {
    const orders: TestOrder[] = [];

    for (let i = 0; i < count; i++) {
      const user = users[Math.floor(Math.random() * users.length)];
      const product = products[Math.floor(Math.random() * products.length)];

      if (user.id && product.id) {
        orders.push(this.generateOrder(user.id, product.id));
      }
    }

    return orders;
  }

  /**
   * Generate a complete test schema
   */
  static generateTestSchema(schemaName: string = 'test_schema'): TestSchema {
    return {
      name: schemaName,
      tables: [
        {
          name: 'users',
          columns: [
            { name: 'id', type: 'SERIAL', nullable: false, isPrimaryKey: true },
            { name: 'username', type: 'VARCHAR(50)', nullable: false },
            { name: 'email', type: 'VARCHAR(100)', nullable: false },
            { name: 'first_name', type: 'VARCHAR(50)', nullable: true },
            { name: 'last_name', type: 'VARCHAR(50)', nullable: true },
            { name: 'created_at', type: 'TIMESTAMP', nullable: true, defaultValue: 'CURRENT_TIMESTAMP' },
            { name: 'active', type: 'BOOLEAN', nullable: true, defaultValue: 'true' }
          ],
          primaryKey: ['id'],
          indexes: [
            { name: 'idx_users_username', table: 'users', columns: ['username'], isUnique: true },
            { name: 'idx_users_email', table: 'users', columns: ['email'], isUnique: true }
          ]
        },
        {
          name: 'products',
          columns: [
            { name: 'id', type: 'SERIAL', nullable: false, isPrimaryKey: true },
            { name: 'name', type: 'VARCHAR(100)', nullable: false },
            { name: 'description', type: 'TEXT', nullable: true },
            { name: 'price', type: 'DECIMAL(10,2)', nullable: false },
            { name: 'category', type: 'VARCHAR(50)', nullable: true },
            { name: 'sku', type: 'VARCHAR(20)', nullable: false },
            { name: 'in_stock', type: 'BOOLEAN', nullable: true, defaultValue: 'true' },
            { name: 'created_at', type: 'TIMESTAMP', nullable: true, defaultValue: 'CURRENT_TIMESTAMP' }
          ],
          primaryKey: ['id'],
          indexes: [
            { name: 'idx_products_sku', table: 'products', columns: ['sku'], isUnique: true },
            { name: 'idx_products_category', table: 'products', columns: ['category'], isUnique: false }
          ]
        },
        {
          name: 'orders',
          columns: [
            { name: 'id', type: 'SERIAL', nullable: false, isPrimaryKey: true },
            { name: 'user_id', type: 'INTEGER', nullable: false },
            { name: 'product_id', type: 'INTEGER', nullable: false },
            { name: 'quantity', type: 'INTEGER', nullable: false },
            { name: 'unit_price', type: 'DECIMAL(8,2)', nullable: false },
            { name: 'total_amount', type: 'DECIMAL(10,2)', nullable: false },
            { name: 'status', type: 'VARCHAR(20)', nullable: false, defaultValue: "'pending'" },
            { name: 'order_date', type: 'TIMESTAMP', nullable: true, defaultValue: 'CURRENT_TIMESTAMP' },
            { name: 'shipped_date', type: 'TIMESTAMP', nullable: true }
          ],
          primaryKey: ['id'],
          foreignKeys: [
            { column: 'user_id', referencedTable: 'users', referencedColumn: 'id' },
            { column: 'product_id', referencedTable: 'products', referencedColumn: 'id' }
          ],
          indexes: [
            { name: 'idx_orders_user_id', table: 'orders', columns: ['user_id'], isUnique: false },
            { name: 'idx_orders_status', table: 'orders', columns: ['status'], isUnique: false }
          ]
        }
      ],
      views: [
        {
          name: 'active_users',
          definition: `SELECT id, username, email, first_name, last_name, created_at FROM ${schemaName}.users WHERE active = true`
        },
        {
          name: 'product_summary',
          definition: `SELECT p.id, p.name, p.price, p.category, COUNT(o.id) as order_count FROM ${schemaName}.products p LEFT JOIN ${schemaName}.orders o ON p.id = o.product_id GROUP BY p.id, p.name, p.price, p.category`
        }
      ],
      functions: [
        {
          name: 'get_user_order_count',
          parameters: [
            { name: 'user_id_param', type: 'INTEGER' }
          ],
          returnType: 'INTEGER',
          language: 'plpgsql',
          definition: `
            BEGIN
              RETURN (
                SELECT COUNT(*)
                FROM ${schemaName}.orders
                WHERE user_id = user_id_param
              );
            END;
          `
        },
        {
          name: 'calculate_total_revenue',
          parameters: [
            { name: 'start_date', type: 'TIMESTAMP' },
            { name: 'end_date', type: 'TIMESTAMP' }
          ],
          returnType: 'DECIMAL(12,2)',
          language: 'plpgsql',
          definition: `
            BEGIN
              RETURN (
                SELECT COALESCE(SUM(total_amount), 0)
                FROM ${schemaName}.orders
                WHERE order_date BETWEEN start_date AND end_date
                AND status = 'delivered'
              );
            END;
          `
        }
      ],
      indexes: [
        { name: 'idx_users_username', table: 'users', columns: ['username'], isUnique: true },
        { name: 'idx_users_email', table: 'users', columns: ['email'], isUnique: true },
        { name: 'idx_products_sku', table: 'products', columns: ['sku'], isUnique: true },
        { name: 'idx_products_category', table: 'products', columns: ['category'], isUnique: false },
        { name: 'idx_orders_user_id', table: 'orders', columns: ['user_id'], isUnique: false },
        { name: 'idx_orders_status', table: 'orders', columns: ['status'], isUnique: false }
      ]
    };
  }

  /**
   * Generate SQL insert statements for users
   */
  static generateUserInserts(users: TestUser[]): string {
    const values = users.map(user =>
      `('${user.username}', '${user.email}', '${user.firstName}', '${user.lastName}', ${user.active ? 'true' : 'false'})`
    ).join(',\n      ');

    return `
      INSERT INTO users (username, email, first_name, last_name, active) VALUES
      ${values};
    `;
  }

  /**
   * Generate SQL insert statements for products
   */
  static generateProductInserts(products: TestProduct[]): string {
    const values = products.map(product =>
      `('${product.name}', '${product.description}', ${product.price}, '${product.category}', '${product.sku}', ${product.inStock ? 'true' : 'false'})`
    ).join(',\n      ');

    return `
      INSERT INTO products (name, description, price, category, sku, in_stock) VALUES
      ${values};
    `;
  }

  /**
   * Generate SQL insert statements for orders
   */
  static generateOrderInserts(orders: TestOrder[]): string {
    const values = orders.map(order =>
      `(${order.userId}, ${order.productId}, ${order.quantity}, ${order.unitPrice}, ${order.totalAmount}, '${order.status}', '${order.orderDate || new Date().toISOString()}')`
    ).join(',\n      ');

    return `
      INSERT INTO orders (user_id, product_id, quantity, unit_price, total_amount, status, order_date) VALUES
      ${values};
    `;
  }

  /**
   * Generate a complete test database setup script
   */
  static generateDatabaseSetupScript(schema: TestSchema, users: TestUser[], products: TestProduct[], orders: TestOrder[]): string {
    const schemaSql = this.generateSchemaSql(schema);
    const userInserts = this.generateUserInserts(users);
    const productInserts = this.generateProductInserts(products);
    const orderInserts = this.generateOrderInserts(orders);

    return `
      -- Test database setup script
      ${schemaSql}

      -- Insert test data
      ${userInserts}
      ${productInserts}
      ${orderInserts}
    `;
  }

  /**
   * Generate SQL for creating schema objects
   */
  static generateSchemaSql(schema: TestSchema): string {
    const tableSqls = schema.tables.map(table => `
      CREATE TABLE ${schema.name}.${table.name} (
        ${table.columns.map(col => {
      let sql = `  ${col.name} ${col.type}`;
      if (!col.nullable) sql += ' NOT NULL';
      if (col.defaultValue) sql += ` DEFAULT ${col.defaultValue}`;
      return sql;
    }).join(',\n        ')}
      );

      ${table.primaryKey ? `ALTER TABLE ${schema.name}.${table.name} ADD PRIMARY KEY (${table.primaryKey.join(', ')});` : ''}
    `).join('\n\n');

    const foreignKeySqls = schema.tables
      .filter(table => table.foreignKeys && table.foreignKeys.length > 0)
      .map(table => table.foreignKeys!.map(fk =>
        `ALTER TABLE ${schema.name}.${table.name} ADD CONSTRAINT fk_${table.name}_${fk.column} FOREIGN KEY (${fk.column}) REFERENCES ${schema.name}.${fk.referencedTable}(${fk.referencedColumn});`
      ).join('\n'))
      .join('\n');

    const viewSqls = schema.views.map(view =>
      `CREATE VIEW ${schema.name}.${view.name} AS\n  ${view.definition};`
    ).join('\n\n');

    const functionSqls = schema.functions.map(func =>
      `CREATE OR REPLACE FUNCTION ${schema.name}.${func.name}(${func.parameters.map(p => `${p.name} ${p.type}`).join(', ')})
       RETURNS ${func.returnType} AS $$
      ${func.definition}
       $$ LANGUAGE ${func.language};`
    ).join('\n\n');

    return `
      -- Create schema
      CREATE SCHEMA IF NOT EXISTS ${schema.name};

      -- Create tables
      ${tableSqls}

      -- Create foreign keys
      ${foreignKeySqls}

      -- Create views
      ${viewSqls}

      -- Create functions
      ${functionSqls}
    `;
  }

  /**
   * Generate test data for performance testing
   */
  static generatePerformanceTestData(userCount: number, productCount: number, orderCount: number): {
    users: TestUser[];
    products: TestProduct[];
    orders: TestOrder[];
  } {
    const users = this.generateUsers(userCount);

    // Add IDs to users
    users.forEach((user, index) => {
      user.id = index + 1;
    });

    const products = this.generateProducts(productCount);

    // Add IDs to products
    products.forEach((product, index) => {
      product.id = index + 1;
    });

    const orders = this.generateOrders(users, products, orderCount);

    // Add IDs to orders
    orders.forEach((order, index) => {
      order.id = index + 1;
    });

    return { users, products, orders };
  }

  /**
   * Clear used data sets for fresh generation
   */
  static clearUsedData(): void {
    this.usedUsernames.clear();
    this.usedEmails.clear();
    this.usedSkus.clear();
  }
}