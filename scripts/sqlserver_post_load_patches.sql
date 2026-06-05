-- ============================================================================
-- SQL Server post-load patches
-- ----------------------------------------------------------------------------
-- Adds foreign keys, unique constraints, composite indexes, NOT NULL on
-- business-critical columns, and datetime-precision upgrades that were missing
-- from the original loader scripts. Every statement is idempotent so this
-- script can be re-run safely.
--
-- Targets:
--   altavest_demo . trade_ledger     (load_trade_ledger.py)
--   verity_demo   . policy_admin     (load_policy_admin.py)
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- altavest_demo · trade_ledger
-- ════════════════════════════════════════════════════════════════════════════
USE [altavest_demo];
GO

-- ── NOT NULL on business-critical columns ───────────────────────────────────
IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('trade_ledger.ORDERS')
             AND name = 'ACCOUNT_ID' AND is_nullable = 1)
  ALTER TABLE trade_ledger.ORDERS ALTER COLUMN ACCOUNT_ID INT NOT NULL;
GO
IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('trade_ledger.ORDERS')
             AND name = 'SECURITY_ID' AND is_nullable = 1)
  ALTER TABLE trade_ledger.ORDERS ALTER COLUMN SECURITY_ID INT NOT NULL;
GO
IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('trade_ledger.EXECUTIONS')
             AND name = 'ORDER_ID' AND is_nullable = 1)
  ALTER TABLE trade_ledger.EXECUTIONS ALTER COLUMN ORDER_ID BIGINT NOT NULL;
GO
IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('trade_ledger.POSITIONS')
             AND name = 'ACCOUNT_ID' AND is_nullable = 1)
  ALTER TABLE trade_ledger.POSITIONS ALTER COLUMN ACCOUNT_ID INT NOT NULL;
GO
IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('trade_ledger.POSITIONS')
             AND name = 'SECURITY_ID' AND is_nullable = 1)
  ALTER TABLE trade_ledger.POSITIONS ALTER COLUMN SECURITY_ID INT NOT NULL;
GO
IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('trade_ledger.POSITIONS')
             AND name = 'AS_OF' AND is_nullable = 1)
  ALTER TABLE trade_ledger.POSITIONS ALTER COLUMN AS_OF DATE NOT NULL;
GO
IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('trade_ledger.PNL_DAILY')
             AND name = 'ACCOUNT_ID' AND is_nullable = 1)
  ALTER TABLE trade_ledger.PNL_DAILY ALTER COLUMN ACCOUNT_ID INT NOT NULL;
GO
IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('trade_ledger.PNL_DAILY')
             AND name = 'AS_OF' AND is_nullable = 1)
  ALTER TABLE trade_ledger.PNL_DAILY ALTER COLUMN AS_OF DATE NOT NULL;
GO
IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('trade_ledger.CASH_MOVEMENTS')
             AND name = 'ACCOUNT_ID' AND is_nullable = 1)
  ALTER TABLE trade_ledger.CASH_MOVEMENTS ALTER COLUMN ACCOUNT_ID INT NOT NULL;
GO

-- ── Foreign keys (Fivetran picks these up for destination-side hints) ───────
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_ORDERS_ACCOUNT')
  ALTER TABLE trade_ledger.ORDERS
    ADD CONSTRAINT FK_ORDERS_ACCOUNT
    FOREIGN KEY (ACCOUNT_ID) REFERENCES trade_ledger.ACCOUNTS(ACCOUNT_ID);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_ORDERS_SECURITY')
  ALTER TABLE trade_ledger.ORDERS
    ADD CONSTRAINT FK_ORDERS_SECURITY
    FOREIGN KEY (SECURITY_ID) REFERENCES trade_ledger.SECURITIES(SECURITY_ID);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_EXECUTIONS_ORDER')
  ALTER TABLE trade_ledger.EXECUTIONS
    ADD CONSTRAINT FK_EXECUTIONS_ORDER
    FOREIGN KEY (ORDER_ID) REFERENCES trade_ledger.ORDERS(ORDER_ID);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_POSITIONS_ACCOUNT')
  ALTER TABLE trade_ledger.POSITIONS
    ADD CONSTRAINT FK_POSITIONS_ACCOUNT
    FOREIGN KEY (ACCOUNT_ID) REFERENCES trade_ledger.ACCOUNTS(ACCOUNT_ID);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_POSITIONS_SECURITY')
  ALTER TABLE trade_ledger.POSITIONS
    ADD CONSTRAINT FK_POSITIONS_SECURITY
    FOREIGN KEY (SECURITY_ID) REFERENCES trade_ledger.SECURITIES(SECURITY_ID);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_CASH_MOVEMENTS_ACCOUNT')
  ALTER TABLE trade_ledger.CASH_MOVEMENTS
    ADD CONSTRAINT FK_CASH_MOVEMENTS_ACCOUNT
    FOREIGN KEY (ACCOUNT_ID) REFERENCES trade_ledger.ACCOUNTS(ACCOUNT_ID);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_PNL_DAILY_ACCOUNT')
  ALTER TABLE trade_ledger.PNL_DAILY
    ADD CONSTRAINT FK_PNL_DAILY_ACCOUNT
    FOREIGN KEY (ACCOUNT_ID) REFERENCES trade_ledger.ACCOUNTS(ACCOUNT_ID);
