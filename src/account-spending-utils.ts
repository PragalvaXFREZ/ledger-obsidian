import type { EnhancedTransaction } from './parser';
import { Moment } from 'moment';

export interface ExpenseCategoryRow {
  category: string;
  amount: number;
  percentage: number;
  subcategories?: ExpenseCategoryRow[];
}

export interface ExpenseBreakdownResult {
  rows: ExpenseCategoryRow[];
  totalExpenses: number;
}

/**
 * Normalizes a prefix to include both singular and plural forms.
 * E.g., "Expenses" → ["expenses", "expense"]
 */
const normalizePrefixes = (prefix: string): string[] => {
  const base = prefix.trim().replace(/:+$/, '').toLowerCase();
  if (base.endsWith('s')) {
    return [base, base.slice(0, -1)]; // "expenses" → ["expenses", "expense"]
  }
  return [base, `${base}s`]; // "expense" → ["expense", "expenses"]
};

export const calculateExpenseBreakdown = (
  transactions: EnhancedTransaction[],
  expensePrefix: string,
  startDate: Moment,
  endDate: Moment,
): ExpenseBreakdownResult => {
  const startBoundary = startDate.clone().startOf('day');
  const endBoundary = endDate.clone().endOf('day');
  const prefixes = normalizePrefixes(expensePrefix);

  // Track amounts hierarchically: parent -> subcategory -> amount
  const hierarchicalTotals = new Map<string, Map<string, number>>();
  let totalExpenses = 0;

  transactions.forEach((tx) => {
    const txDate = window.moment(tx.value.date);
    if (txDate.isBefore(startBoundary) || txDate.isAfter(endBoundary)) {
      return;
    }

    tx.value.expenselines.forEach((line) => {
      if (!('dealiasedAccount' in line)) {
        return;
      }

      const accountLower = line.dealiasedAccount.toLowerCase();
      if (!prefixes.some((p) => accountLower.startsWith(p))) {
        return;
      }

      // Extract category hierarchy: e.g., "Expenses:Food:Groceries" -> ["Food", "Groceries"]
      const parts = line.dealiasedAccount.split(':');
      if (parts.length < 2) {
        return; // Skip if no category structure
      }

      const parentCategory = parts[1];
      const subcategory = parts.length > 2 ? parts.slice(2).join(':') : null;

      // Initialize parent category map if needed
      if (!hierarchicalTotals.has(parentCategory)) {
        hierarchicalTotals.set(parentCategory, new Map<string, number>());
      }

      const subcategoryMap = hierarchicalTotals.get(parentCategory)!;

      if (subcategory) {
        // Track subcategory amount
        const current = subcategoryMap.get(subcategory) || 0;
        subcategoryMap.set(subcategory, current + line.amount);
      } else {
        // Track parent-level amount (no subcategory)
        const current = subcategoryMap.get('_parent') || 0;
        subcategoryMap.set('_parent', current + line.amount);
      }

      totalExpenses += line.amount;
    });
  });

  // Convert to array with percentages
  const rows: ExpenseCategoryRow[] = [];
  hierarchicalTotals.forEach((subcategoryMap, parentCategory) => {
    // Calculate total for this parent category
    let parentTotal = 0;
    subcategoryMap.forEach((amount) => {
      parentTotal += amount;
    });

    if (parentTotal === 0) {
      return; // Skip zero amounts
    }

    const subcategories: ExpenseCategoryRow[] = [];

    // Process subcategories
    subcategoryMap.forEach((amount, subcat) => {
      if (subcat === '_parent') {
        return; // Skip parent-level entries for now
      }
      if (amount !== 0) {
        subcategories.push({
          category: subcat,
          amount,
          // Subcategory percentage is relative to its parent
          percentage: (amount / parentTotal) * 100,
        });
      }
    });

    // Sort subcategories by amount descending
    subcategories.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

    rows.push({
      category: parentCategory,
      amount: parentTotal,
      // Parent percentage is relative to total expenses
      percentage: totalExpenses === 0 ? 0 : (parentTotal / totalExpenses) * 100,
      subcategories: subcategories.length > 0 ? subcategories : undefined,
    });
  });

  // Sort by amount descending
  rows.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

  return { rows, totalExpenses };
};

/**
 * Calculates the closing net worth (Assets + Liabilities) as of endDate.
 * Includes ALL transactions from the beginning of time up to and including endDate.
 * Strictly excludes transactions after endDate.
 */
