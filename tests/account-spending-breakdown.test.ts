import {
  calculateExpenseBreakdown,
  calculateClosingNetWorth,
} from '../src/account-spending-utils';
import { EnhancedExpenseLine, EnhancedTransaction, FileBlock } from '../src/parser';
import * as moment from 'moment';

declare global {
  interface Window {
    moment: typeof moment;
  }
}

window.moment = moment as typeof window.moment;

const emptyBlock: FileBlock = {
  firstLine: -1,
  lastLine: -1,
  block: '',
};

const makeLine = (account: string, amount: number): EnhancedExpenseLine => ({
  account,
  dealiasedAccount: account,
  amount,
  reconcile: '',
});

const makeTx = (date: string, lines: EnhancedExpenseLine[]): EnhancedTransaction => ({
  type: 'tx',
  blockLine: -1,
  block: emptyBlock,
  value: {
    date,
    payee: 'Test',
    expenselines: lines,
  },
});

describe('calculateExpenseBreakdown', () => {
  test('groups expenses by category and calculates percentages', () => {
    const transactions = [
      makeTx('2022-01-05', [
        makeLine('Expenses:Food:Groceries', 40),
        makeLine('Assets:Checking', -40),
      ]),
      makeTx('2022-01-06', [
        makeLine('Expenses:Food:Dining', 25),
        makeLine('Assets:Checking', -25),
      ]),
      makeTx('2022-01-10', [
        makeLine('Expenses:Entertainment', 35),
        makeLine('Assets:Checking', -35),
      ]),
    ];

    const result = calculateExpenseBreakdown(
      transactions,
      'Expenses',
      moment('2022-01-01'),
      moment('2022-01-31'),
    );

    // Total expenses = 40 + 25 + 35 = 100
    expect(result.totalExpenses).toBe(100);

    // Two parent categories: Food (65) and Entertainment (35)
    expect(result.rows).toHaveLength(2);

    // Food category with subcategories
    expect(result.rows[0].category).toBe('Food');
    expect(result.rows[0].amount).toBe(65);
    expect(result.rows[0].percentage).toBe(65); // 65/100 * 100
    expect(result.rows[0].subcategories).toHaveLength(2);
    expect(result.rows[0].subcategories![0]).toEqual({
      category: 'Groceries',
      amount: 40,
      percentage: (40 / 65) * 100, // percentage relative to parent
    });
    expect(result.rows[0].subcategories![1]).toEqual({
      category: 'Dining',
      amount: 25,
      percentage: (25 / 65) * 100, // percentage relative to parent
    });

    // Entertainment category without subcategories
    expect(result.rows[1].category).toBe('Entertainment');
    expect(result.rows[1].amount).toBe(35);
    expect(result.rows[1].percentage).toBe(35); // 35/100 * 100
    expect(result.rows[1].subcategories).toBeUndefined();
  });

  test('ignores transactions outside of the date range', () => {
    const transactions = [
      makeTx('2022-01-15', [
        makeLine('Expenses:Travel', 100),
        makeLine('Assets:Checking', -100),
      ]),
      makeTx('2022-02-15', [
        makeLine('Expenses:Travel', 200),
        makeLine('Assets:Checking', -200),
      ]),
    ];

    const result = calculateExpenseBreakdown(
      transactions,
      'Expenses',
      moment('2022-01-01'),
      moment('2022-01-31'),
    );

    // Only January transaction should be included
    expect(result.totalExpenses).toBe(100);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].category).toBe('Travel');
    expect(result.rows[0].amount).toBe(100);
  });

  test('returns empty result when no expenses in range', () => {
    const transactions = [
      makeTx('2022-03-01', [
        makeLine('Expenses:Utilities', 50),
        makeLine('Assets:Checking', -50),
      ]),
    ];

    const result = calculateExpenseBreakdown(
      transactions,
      'Expenses',
      moment('2022-01-01'),
      moment('2022-01-31'),
    );

    expect(result.totalExpenses).toBe(0);
    expect(result.rows).toHaveLength(0);
  });

  test('handles deeply nested categories', () => {
    const transactions = [
      makeTx('2022-01-05', [
        makeLine('Expenses:Food:Restaurant:FastFood', 20),
        makeLine('Assets:Checking', -20),
      ]),
      makeTx('2022-01-06', [
        makeLine('Expenses:Food:Restaurant:Dining', 30),
        makeLine('Assets:Checking', -30),
      ]),
      makeTx('2022-01-10', [
        makeLine('Expenses:Food:Groceries', 50),
        makeLine('Assets:Checking', -50),
      ]),
    ];

    const result = calculateExpenseBreakdown(
      transactions,
      'Expenses',
      moment('2022-01-01'),
      moment('2022-01-31'),
    );

    // Total expenses = 20 + 30 + 50 = 100
    expect(result.totalExpenses).toBe(100);

    // One parent category: Food (100)
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].category).toBe('Food');
    expect(result.rows[0].amount).toBe(100);
    expect(result.rows[0].subcategories).toHaveLength(3);

    // Deep subcategories are joined with colons and appear as separate items
    expect(result.rows[0].subcategories![0].category).toBe('Groceries');
    expect(result.rows[0].subcategories![0].amount).toBe(50);
    expect(result.rows[0].subcategories![1].category).toBe('Restaurant:Dining');
    expect(result.rows[0].subcategories![1].amount).toBe(30);
    expect(result.rows[0].subcategories![2].category).toBe('Restaurant:FastFood');
    expect(result.rows[0].subcategories![2].amount).toBe(20);
  });
});

describe('calculateClosingNetWorth', () => {
  test('includes all transactions up to endDate', () => {
    const transactions = [
      makeTx('2022-01-10', [
        makeLine('Assets:Checking', 1000),
        makeLine('Income:Salary', -1000),
      ]),
      makeTx('2022-01-20', [
        makeLine('Expenses:Food', 50),
        makeLine('Assets:Checking', -50),
      ]),
      makeTx('2022-01-25', [
        makeLine('Liabilities:CreditCard', -200),
        makeLine('Assets:Checking', 200),
      ]),
    ];

    const netWorth = calculateClosingNetWorth(
      transactions,
      'Assets',
      'Liabilities',
      moment('2022-01-31'),
    );

    // Assets: 1000 - 50 + 200 = 1150
    // Liabilities: -200
    // Net: 1150 + (-200) = 950
    expect(netWorth).toBe(950);
  });

  test('excludes transactions after endDate', () => {
    const transactions = [
      makeTx('2022-01-15', [
        makeLine('Assets:Checking', 1000),
        makeLine('Income:Salary', -1000),
      ]),
      makeTx('2022-02-15', [
        makeLine('Assets:Checking', 500),
        makeLine('Income:Bonus', -500),
      ]),
    ];

    const netWorth = calculateClosingNetWorth(
      transactions,
      'Assets',
      'Liabilities',
      moment('2022-01-31'),
    );

    // Only January transaction should be included
    expect(netWorth).toBe(1000);
  });

  test('returns 0 when no asset or liability transactions', () => {
    const transactions = [
      makeTx('2022-01-10', [
        makeLine('Expenses:Food', 50),
        makeLine('Income:Salary', -50),
      ]),
    ];

    const netWorth = calculateClosingNetWorth(
      transactions,
      'Assets',
      'Liabilities',
      moment('2022-01-31'),
    );

    expect(netWorth).toBe(0);
  });
});