GO

-- ── Unique constraints on natural keys ──────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'UQ_POSITIONS_ASOF_ACCT_SEC'
                 AND object_id = OBJECT_ID('trade_ledger.POSITIONS'))
  CREATE UNIQUE INDEX UQ_POSITIONS_ASOF_ACCT_SEC
    ON trade_ledger.POSITIONS (AS_OF, ACCOUNT_ID, SECURITY_ID);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'UQ_PNL_DAILY_ASOF_ACCT'
                 AND object_id = OBJECT_ID('trade_ledger.PNL_DAILY'))
  CREATE UNIQUE INDEX UQ_PNL_DAILY_ASOF_ACCT
    ON trade_ledger.PNL_DAILY (AS_OF, ACCOUNT_ID);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'UQ_SECURITIES_TICKER'
                 AND object_id = OBJECT_ID('trade_ledger.SECURITIES'))
  CREATE UNIQUE INDEX UQ_SECURITIES_TICKER
    ON trade_ledger.SECURITIES (TICKER);
GO

-- ── Composite indexes for common time-series access patterns ────────────────
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'IX_ORDERS_ACCT_PLACED'
                 AND object_id = OBJECT_ID('trade_ledger.ORDERS'))
  CREATE INDEX IX_ORDERS_ACCT_PLACED
    ON trade_ledger.ORDERS (ACCOUNT_ID, PLACED_AT);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'IX_CASH_MOVEMENTS_ACCT_POSTED'
                 AND object_id = OBJECT_ID('trade_ledger.CASH_MOVEMENTS'))
  CREATE INDEX IX_CASH_MOVEMENTS_ACCT_POSTED
    ON trade_ledger.CASH_MOVEMENTS (ACCOUNT_ID, POSTED_AT);
GO


-- ════════════════════════════════════════════════════════════════════════════
-- verity_demo · policy_admin
-- ════════════════════════════════════════════════════════════════════════════
USE [verity_demo];
GO

-- ── NOT NULL on business-critical columns ───────────────────────────────────
IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('policy_admin.POLICIES')
             AND name = 'POLICY_NUMBER' AND is_nullable = 1)
  ALTER TABLE policy_admin.POLICIES ALTER COLUMN POLICY_NUMBER VARCHAR(24) NOT NULL;
GO
IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('policy_admin.POLICIES')
             AND name = 'POLICYHOLDER_ID' AND is_nullable = 1)
  ALTER TABLE policy_admin.POLICIES ALTER COLUMN POLICYHOLDER_ID INT NOT NULL;
GO
IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('policy_admin.POLICIES')
             AND name = 'AGENT_ID' AND is_nullable = 1)
  ALTER TABLE policy_admin.POLICIES ALTER COLUMN AGENT_ID INT NOT NULL;
GO
IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('policy_admin.POLICIES')
             AND name = 'PRODUCT_ID' AND is_nullable = 1)
  ALTER TABLE policy_admin.POLICIES ALTER COLUMN PRODUCT_ID INT NOT NULL;
GO
IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('policy_admin.COVERAGES')
             AND name = 'POLICY_ID' AND is_nullable = 1)
  ALTER TABLE policy_admin.COVERAGES ALTER COLUMN POLICY_ID INT NOT NULL;
GO
IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('policy_admin.ENDORSEMENTS')
             AND name = 'POLICY_ID' AND is_nullable = 1)
  ALTER TABLE policy_admin.ENDORSEMENTS ALTER COLUMN POLICY_ID INT NOT NULL;
