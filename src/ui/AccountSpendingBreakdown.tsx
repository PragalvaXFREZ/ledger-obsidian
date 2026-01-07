import type { TransactionCache } from '../parser';
import { Moment } from 'moment';
import React from 'react';
import styled from 'styled-components';
import {
  calculateExpenseBreakdown,
  calculateClosingNetWorth,
  calculateAssetBreakdown,
} from '../account-spending-utils';

const Container = styled.div`
  margin-top: 1rem;
  margin-bottom: 1rem;
`;

const TableWrapper = styled.div`
  overflow-x: auto;
`;

const Table = styled.table`
  width: 100%;
  border-spacing: 0;
  border: 1px solid var(--background-modifier-border);

  th,
  td {
    padding: 0.5rem;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  th {
    text-align: left;
    background: var(--background-primary-alt);
  }

  tr:last-child td {
    border-bottom: 0;
  }
`;

const EmptyState = styled.p`
  color: var(--text-muted);
  margin: 0.5rem 0 0;
`;

const SummaryRow = styled.tr`
  font-weight: bold;
  background: var(--background-secondary);
`;

const ClickableRow = styled(SummaryRow)`
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover {
    background: var(--background-modifier-hover);
  }
`;

const SubRow = styled.tr`
  background: var(--background-secondary-alt);
  font-size: 0.9em;

  td:first-child {
    padding-left: 1.5rem;
  }
`;

const DeepSubRow = styled.tr`
  background: var(--background-secondary-alt);
  font-size: 0.85em;

  td:first-child {
    padding-left: 2.5rem;
  }
`;

const formatAmount = (value: number, symbol: string): string => {
  return `${symbol}${Math.abs(value).toFixed(2)}`;
};

const formatSignedAmount = (value: number, symbol: string): string => {
  const sign = value < 0 ? '-' : '';
  return `${sign}${symbol}${Math.abs(value).toFixed(2)}`;
};

interface AccountSpendingBreakdownProps {
  txCache: TransactionCache;
  startDate: Moment;
  endDate: Moment;
  currencySymbol: string;
  expensePrefix: string;
  assetPrefix: string;
  liabilityPrefix: string;
}

export const AccountSpendingBreakdown: React.FC<AccountSpendingBreakdownProps> = (
  props,
): JSX.Element => {
  const [isAssetBreakdownExpanded, setIsAssetBreakdownExpanded] = React.useState(false);
  const [expandedCategories, setExpandedCategories] = React.useState<Set<string>>(new Set());
  const [expandedAssetCategories, setExpandedAssetCategories] = React.useState<Set<string>>(new Set());

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const toggleAssetCategory = (category: string) => {
    setExpandedAssetCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  // Calculate expense breakdown by category for the selected period
  const { rows, totalExpenses } = React.useMemo(
    () =>
      calculateExpenseBreakdown(
        props.txCache.transactions,
        props.expensePrefix,
        props.startDate,
        props.endDate,
      ),
    [props.txCache, props.expensePrefix, props.startDate, props.endDate],
  );

  // Calculate closing net worth as of endDate (all transactions from beginning of time up to endDate)
  const closingNetWorth = React.useMemo(
    () =>
      calculateClosingNetWorth(
        props.txCache.transactions,
        props.assetPrefix,
        props.liabilityPrefix,
        props.endDate,
      ),
    [props.txCache, props.assetPrefix, props.liabilityPrefix, props.endDate],
  );

  // Calculate asset breakdown by category
  const assetBreakdown = React.useMemo(
    () =>
      calculateAssetBreakdown(
        props.txCache.transactions,
        props.assetPrefix,
        props.liabilityPrefix,
        props.endDate,
      ),
    [props.txCache, props.assetPrefix, props.liabilityPrefix, props.endDate],
  );

  if (rows.length === 0) {
    return (
      <Container>
        <h3>Spending Breakdown</h3>
        <EmptyState>No expenses found in this period.</EmptyState>
      </Container>
    );
  }

  return (
    <Container>
      <h3>Spending Breakdown</h3>
      <TableWrapper>
        <Table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Amount</th>
              <th>% of Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const hasSubcategories = row.subcategories && row.subcategories.length > 0;
              const isExpanded = expandedCategories.has(row.category);

              return (
                <React.Fragment key={row.category}>
                  {hasSubcategories ? (
                    <ClickableRow
                      onClick={() => toggleCategory(row.category)}
                      title="Click to expand subcategories"
                    >
                      <td>
                        {isExpanded ? '▼' : '▶'} {row.category}
                      </td>
                      <td>{formatAmount(row.amount, props.currencySymbol)}</td>
                      <td>
                        {row.percentage < 0.1
                          ? '< 0.1%'
                          : `${row.percentage.toFixed(1)}%`}
                      </td>
                    </ClickableRow>
                  ) : (
                    <tr>
                      <td>{row.category}</td>
                      <td>{formatAmount(row.amount, props.currencySymbol)}</td>
                      <td>
                        {row.percentage < 0.1
                          ? '< 0.1%'
                          : `${row.percentage.toFixed(1)}%`}
                      </td>
                    </tr>
                  )}
                  {hasSubcategories &&
                    isExpanded &&
                    row.subcategories!.map((subrow) => (
                      <SubRow key={subrow.category}>
                        <td>{subrow.category}</td>
                        <td>{formatAmount(subrow.amount, props.currencySymbol)}</td>
                        <td>
                          {subrow.percentage < 0.1
                            ? '< 0.1%'
                            : `${subrow.percentage.toFixed(1)}%`}
                        </td>
                      </SubRow>
                    ))}
                </React.Fragment>
              );
            })}
            <SummaryRow>
              <td>Total Period Expenses</td>
              <td>{formatAmount(totalExpenses, props.currencySymbol)}</td>
              <td>100%</td>
            </SummaryRow>
            <ClickableRow
              onClick={() => setIsAssetBreakdownExpanded(!isAssetBreakdownExpanded)}
              title="Click to expand asset breakdown"
            >
              <td>
                {isAssetBreakdownExpanded ? '▼' : '▶'} Total Assets Remaining
              </td>
              <td>{formatSignedAmount(closingNetWorth, props.currencySymbol)}</td>
              <td></td>
            </ClickableRow>
            {isAssetBreakdownExpanded &&
              assetBreakdown.map((row) => {
                const hasSubcategories = row.subcategories && row.subcategories.length > 0;
                const isExpanded = expandedAssetCategories.has(row.category);

                return (
                  <React.Fragment key={row.category}>
                    {hasSubcategories ? (
                      <SubRow
                        as={ClickableRow}
                        onClick={() => toggleAssetCategory(row.category)}
                        title="Click to expand subcategories"
                      >
                        <td>
                          {isExpanded ? '▼' : '▶'} {row.category}
                        </td>
                        <td>{formatSignedAmount(row.amount, props.currencySymbol)}</td>
                        <td></td>
                      </SubRow>
                    ) : (
                      <SubRow>
                        <td>{row.category}</td>
                        <td>{formatSignedAmount(row.amount, props.currencySymbol)}</td>
                        <td></td>
                      </SubRow>
                    )}
                    {hasSubcategories &&
                      isExpanded &&
                      row.subcategories!.map((subrow) => (
                        <DeepSubRow key={subrow.category}>
                          <td>{subrow.category}</td>
                          <td>{formatSignedAmount(subrow.amount, props.currencySymbol)}</td>
                          <td></td>
                        </DeepSubRow>
                      ))}
                  </React.Fragment>
                );
              })}
          </tbody>
        </Table>
      </TableWrapper>
    </Container>
  );
};