export const calculateClosingNetWorth = (
  transactions: EnhancedTransaction[],
  assetPrefix: string,
  liabilityPrefix: string,
  endDate: Moment,
): number => {
  const endBoundary = endDate.clone().endOf('day');
  const normalizedAssetPrefix = assetPrefix.trim().replace(/:+$/, '').toLowerCase();
  const normalizedLiabilityPrefix = liabilityPrefix.trim().replace(/:+$/, '').toLowerCase();

  let netWorth = 0;

  transactions.forEach((tx) => {
    const txDate = window.moment(tx.value.date);
    // Only include transactions up to and including endDate
    if (txDate.isAfter(endBoundary)) {
      return;
    }

    tx.value.expenselines.forEach((line) => {
      if (!('dealiasedAccount' in line)) {
        return;
      }

      const accountLower = line.dealiasedAccount.toLowerCase();
      if (
        accountLower.startsWith(normalizedAssetPrefix) ||
        accountLower.startsWith(normalizedLiabilityPrefix)
      ) {
        netWorth += line.amount;
      }
    });
  });

  return netWorth;
};

export interface AssetCategoryRow {
  category: string;
  amount: number;
  subcategories?: AssetCategoryRow[];
}

/**
 * Calculates the breakdown of assets and liabilities by top-level category as of endDate.
 * Includes ALL transactions from the beginning of time up to and including endDate.
 */
export const calculateAssetBreakdown = (
  transactions: EnhancedTransaction[],
  assetPrefix: string,
  liabilityPrefix: string,
  endDate: Moment,
): AssetCategoryRow[] => {
  const endBoundary = endDate.clone().endOf('day');
  const normalizedAssetPrefix = assetPrefix.trim().replace(/:+$/, '').toLowerCase();
  const normalizedLiabilityPrefix = liabilityPrefix.trim().replace(/:+$/, '').toLowerCase();

  // Track amounts hierarchically: parent -> subcategory -> amount
  const hierarchicalTotals = new Map<string, Map<string, number>>();

  transactions.forEach((tx) => {
    const txDate = window.moment(tx.value.date);
    if (txDate.isAfter(endBoundary)) {
      return;
    }

    tx.value.expenselines.forEach((line) => {
      if (!('dealiasedAccount' in line)) {
        return;
      }

      const accountLower = line.dealiasedAccount.toLowerCase();
      if (
        accountLower.startsWith(normalizedAssetPrefix) ||
        accountLower.startsWith(normalizedLiabilityPrefix)
      ) {
        // Extract category hierarchy: e.g., "Assets:Bank:Checking" -> ["Bank", "Checking"]
        const parts = line.dealiasedAccount.split(':');
        if (parts.length < 2) {
          return; // Skip if no category structure
        }

        const parentCategory = parts[1];
        const subcategory = parts.length > 2 ? parts.slice(2).join(':') : null;

        // Initialize parent category map if needed
        if (!hierarchicalTotals.has(parentCategory)) {
          hierarchicalTotals.set(parentCategory, new Map<string, number>());
        }

        const subcategoryMap = hierarchicalTotals.get(parentCategory)!;

        if (subcategory) {
          // Track subcategory amount
          const current = subcategoryMap.get(subcategory) || 0;
          subcategoryMap.set(subcategory, current + line.amount);
        } else {
          // Track parent-level amount (no subcategory)
          const current = subcategoryMap.get('_parent') || 0;
          subcategoryMap.set('_parent', current + line.amount);
        }
      }
    });
  });

  // Convert to array with subcategories
  const rows: AssetCategoryRow[] = [];
  hierarchicalTotals.forEach((subcategoryMap, parentCategory) => {
    // Calculate total for this parent category
    let parentTotal = 0;
    subcategoryMap.forEach((amount) => {
      parentTotal += amount;
    });

    if (parentTotal === 0) {
      return; // Skip zero amounts
    }

    const subcategories: AssetCategoryRow[] = [];

    // Process subcategories
    subcategoryMap.forEach((amount, subcat) => {
      if (subcat === '_parent') {
        return; // Skip parent-level entries for now
      }
      if (amount !== 0) {
        subcategories.push({
          category: subcat,
          amount,
        });
      }
    });

    // Sort subcategories by absolute amount descending
    subcategories.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

    rows.push({
      category: parentCategory,
      amount: parentTotal,
      subcategories: subcategories.length > 0 ? subcategories : undefined,
    });
  });

  // Sort by absolute amount descending
  rows.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

  return rows;
};