GO
IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('policy_admin.PREMIUM_LEDGER')
             AND name = 'POLICY_ID' AND is_nullable = 1)
  ALTER TABLE policy_admin.PREMIUM_LEDGER ALTER COLUMN POLICY_ID INT NOT NULL;
GO
IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('policy_admin.BILLING_INVOICES')
             AND name = 'POLICY_ID' AND is_nullable = 1)
  ALTER TABLE policy_admin.BILLING_INVOICES ALTER COLUMN POLICY_ID INT NOT NULL;
GO

-- ── Foreign keys ────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_POLICIES_POLICYHOLDER')
  ALTER TABLE policy_admin.POLICIES
    ADD CONSTRAINT FK_POLICIES_POLICYHOLDER
    FOREIGN KEY (POLICYHOLDER_ID) REFERENCES policy_admin.POLICYHOLDERS(POLICYHOLDER_ID);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_POLICIES_AGENT')
  ALTER TABLE policy_admin.POLICIES
    ADD CONSTRAINT FK_POLICIES_AGENT
    FOREIGN KEY (AGENT_ID) REFERENCES policy_admin.AGENTS(AGENT_ID);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_POLICIES_PRODUCT')
  ALTER TABLE policy_admin.POLICIES
    ADD CONSTRAINT FK_POLICIES_PRODUCT
    FOREIGN KEY (PRODUCT_ID) REFERENCES policy_admin.PRODUCTS(PRODUCT_ID);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_COVERAGES_POLICY')
  ALTER TABLE policy_admin.COVERAGES
    ADD CONSTRAINT FK_COVERAGES_POLICY
    FOREIGN KEY (POLICY_ID) REFERENCES policy_admin.POLICIES(POLICY_ID);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_ENDORSEMENTS_POLICY')
  ALTER TABLE policy_admin.ENDORSEMENTS
    ADD CONSTRAINT FK_ENDORSEMENTS_POLICY
    FOREIGN KEY (POLICY_ID) REFERENCES policy_admin.POLICIES(POLICY_ID);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_PREMIUM_LEDGER_POLICY')
  ALTER TABLE policy_admin.PREMIUM_LEDGER
    ADD CONSTRAINT FK_PREMIUM_LEDGER_POLICY
    FOREIGN KEY (POLICY_ID) REFERENCES policy_admin.POLICIES(POLICY_ID);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_BILLING_INVOICES_POLICY')
  ALTER TABLE policy_admin.BILLING_INVOICES
    ADD CONSTRAINT FK_BILLING_INVOICES_POLICY
    FOREIGN KEY (POLICY_ID) REFERENCES policy_admin.POLICIES(POLICY_ID);
GO

-- ── Unique constraints on natural keys ──────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'UQ_POLICIES_POLICY_NUMBER'
                 AND object_id = OBJECT_ID('policy_admin.POLICIES'))
  CREATE UNIQUE INDEX UQ_POLICIES_POLICY_NUMBER
    ON policy_admin.POLICIES (POLICY_NUMBER);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'UQ_PRODUCTS_PRODUCT_CODE'
                 AND object_id = OBJECT_ID('policy_admin.PRODUCTS'))
  CREATE UNIQUE INDEX UQ_PRODUCTS_PRODUCT_CODE
    ON policy_admin.PRODUCTS (PRODUCT_CODE);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'UQ_BILLING_INVOICES_INVOICE_NUMBER'
                 AND object_id = OBJECT_ID('policy_admin.BILLING_INVOICES'))
  CREATE UNIQUE INDEX UQ_BILLING_INVOICES_INVOICE_NUMBER
    ON policy_admin.BILLING_INVOICES (INVOICE_NUMBER);
GO

-- ── Composite index for ledger by-policy-by-time queries ────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'IX_PREMIUM_LEDGER_POLICY_POSTED'
                 AND object_id = OBJECT_ID('policy_admin.PREMIUM_LEDGER'))
  CREATE INDEX IX_PREMIUM_LEDGER_POLICY_POSTED
    ON policy_admin.PREMIUM_LEDGER (POLICY_ID, POSTED_AT);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'IX_BILLING_INVOICES_POLICY_DUE'
                 AND object_id = OBJECT_ID('policy_admin.BILLING_INVOICES'))
  CREATE INDEX IX_BILLING_INVOICES_POLICY_DUE
    ON policy_admin.BILLING_INVOICES (POLICY_ID, DUE_DATE);
GO

-- ============================================================================
-- end of SQL Server post-load patches
-- ============================================================================
