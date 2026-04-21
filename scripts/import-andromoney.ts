/**
 * AndroMoney CSV import script.
 *
 * Usage:
 *   npx tsx scripts/import-andromoney.ts /path/to/andromoney-export.csv
 *   npx tsx scripts/import-andromoney.ts /path/to/file.csv --dry-run
 *
 * CSV columns (0-indexed):
 *   0  Id
 *   1  Currency
 *   2  Amount
 *   3  Category
 *   4  Sub-Category
 *   5  Date (YYYYMMDD)
 *   6  Expense(Transfer Out)   - source account
 *   7  Income(Transfer In)     - dest account
 *   8  Note
 *   9  Periodic
 *   10 Project
 *   11 Payee/Payer
 *   12 uid
 *   13 Time (HHMM)
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@libsql/client'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
import { config } from 'dotenv'
config({ path: path.join(__dirname, '../.env.local') })
// createClient() is called here (after config()) so TURSO_DATABASE_URL is already set.
// A static `import { db } from '../lib/db'` would be hoisted before config() runs and
// fall back to file:local.db.
const db = createClient({
  url: process.env.TURSO_DATABASE_URL ?? 'file:local.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
})

// ── Column indices ────────────────────────────────────────────────────────────

export const COL = {
  ID: 0,
  CURRENCY: 1,
  AMOUNT: 2,
  CATEGORY: 3,
  SUB_CATEGORY: 4,
  DATE: 5,
  EXPENSE: 6,
  INCOME: 7,
  NOTE: 8,
  PERIODIC: 9,
  PROJECT: 10,
  PAYEE: 11,
  UID: 12,
  TIME: 13,
} as const

// ── Row type ──────────────────────────────────────────────────────────────────

export type RowType = 'expense' | 'income' | 'transfer' | 'init_balance'

export interface CsvRow {
  id: string
  currency: string
  amount: number
  category: string
  subCategory: string
  date: string
  expenseAccount: string
  incomeAccount: string
  note: string
  project: string
  payee: string
  uid: string
  time: string
}

// ── CSV parsing ───────────────────────────────────────────────────────────────

export function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let cur = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cur += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        fields.push(cur.trim())
        cur = ''
      } else {
        cur += ch
      }
    }
  }
  fields.push(cur.trim())
  return fields
}

export function parseRow(fields: string[]): CsvRow | null {
  if (fields.length < 13) return null
  const amount = parseFloat(fields[COL.AMOUNT])
  if (isNaN(amount)) return null
  return {
    id: fields[COL.ID] ?? '',
    currency: (fields[COL.CURRENCY] ?? 'SGD').trim().toUpperCase() || 'SGD',
    amount: Math.abs(amount),
    category: (fields[COL.CATEGORY] ?? '').trim(),
    subCategory: (fields[COL.SUB_CATEGORY] ?? '').trim(),
    date: (fields[COL.DATE] ?? '').trim(),
    expenseAccount: (fields[COL.EXPENSE] ?? '').trim(),
    incomeAccount: (fields[COL.INCOME] ?? '').trim(),
    note: (fields[COL.NOTE] ?? '').trim(),
    project: (fields[COL.PROJECT] ?? '').trim(),
    payee: (fields[COL.PAYEE] ?? '').trim(),
    uid: (fields[COL.UID] ?? '').trim(),
    time: (fields[COL.TIME] ?? '0000').trim(),
  }
}

// ── Row type detection ────────────────────────────────────────────────────────

export function determineRowType(row: CsvRow): RowType {
  if (row.category === 'SYSTEM' && row.subCategory === 'INIT_AMOUNT') return 'init_balance'
  const hasExpense = row.expenseAccount.length > 0
  const hasIncome = row.incomeAccount.length > 0
  if (hasExpense && hasIncome) return 'transfer'
  if (hasExpense) return 'expense'
  if (hasIncome) return 'income'
  return 'expense'
}

// ── DateTime parsing ──────────────────────────────────────────────────────────

export function parseDateTime(date: string, time: string): string {
  // date: YYYYMMDD, time: HHMM / HMM / HH:MM / empty
  const y = date.slice(0, 4)
  const m = date.slice(4, 6)
  const d = date.slice(6, 8)
  const digits = time.replace(/[^0-9]/g, '')
  let hh: string, mm: string
  if (digits.length === 0)      { hh = '00'; mm = '00' }
  else if (digits.length <= 2)  { hh = digits.padStart(2, '0'); mm = '00' }
  else if (digits.length === 3) { hh = digits[0].padStart(2, '0'); mm = digits.slice(1, 3) }
  else                          { hh = digits.slice(0, 2); mm = digits.slice(2, 4) }
  const h = Math.min(parseInt(hh, 10), 23)
  const min = Math.min(parseInt(mm, 10), 59)
  return `${y}-${m}-${d}T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`
}

// ── Category + Subcategory mapping ────────────────────────────────────────────
//
// Maps (CSV Category, CSV Sub-Category) -> (App Category, App Subcategory)
// The app stores subcategories as categories with parent_id set.
// Confirmed mapping covers 100% of 7,040 non-system transactions.

export interface CategoryResult {
  category: string
  subcategory: string
  type: 'expense' | 'income'
}

// Key: "csvCategory::csvSubCategory" (original casing preserved for exact match)
const CATEGORY_SUBCAT_MAP: Record<string, CategoryResult> = {
  // ── Food ──────────────────────────────────────────────────────────────────
  'Food::Breakfast':      { category: 'Food', subcategory: 'Meals', type: 'expense' },
  'Food::Brunch':         { category: 'Food', subcategory: 'Meals', type: 'expense' },
  'Food::Lunch':          { category: 'Food', subcategory: 'Meals', type: 'expense' },
  'Food::Dinner':         { category: 'Food', subcategory: 'Meals', type: 'expense' },
  'Food::Supper':         { category: 'Food', subcategory: 'Meals', type: 'expense' },
  'Food::Coffee Matcha':  { category: 'Food', subcategory: 'Coffee', type: 'expense' },
  'Food::Health Drinks':  { category: 'Food', subcategory: 'Coffee', type: 'expense' },
  'Food::Drinks':         { category: 'Food', subcategory: 'Alcohol', type: 'expense' },
  'Food::Fruit':          { category: 'Food', subcategory: 'Groceries', type: 'expense' },
  'Food::Grocery':        { category: 'Food', subcategory: 'Groceries', type: 'expense' },
  'Food::Ingredients':    { category: 'Food', subcategory: 'Groceries', type: 'expense' },
  'Food::Water':          { category: 'Food', subcategory: 'Groceries', type: 'expense' },
  'Food::Snacks':         { category: 'Food', subcategory: 'Snacks', type: 'expense' },
  'Food::dessert':        { category: 'Food', subcategory: 'Snacks', type: 'expense' },

  // ── Transportation ────────────────────────────────────────────────────────
  'Transportation::Bus / Train / Subway': { category: 'Transportation', subcategory: 'Bus and Train', type: 'expense' },
  'Transportation::Taxi':                 { category: 'Transportation', subcategory: 'Taxi', type: 'expense' },
  'Transportation::Delivery':             { category: 'Transportation', subcategory: 'Delivery', type: 'expense' },

  // ── Living ────────────────────────────────────────────────────────────────
  'Living::Appliances':           { category: 'Living', subcategory: 'Appliances', type: 'expense' },
  'Living::Furniture':            { category: 'Living', subcategory: 'Furniture', type: 'expense' },
  'Living::Groceries':            { category: 'Living', subcategory: 'Groceries', type: 'expense' },
  'Living::Tools':                { category: 'Living', subcategory: 'Tools', type: 'expense' },
  'Living::Clothes x Accessorie': { category: 'Living', subcategory: 'Clothes', type: 'expense' },
  'Living::Insurance - Pure':     { category: 'Living', subcategory: 'Insurance - Pure', type: 'expense' },
  'Living::Parents':              { category: 'Living', subcategory: 'Allowance', type: 'expense' },
  'Living::Income Tax':           { category: 'Living', subcategory: 'Income Tax', type: 'expense' },
  'Living::property tax':         { category: 'Living', subcategory: 'Property Tax', type: 'expense' },
  'Living::Rent':                 { category: 'Living', subcategory: 'Rent', type: 'expense' },
  'Living::Mortgage':             { category: 'Living', subcategory: 'Mortgage', type: 'expense' },
  'Living::MCST':                 { category: 'Living', subcategory: 'MCST', type: 'expense' },
  'Living::mcst':                 { category: 'Living', subcategory: 'MCST', type: 'expense' },
  'Living::Reno Repairs':         { category: 'Living', subcategory: 'Home Maintenance', type: 'expense' },
  'Living::Renos Repairs':        { category: 'Living', subcategory: 'Home Maintenance', type: 'expense' },
  'Living::Coffee Gear':          { category: 'Living', subcategory: 'Coffee Gear', type: 'expense' },
  'Living::Beddings':             { category: 'Living', subcategory: 'Household', type: 'expense' },
  'Living::Agent Fees':           { category: 'Living', subcategory: 'Agent Fees', type: 'expense' },
  'Living::Others':               { category: 'Living', subcategory: 'Others', type: 'expense' },

  // ── Bills ─────────────────────────────────────────────────────────────────
  'Bills::Aircon Service':    { category: 'Bills', subcategory: 'Aircon Service', type: 'expense' },
  'Bills::Broadband':         { category: 'Bills', subcategory: 'Broadband', type: 'expense' },
  'Bills::Credit Cards':      { category: 'Bills', subcategory: 'Credit Cards', type: 'expense' },
  'Bills::Electricity':       { category: 'Bills', subcategory: 'Electricity', type: 'expense' },
  'Bills::Management Fees':   { category: 'Bills', subcategory: 'Management Fees', type: 'expense' },
  'Bills::Mobile phones':     { category: 'Bills', subcategory: 'Mobile', type: 'expense' },
  'Bills::Utilities':         { category: 'Bills', subcategory: 'Utilities', type: 'expense' },

  // ── Entertainment ─────────────────────────────────────────────────────────
  'Entertainment::Gaming':            { category: 'Entertainment', subcategory: 'Gaming', type: 'expense' },
  'Entertainment::Game':              { category: 'Entertainment', subcategory: 'Gaming', type: 'expense' },
  'Entertainment::Toys':              { category: 'Entertainment', subcategory: 'Toys', type: 'expense' },
  'Entertainment::Carry stuff':       { category: 'Entertainment', subcategory: 'Carry', type: 'expense' },
  'Entertainment::Carry Patches':     { category: 'Entertainment', subcategory: 'Carry', type: 'expense' },
  'Entertainment::Phone Accessories': { category: 'Entertainment', subcategory: 'Tech', type: 'expense' },
  'Entertainment::Tech':              { category: 'Entertainment', subcategory: 'Tech', type: 'expense' },
  'Entertainment::Gifts':             { category: 'Entertainment', subcategory: 'Gifts', type: 'expense' },
  'Entertainment::Music':             { category: 'Entertainment', subcategory: 'Music', type: 'expense' },
  'Entertainment::Spotify':           { category: 'Entertainment', subcategory: 'Music', type: 'expense' },
  'Entertainment::Movie':             { category: 'Entertainment', subcategory: 'Shows and Movies', type: 'expense' },
  'Entertainment::Shows':             { category: 'Entertainment', subcategory: 'Shows and Movies', type: 'expense' },
  'Entertainment::Exhibition':        { category: 'Entertainment', subcategory: 'Shows and Movies', type: 'expense' },
  'Entertainment::KTV':               { category: 'Entertainment', subcategory: 'Nightlife', type: 'expense' },
  'Entertainment::Party':             { category: 'Entertainment', subcategory: 'Nightlife', type: 'expense' },
  'Entertainment::Shopping':          { category: 'Entertainment', subcategory: 'Shopping', type: 'expense' },
  'Entertainment::Apps':              { category: 'Entertainment', subcategory: 'Apps', type: 'expense' },
  'Entertainment::Adobe Creative':    { category: 'Entertainment', subcategory: 'Apps', type: 'expense' },
  'Entertainment::Crafts':            { category: 'Entertainment', subcategory: 'Crafts', type: 'expense' },
  'Entertainment::Fitness Activity':  { category: 'Entertainment', subcategory: 'Fitness', type: 'expense' },
  'Entertainment::Travel':            { category: 'Travel', subcategory: 'Travel', type: 'expense' },

  // ── Health and Wellness ───────────────────────────────────────────────────
  'Health and Wellness::Supplements':        { category: 'Health and Wellness', subcategory: 'Supplements', type: 'expense' },
  'Health and Wellness::Spa Massage':        { category: 'Health and Wellness', subcategory: 'Spa Massage', type: 'expense' },
  'Health and Wellness::Creams':             { category: 'Health and Wellness', subcategory: 'Skincare', type: 'expense' },
  'Health and Wellness::Facial Stuff':       { category: 'Health and Wellness', subcategory: 'Skincare', type: 'expense' },
  'Health and Wellness::therapy counseling': { category: 'Health and Wellness', subcategory: 'Therapy', type: 'expense' },
  'Health and Wellness::Alternative Therapy':{ category: 'Health and Wellness', subcategory: 'Therapy', type: 'expense' },
  'Health and Wellness::Tools':              { category: 'Health and Wellness', subcategory: 'Tools', type: 'expense' },
  'Health and Wellness::Haircut':            { category: 'Health and Wellness', subcategory: 'Haircut', type: 'expense' },
  'Health and Wellness::Drugs':              { category: 'Health and Wellness', subcategory: 'Medical', type: 'expense' },
  'Health and Wellness::Medicine':           { category: 'Health and Wellness', subcategory: 'Medical', type: 'expense' },
  'Health and Wellness::Medical fee':        { category: 'Health and Wellness', subcategory: 'Medical', type: 'expense' },
  'Health and Wellness::Physical Checkup':   { category: 'Health and Wellness', subcategory: 'Medical', type: 'expense' },
  'Health and Wellness::Dental':             { category: 'Health and Wellness', subcategory: 'Dental', type: 'expense' },
  'Health and Wellness::supplies':           { category: 'Health and Wellness', subcategory: 'Supplies', type: 'expense' },
  'Health and Wellness::Body Wash':          { category: 'Health and Wellness', subcategory: 'Personal Care', type: 'expense' },
  'Health and Wellness::Shampoo scalp':      { category: 'Health and Wellness', subcategory: 'Personal Care', type: 'expense' },
  'Health and Wellness::Cotton pads q tips': { category: 'Health and Wellness', subcategory: 'Personal Care', type: 'expense' },
  'Health and Wellness::Essential Oils':     { category: 'Health and Wellness', subcategory: 'Personal Care', type: 'expense' },
  'Health and Wellness::Mask':               { category: 'Health and Wellness', subcategory: 'Personal Care', type: 'expense' },
  'Health and Wellness::App':                { category: 'Health and Wellness', subcategory: 'App', type: 'expense' },
  'Health and Wellness::Eyewear':            { category: 'Health and Wellness', subcategory: 'Eyewear', type: 'expense' },

  // ── Education ─────────────────────────────────────────────────────────────
  'Education::Stationery':          { category: 'Education', subcategory: 'Stationery', type: 'expense' },
  'Education::Inks':                { category: 'Education', subcategory: 'Stationery', type: 'expense' },
  'Education::Fountain Pen':        { category: 'Education', subcategory: 'Stationery', type: 'expense' },
  'Education::Books':               { category: 'Education', subcategory: 'Books', type: 'expense' },
  'Education::Coursera':            { category: 'Education', subcategory: 'Courses', type: 'expense' },
  'Education::Course Fees':         { category: 'Education', subcategory: 'Courses', type: 'expense' },
  'Education::Tutoring Fee':        { category: 'Education', subcategory: 'Courses', type: 'expense' },
  'Education::App':                 { category: 'Education', subcategory: 'Software', type: 'expense' },
  'Education::Materials / Content': { category: 'Education', subcategory: 'Materials', type: 'expense' },
  'Education::Accessories':         { category: 'Education', subcategory: 'Accessories', type: 'expense' },
  'Education::credentials license': { category: 'Education', subcategory: 'Credentials', type: 'expense' },

  // ── Pet ───────────────────────────────────────────────────────────────────
  'Pet::Food':                 { category: 'Pet', subcategory: 'Pet Food', type: 'expense' },
  'Pet::Grooming':             { category: 'Pet', subcategory: 'Grooming', type: 'expense' },
  'Pet::Litter & poo bags':    { category: 'Pet', subcategory: 'Litter', type: 'expense' },
  'Pet::Others':               { category: 'Pet', subcategory: 'Others', type: 'expense' },
  'Pet::Toys':                 { category: 'Pet', subcategory: 'Toys', type: 'expense' },
  'Pet::Treats':               { category: 'Pet', subcategory: 'Treats', type: 'expense' },
  'Pet::vet':                  { category: 'Pet', subcategory: 'Vet', type: 'expense' },
  'Pet::Meds and Supplements': { category: 'Pet', subcategory: 'Pet Supplements', type: 'expense' },
  'Pet::Cleaning':             { category: 'Pet', subcategory: 'Cleaning', type: 'expense' },

  // ── Investment ────────────────────────────────────────────────────────────
  'Investment::Insurance - ILP':      { category: 'Investment', subcategory: 'Insurance - ILP', type: 'expense' },
  'Investment::Insurance Accumulate': { category: 'Investment', subcategory: 'Insurance Accumulate', type: 'expense' },

  // ── Subscriptions ─────────────────────────────────────────────────────────
  'Subscriptions::Entertainment':      { category: 'Subscriptions', subcategory: 'Entertainment', type: 'expense' },
  'Subscriptions::Storage photography':{ category: 'Subscriptions', subcategory: 'Storage', type: 'expense' },
  'Subscriptions::business tools':     { category: 'Subscriptions', subcategory: 'Business Tools', type: 'expense' },
  'Subscriptions::Others':             { category: 'Subscriptions', subcategory: 'Others', type: 'expense' },
  'Subscriptions::Membership':         { category: 'Subscriptions', subcategory: 'Membership', type: 'expense' },
  'Subscriptions::Telecommunications': { category: 'Subscriptions', subcategory: 'Telecommunications', type: 'expense' },
  'Subscriptions::Education':          { category: 'Subscriptions', subcategory: 'Education', type: 'expense' },
  'Subscriptions::Internet':           { category: 'Subscriptions', subcategory: 'Internet', type: 'expense' },

  // ── Supplies ──────────────────────────────────────────────────────────────
  'Supplies::Cleaning 🧹':          { category: 'Supplies', subcategory: 'Cleaning', type: 'expense' },
  'Supplies::gloves':                { category: 'Supplies', subcategory: 'Cleaning', type: 'expense' },
  'Supplies::Masks':                 { category: 'Supplies', subcategory: 'Cleaning', type: 'expense' },
  'Supplies::Tools and packing':     { category: 'Supplies', subcategory: 'Tools', type: 'expense' },
  'Supplies::Toiletries':            { category: 'Supplies', subcategory: 'Toiletries', type: 'expense' },
  'Supplies::Filters':               { category: 'Supplies', subcategory: 'Filters', type: 'expense' },
  'Supplies::Filters\uFF0C Replaceable': { category: 'Supplies', subcategory: 'Filters', type: 'expense' },
  'Supplies::Batteries':             { category: 'Supplies', subcategory: 'Batteries', type: 'expense' },

  // ── Income ────────────────────────────────────────────────────────────────
  'Income::Sale of':     { category: 'Income', subcategory: 'Sale of', type: 'income' },
  'Income::Repayment':   { category: 'Income', subcategory: 'Repayment', type: 'income' },
  'Income::Refund':      { category: 'Income', subcategory: 'Refund', type: 'income' },
  'Income::Salary':      { category: 'Income', subcategory: 'Salary', type: 'income' },
  'Income::Angpow':      { category: 'Income', subcategory: 'Angpow', type: 'income' },
  'Income::Rental':      { category: 'Income', subcategory: 'Rental', type: 'income' },
  'Income::Others':      { category: 'Income', subcategory: 'Others', type: 'income' },
  'Income::Pocket Money':{ category: 'Income', subcategory: 'Pocket Money', type: 'income' },

  // ── Transfer ──────────────────────────────────────────────────────────────
  'Transfer::General Transfer': { category: 'Transfer', subcategory: 'General Transfer', type: 'expense' },
  'Transfer::housing fund':     { category: 'Transfer', subcategory: 'Housing Fund', type: 'expense' },

  // ── AI ────────────────────────────────────────────────────────────────────
  'AI::APIs':         { category: 'AI', subcategory: 'APIs', type: 'expense' },
  'AI::Subscription': { category: 'AI', subcategory: 'Subscription', type: 'expense' },
  'AI::Domain':       { category: 'AI', subcategory: 'Domain', type: 'expense' },
  'AI::Membership':   { category: 'AI', subcategory: 'Membership', type: 'expense' },

  // ── Fees (merge Fee + Fees) ───────────────────────────────────────────────
  'Fees::Logistics':      { category: 'Fees', subcategory: 'Logistics', type: 'expense' },
  'Fees::Buffer':         { category: 'Fees', subcategory: 'Buffer', type: 'expense' },
  'Fees::Import Duties':  { category: 'Fees', subcategory: 'Import Duties', type: 'expense' },
  'Fees::Stamp Duty':     { category: 'Fees', subcategory: 'Stamp Duty', type: 'expense' },
  'Fees::Transfer Fee':   { category: 'Fees', subcategory: 'Transfer Fee', type: 'expense' },
  'Fees::Transfers':      { category: 'Fees', subcategory: 'Transfer Fee', type: 'expense' },
  'Fee::GST':             { category: 'Fees', subcategory: 'GST', type: 'expense' },
  'Fee::Transfer Fee':    { category: 'Fees', subcategory: 'Transfer Fee', type: 'expense' },
  'Fee::hold':            { category: 'Fees', subcategory: 'Hold', type: 'expense' },

  // ── Others ────────────────────────────────────────────────────────────────
  'Others::Incidental Expenses': { category: 'Others', subcategory: 'Incidental Expenses', type: 'expense' },
  'Others::Lending Money':       { category: 'Others', subcategory: 'Lending', type: 'expense' },
  'Others::Loan':                { category: 'Others', subcategory: 'Loan', type: 'expense' },
  'Others::Misc':                { category: 'Others', subcategory: 'Misc', type: 'expense' },
  'Others::Return':              { category: 'Others', subcategory: 'Return', type: 'expense' },

  // ── Travel ────────────────────────────────────────────────────────────────
  'Travel::Hotel':         { category: 'Travel', subcategory: 'Hotel', type: 'expense' },
  'Travel::Flight':        { category: 'Travel', subcategory: 'Flight', type: 'expense' },
  'Travel::Cash Exchange': { category: 'Travel', subcategory: 'Cash Exchange', type: 'expense' },

  // ── Small categories absorbed ─────────────────────────────────────────────
  'Degen::Tech':              { category: 'Entertainment', subcategory: 'Tech', type: 'expense' },
  'Gaming::Bundles':          { category: 'Entertainment', subcategory: 'Gaming', type: 'expense' },
  'Personal 3C::Camera':      { category: 'Entertainment', subcategory: 'Tech', type: 'expense' },
  'Personal 3C::Ear Buds':    { category: 'Entertainment', subcategory: 'Tech', type: 'expense' },
  'Personal 3C::PC Related':  { category: 'Entertainment', subcategory: 'Tech', type: 'expense' },
  'Sales::Bag':               { category: 'Income', subcategory: 'Sale of', type: 'income' },
  'Funds::Rebates':           { category: 'Income', subcategory: 'Rebates', type: 'income' },

  // ── buffer redistributed ──────────────────────────────────────────────────
  'buffer::Cab':     { category: 'Transportation', subcategory: 'Taxi', type: 'expense' },
  'buffer::Coffee':  { category: 'Food', subcategory: 'Coffee', type: 'expense' },
  'buffer::others':  { category: 'Others', subcategory: 'Misc', type: 'expense' },
}

export function mapCategory(
  category: string,
  subCategory: string,
  rowType: RowType
): CategoryResult | null {
  if (rowType === 'init_balance') return null

  // Exact key lookup: "Category::Sub-Category"
  const key = `${category}::${subCategory}`
  const result = CATEGORY_SUBCAT_MAP[key]
  if (result) return result

  // For transfers: still return category info for Pillar 1 (category is independent of direction)
  // but if no mapping found, return null
  return null
}

// ── Account name normalisation ────────────────────────────────────────────────

// Maps lowercased CSV account names -> canonical blessroot account names
const ACCOUNT_NAME_MAP: Record<string, string> = {
  'posb':                 'POSB',
  'ocbc':                 'OCBC',
  '6674':                 '6674',
  'grabpay':              'GrabPay',
  'grab pay':             'GrabPay',
  'shopee pay':           'Shopee Pay',
  'shopeepay':            'Shopee Pay',
  'uob one':              '9773',
  'uob savings':          'UOB Savings',
  'uob saving':           'UOB Savings',
  'shopback':             'ShopBack',
  'shop back':            'ShopBack',
  'paypal':               'PayPal',
  'syfe':                 'Syfe',
  'pandapay':             'PandaPay',
  'panda pay':            'PandaPay',
  'cash':                 'Cash',
  'tech funds':           'Tech Funds',
  'ifunds annihilator':   'iFunds Annihilator',
  'lalamove easyvan':     'Lalamove Easyvan',
  'lalamove':             'Lalamove Easyvan',
  '2024 japan':           '2024 Japan',
  'credit card':          'Credit Card',
  'vallow':               'vallow',
}

// Pillar 3: Account type assignments (confirmed)
// Bank: OCBC, POSB, UOB Savings
// Credit Card: Credit Card, 6674, 9773
// Wallet: GrabPay, PandaPay, PayPal, ShopBack, Shopee Pay, Lalamove Easyvan
// Cash: Cash, 2024 Japan
// Fund: Syfe, Tech Funds, iFunds Annihilator
const ACCOUNT_TYPE_MAP: Record<string, string> = {
  'OCBC':               'bank',
  'POSB':               'bank',
  'UOB Savings':        'bank',
  'Credit Card':        'credit_card',
  '6674':               'credit_card',
  '9773':               'credit_card',
  'GrabPay':            'wallet',
  'PandaPay':           'wallet',
  'PayPal':             'wallet',
  'ShopBack':           'wallet',
  'Shopee Pay':         'wallet',
  'Lalamove Easyvan':   'wallet',
  'Cash':               'cash',
  '2024 Japan':         'cash',
  'Syfe':               'fund',
  'Tech Funds':         'fund',
  'iFunds Annihilator': 'fund',
  'vallow':             'wallet',
}

export function normaliseAccountName(raw: string): string {
  const key = raw.toLowerCase().trim()
  return ACCOUNT_NAME_MAP[key] ?? raw.trim()
}

export function guessAccountType(canonicalName: string): string {
  return ACCOUNT_TYPE_MAP[canonicalName] ?? 'bank'
}

// ── Main import logic ─────────────────────────────────────────────────────────

interface Stats {
  total: number
  imported: number
  skipped_dup: number
  skipped_init: number
  skipped_no_account: number
  skipped_no_uid: number
  errors: number
  unmapped_categories: Set<string>
}

async function loadExistingData() {
  const [acctRes, catRes, tagRes, importedRes] = await Promise.all([
    db.execute('SELECT id, name FROM accounts'),
    db.execute('SELECT id, name, type, parent_id FROM categories'),
    db.execute('SELECT id, name FROM tags'),
    db.execute('SELECT uid FROM andromoney_imports'),
  ])

  const accounts = new Map<string, string>() // name -> id
  for (const r of acctRes.rows) accounts.set(r.name as string, r.id as string)

  // Build category lookup: "parentName::childName" -> id
  // For parent categories (parent_id IS NULL): just use name as key
  const parentCategories = new Map<string, string>() // name -> id
  const subcatLookup = new Map<string, string>() // "parentName::childName" -> id

  for (const r of catRes.rows) {
    const name = r.name as string
    const id = r.id as string
    const parentId = r.parent_id as string | null

    if (!parentId) {
      parentCategories.set(name, id)
    }
  }

  // Second pass: build subcategory lookup with parent name
  for (const r of catRes.rows) {
    const name = r.name as string
    const id = r.id as string
    const parentId = r.parent_id as string | null

    if (parentId) {
      // Find parent name
      for (const [pName, pId] of parentCategories) {
        if (pId === parentId) {
          subcatLookup.set(`${pName}::${name}`, id)
          break
        }
      }
    }
  }

  const tags = new Map<string, string>() // name -> id
  for (const r of tagRes.rows) tags.set(r.name as string, r.id as string)

  const imported = new Set<string>()
  for (const r of importedRes.rows) imported.add(r.uid as string)

  return { accounts, parentCategories, subcatLookup, tags, imported }
}

async function ensureAccount(
  name: string,
  accounts: Map<string, string>,
  dryRun: boolean
): Promise<string | null> {
  if (accounts.has(name)) return accounts.get(name)!
  const type = guessAccountType(name)
  const id = crypto.randomUUID()
  const n = new Date().toISOString()
  if (!dryRun) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO accounts (id, name, type, currency, is_active, created_at, updated_at)
            VALUES (?, ?, ?, 'SGD', 1, ?, ?)`,
      args: [id, name, type, n, n],
    })
    // Refetch in case INSERT OR IGNORE skipped due to dupe
    const r = await db.execute({ sql: 'SELECT id FROM accounts WHERE name = ?', args: [name] })
    const realId = r.rows[0]?.id as string ?? id
    accounts.set(name, realId)
    return realId
  }
  accounts.set(name, id)
  return id
}

async function ensureTag(
  name: string,
  tags: Map<string, string>,
  dryRun: boolean
): Promise<string> {
  if (tags.has(name)) return tags.get(name)!
  const id = crypto.randomUUID()
  const n = new Date().toISOString()
  if (!dryRun) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO tags (id, name, created_at) VALUES (?, ?, ?)`,
      args: [id, name, n],
    })
    const r = await db.execute({ sql: 'SELECT id FROM tags WHERE name = ?', args: [name] })
    const realId = r.rows[0]?.id as string ?? id
    tags.set(name, realId)
    return realId
  }
  tags.set(name, id)
  return id
}

async function importRow(
  row: CsvRow,
  state: Awaited<ReturnType<typeof loadExistingData>>,
  stats: Stats,
  dryRun: boolean
): Promise<void> {
  stats.total++

  if (!row.uid) {
    stats.skipped_no_uid++
    return
  }

  if (state.imported.has(row.uid)) {
    stats.skipped_dup++
    return
  }

  const rowType = determineRowType(row)

  // INIT_AMOUNT: mark as imported, skip inserting a transaction
  if (rowType === 'init_balance') {
    stats.skipped_init++
    if (!dryRun) {
      await db.execute({
        sql: `INSERT OR IGNORE INTO andromoney_imports (uid, imported_at) VALUES (?, ?)`,
        args: [row.uid, new Date().toISOString()],
      })
    }
    state.imported.add(row.uid)
    return
  }

  // Resolve accounts
  const expAcctRaw = rowType !== 'income' ? normaliseAccountName(row.expenseAccount) : ''
  const incAcctRaw = rowType !== 'expense' ? normaliseAccountName(row.incomeAccount) : ''

  const fromAcctName = expAcctRaw || null
  const toAcctName = incAcctRaw || null

  const primaryAcctName = fromAcctName ?? toAcctName
  if (!primaryAcctName) {
    stats.skipped_no_account++
    return
  }

  const fromId = fromAcctName ? await ensureAccount(fromAcctName, state.accounts, dryRun) : null
  const toId = toAcctName ? await ensureAccount(toAcctName, state.accounts, dryRun) : null

  if (!fromId && !toId) {
    stats.skipped_no_account++
    return
  }

  // Resolve category -> subcategory (Pillar 1)
  // Category ID points to the SUBCATEGORY row (which has parent_id set to parent category)
  const catResult = mapCategory(row.category, row.subCategory, rowType)
  let categoryId: string | null = null

  if (catResult) {
    // Look up subcategory by "parentName::childName" key (handles duplicate names across parents)
    const subKey = `${catResult.category}::${catResult.subcategory}`
    const subId = state.subcatLookup.get(subKey)
    if (subId) {
      categoryId = subId
    } else {
      // Fall back to parent category
      const parentId = state.parentCategories.get(catResult.category)
      if (parentId) {
        categoryId = parentId
      } else {
        stats.unmapped_categories.add(`${row.category}/${row.subCategory}`)
      }
    }
  } else {
    stats.unmapped_categories.add(`${row.category}/${row.subCategory}`)
  }

  // Build tags: sub-category + project (Pillar 5)
  const tagNames: string[] = []
  if (row.subCategory && row.subCategory.toLowerCase() !== 'init_amount') {
    tagNames.push(row.subCategory)
  }
  if (row.project) {
    tagNames.push(row.project)
  }

  // DateTime
  const datetime = parseDateTime(row.date, row.time)

  // FX
  const isSGD = row.currency === 'SGD'
  const txId = crypto.randomUUID()
  const now = new Date().toISOString()

  if (!dryRun) {
    await db.execute({
      sql: `INSERT INTO transactions
              (id, type, amount, currency, fx_rate, fx_date, sgd_equivalent,
               account_id, to_account_id, category_id, payee, note, datetime, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        txId,
        rowType,
        row.amount,
        row.currency,
        null,
        isSGD ? null : row.date.slice(0, 4) + '-' + row.date.slice(4, 6) + '-' + row.date.slice(6, 8),
        isSGD ? row.amount : null,
        fromId ?? toId!,
        rowType === 'transfer' ? toId : null,
        categoryId,
        row.payee || null,
        row.note || null,
        datetime,
        now,
        now,
      ],
    })

    // Tags
    for (const tagName of tagNames) {
      const tagId = await ensureTag(tagName, state.tags, dryRun)
      await db.execute({
        sql: `INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)`,
        args: [txId, tagId],
      })
    }

    // Mark as imported
    await db.execute({
      sql: `INSERT OR IGNORE INTO andromoney_imports (uid, imported_at) VALUES (?, ?)`,
      args: [row.uid, now],
    })
  }

  state.imported.add(row.uid)
  stats.imported++
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const csvPath = args.find(a => !a.startsWith('--'))
  const dryRun = args.includes('--dry-run')

  if (!csvPath) {
    console.error('Usage: npx tsx scripts/import-andromoney.ts <path/to/export.csv> [--dry-run]')
    process.exit(1)
  }

  const resolved = path.resolve(csvPath)
  if (!fs.existsSync(resolved)) {
    console.error(`File not found: ${resolved}`)
    process.exit(1)
  }

  console.log(`\nAndroMoney Import${dryRun ? ' (DRY RUN - no writes)' : ''}`)
  console.log(`File: ${resolved}\n`)

  const content = fs.readFileSync(resolved, 'utf-8')
  const lines = content.split(/\r?\n/).filter(l => l.trim())

  // Skip header
  const dataLines = lines.slice(1)
  console.log(`Rows in CSV (excl. header): ${dataLines.length}`)

  const state = await loadExistingData()
  console.log(`Existing accounts: ${state.accounts.size}, parent categories: ${state.parentCategories.size}, subcategories: ${state.subcatLookup.size}, already-imported UIDs: ${state.imported.size}\n`)

  const stats: Stats = {
    total: 0,
    imported: 0,
    skipped_dup: 0,
    skipped_init: 0,
    skipped_no_account: 0,
    skipped_no_uid: 0,
    errors: 0,
    unmapped_categories: new Set(),
  }

  for (const line of dataLines) {
    if (!line.trim()) continue
    const fields = parseCsvLine(line)
    const row = parseRow(fields)
    if (!row) {
      stats.errors++
      continue
    }
    try {
      await importRow(row, state, stats, dryRun)
    } catch (err) {
      stats.errors++
      console.error(`  Error on uid ${row.uid}:`, (err as Error).message)
    }
  }

  console.log('─'.repeat(40))
  console.log(`Total rows processed : ${stats.total}`)
  console.log(`Imported             : ${stats.imported}`)
  console.log(`Skipped (dup)        : ${stats.skipped_dup}`)
  console.log(`Skipped (init bal)   : ${stats.skipped_init}`)
  console.log(`Skipped (no account) : ${stats.skipped_no_account}`)
  console.log(`Skipped (no uid)     : ${stats.skipped_no_uid}`)
  console.log(`Errors               : ${stats.errors}`)

  if (stats.unmapped_categories.size > 0) {
    console.log(`\nUnmapped categories:`)
    for (const c of stats.unmapped_categories) {
      console.log(`  - ${c}`)
    }
  }

  if (!dryRun) {
    const txCount = await db.execute('SELECT COUNT(*) as c FROM transactions')
    const tagCount = await db.execute('SELECT COUNT(*) as c FROM transaction_tags')
    console.log(`\nDB verification: ${txCount.rows[0].c} transactions, ${tagCount.rows[0].c} transaction_tags`)
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(console.error)
}