/**
 * Base currency utilities.
 * The base currency is selected in Customization → General Settings and is
 * persisted in the `system_settings` table (key: `base_currency`) and
 * mirrored in localStorage so every page renders amounts with the same
 * currency symbol synchronously.
 */
import { supabase } from '../config/supabase';

const SYMBOLS = { INR: '₹', USD: '$', EUR: '€' };
const LS_KEY = 'armoraa_base_currency';

export const getCurrencyCode = () => {
  try {
    return localStorage.getItem(LS_KEY) || 'INR';
  } catch (e) {
    return 'INR';
  }
};

export const getCurrencySymbol = () => {
  const code = getCurrencyCode();
  return SYMBOLS[code] || code;
};

export const setCurrencyCode = (code) => {
  try {
    localStorage.setItem(LS_KEY, SYMBOLS[code] ? code : 'INR');
  } catch (e) { /* storage unavailable — keep default */ }
};

/** Format a numeric amount with the base currency symbol: ₹1250.00 */
export const fmtMoney = (n) => `${getCurrencySymbol()}${Number(n || 0).toFixed(2)}`;

/**
 * One-time sync from the database on app start (cross-device consistency).
 * Falls back silently to the localStorage value / default.
 */
export const syncCurrencyFromDb = async () => {
  try {
    const { data } = await supabase
      .from('system_settings')
      .select('setting_value')
      .eq('setting_key', 'base_currency')
      .maybeSingle();
    if (data && data.setting_value && SYMBOLS[data.setting_value]) {
      setCurrencyCode(data.setting_value);
    }
  } catch (e) { /* non-fatal */ }
};
